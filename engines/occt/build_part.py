"""
Build STEP + STL from Unified Fab Studio kernel payload (JSON).
Requires: pip install cadquery

Phase 1 — extrude + revolve of closed profiles (loops + circles).
Phase 3 — optional postSolidOps: fillet/chamfer (all + directional select), shell (optional cap ±X/±Y/±Z + opposite-cap fallback),
    pattern_rectangular, pattern_circular, pattern_linear_3d, pattern_path (optional closedPath, alignToPathTangent),
    boolean_subtract_cylinder, boolean_union_box, boolean_subtract_box, boolean_intersect_box,
    boolean_combine_profile (union/subtract/intersect with extruded profile index; optional extrudeDirection +/-Z),
    split_keep_halfspace (axis plane split keep positive/negative side; non-trivial discard exports kernel-part-split-discard STEP/STL),
    hole_from_profile (cut from profile index, depth or through-all),
    thread_cosmetic (simplified ring-groove approximation, not true helical thread),
    transform_translate (move/copy body by XYZ translation),
    press_pull_profile (signed profile extrude: + union, - cut),
    sweep_profile_path (legacy translation-only sweep along XY path points),
    sweep_profile_path_true (orientation-follow sweep modes; discrete parallel-transport framing + segment overlap),
    pipe_path (partial circular section path sweep, optional wall thickness),
    thread_wizard (modeled 3D helix ball-chain tool path or cosmetic marker),
    thicken_offset (true offset via OCC shape offset; tolerance scales with body size),
    thicken_scale (partial isotropic scale surrogate; not true offset/thicken),
    coil_cut (partial helical-style stacked ring cuts, max 1024 ring instances),
    mirror_union_plane (union mirrored copy across YZ/XZ/XY), sheet_tab_union (ordered).
Phase 4 — loft: 2–16 closed profiles, uniform `loftSeparationMm` between consecutive sections (union of
    stacked two-profile lofts); per-segment smooth/ruled + winding retries; strategy tag notes multi count;
    sheet_tab_union (rectangular tab/boss on +Z for sheet-style workflows).
Sketch placement: optional `sketchPlane` (datum XY/XZ/YZ or face) matches renderer preview; applied after
    postSolidOps so STEP/STL align with Three.js (canonical build remains XY/+Z).
Validation: scalar mm fields in postSolidOps are checked for finiteness (NaN/±Inf) before CadQuery runs.

Stdout contract: emit exactly one JSON object on the last line (Electron parses the final
non-empty line from combined stdout/stderr). Do not print debug text to stdout.

Success:
  {"ok": true, "stepPath": "<abs>", "stlPath": "<abs>", "loftStrategy": "<tag>"?}

Failure:
  {"ok": false, "error": "<code>", "detail": "<message>"?}
"""
from __future__ import annotations

import copy
import json
import math
import sys
from pathlib import Path


def _emit_json(obj: dict, code: int) -> None:
    print(json.dumps(obj), file=sys.stdout, flush=True)
    sys.exit(code)


def _dedupe_consecutive(pts: list[tuple[float, float]], tol: float = 1e-9) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for x, y in pts:
        fx, fy = float(x), float(y)
        if not out or math.hypot(fx - out[-1][0], fy - out[-1][1]) > tol:
            out.append((fx, fy))
    return out


def _trim_closed_dup(pts: list[tuple[float, float]], tol: float = 1e-7) -> list[tuple[float, float]]:
    if len(pts) >= 2 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) <= tol:
        return pts[:-1]
    return pts


def _signed_loop_area(pts: list[tuple[float, float]]) -> float:
    if len(pts) < 3:
        return 0.0
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return 0.5 * a


def _reverse_loop(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return list(reversed(pts))


def _normalize_loop_profile(profile: dict) -> list[tuple[float, float]] | None:
    if profile.get("type") != "loop":
        return None
    raw = profile.get("points") or []
    pts = [(float(x), float(y)) for x, y in raw]
    pts = _dedupe_consecutive(pts)
    pts = _trim_closed_dup(pts)
    if len(pts) < 3:
        return None
    return pts


def _align_second_loop_winding(
    pts0: list[tuple[float, float]] | None, pts1: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    if pts0 is None:
        return pts1
    a0 = _signed_loop_area(pts0)
    a1 = _signed_loop_area(pts1)
    if a0 * a1 < 0:
        return _reverse_loop(pts1)
    return pts1


def _extrude_profiles(cq, profiles: list, depth: float):
    """Extrude each profile; loops use the same normalize/dedupe rules as loft."""
    solids = []
    for p in profiles:
        if not isinstance(p, dict):
            continue
        if p.get("type") == "circle":
            try:
                cx, cy, r = float(p["cx"]), float(p["cy"]), float(p["r"])
            except (KeyError, TypeError, ValueError):
                continue
            if r <= 0 or not math.isfinite(cx) or not math.isfinite(cy) or not math.isfinite(r):
                continue
            wp = cq.Workplane("XY").center(cx, cy).circle(r).extrude(depth)
            solids.append(wp)
        elif p.get("type") == "loop":
            pts = _normalize_loop_profile(p)
            if pts is None:
                continue
            wp = cq.Workplane("XY").polyline(pts).close().extrude(depth)
            solids.append(wp)
        else:
            continue
    if not solids:
        return None
    base = solids[0]
    for s in solids[1:]:
        base = base.union(s)
    return base


def _revolve_profiles(cq, profiles: list, angle_deg: float, axis_x: float):
    """Revolve first usable profile around Y axis through (axis_x, 0) on XY."""
    if not profiles:
        return None
    p = profiles[0]
    if not isinstance(p, dict):
        return None
    if p.get("type") == "circle":
        return None  # unsupported: use polygon approximation in TS if needed
    if p.get("type") != "loop":
        return None
    norm = _normalize_loop_profile(p)
    if norm is None:
        return None
    pts = [(float(x) - axis_x, float(y)) for x, y in norm]
    if len(pts) < 3:
        return None
    # Profile in XZ after mapping: (x,y) -> (radius, height) = (x - axisX, y) in sketch
    # Workplane XZ: X radius, Z height — map sketch Y -> Z, (x-axisX) -> X
    xz = [(max(px, 1e-6), py) for px, py in pts]
    wp = cq.Workplane("XZ").polyline(xz).close()
    axis_start = (0, -500, 0)
    axis_end = (0, 500, 0)
    solid = wp.revolve(angle_deg, axis_start, axis_end)
    return solid.translate((axis_x, 0, 0))


def _loft_once(cq, p0: dict, p1: dict, sep: float, ruled: bool, n0: list | None, n1: list | None):
    """Single loft attempt; n0/n1 are normalized loop vertices or None when profile is a circle."""
    wp = cq.Workplane("XY")
    if p0["type"] == "circle":
        wp = wp.center(float(p0["cx"]), float(p0["cy"])).circle(float(p0["r"]))
    elif p0["type"] == "loop":
        if not n0:
            return None
        wp = wp.polyline(n0).close()
    else:
        return None

    wp2 = wp.workplane(offset=sep)
    try:
        if p1["type"] == "circle":
            return wp2.center(float(p1["cx"]), float(p1["cy"])).circle(float(p1["r"])).loft(
                combine=True, ruled=ruled
            )
        if p1["type"] == "loop":
            if not n1:
                return None
            return wp2.polyline(n1).close().loft(combine=True, ruled=ruled)
    except TypeError:
        if p1["type"] == "circle":
            return wp2.center(float(p1["cx"]), float(p1["cy"])).circle(float(p1["r"])).loft(combine=True)
        if p1["type"] == "loop" and n1:
            return wp2.polyline(n1).close().loft(combine=True)
    return None


def _loft_two_profiles(cq, profiles: list, separation_mm: float):
    """
    Loft between profiles[0] and profiles[1]; second profile on plane offset +Z.
    Returns (solid | None, strategy | None). strategy is a short tag for manifest when loft succeeds.
    """
    if len(profiles) < 2:
        return None, None
    p0, p1 = profiles[0], profiles[1]
    sep = float(separation_mm)
    if sep <= 0:
        return None, None

    n0 = _normalize_loop_profile(p0) if p0.get("type") == "loop" else None
    n1_base = _normalize_loop_profile(p1) if p1.get("type") == "loop" else None
    if p0.get("type") == "loop" and n0 is None:
        return None, None
    if p1.get("type") == "loop" and n1_base is None:
        return None, None

    # Two windings for the second loop (skip when second is a circle)
    second_variants: list[tuple[str, list | None]] = []
    if n1_base is not None:
        aligned = _align_second_loop_winding(n0, n1_base)
        second_variants.append(("align", aligned))
        flipped = _reverse_loop(aligned)
        second_variants.append(("flip", flipped))
    else:
        second_variants.append(("circle", None))

    for ruled in (False, True):
        rlabel = "ruled" if ruled else "smooth"
        for tag, n1 in second_variants:
            solid = _loft_once(cq, p0, p1, sep, ruled, n0, n1)
            if solid is not None:
                return solid, f"{rlabel}+{tag}"
    return None, None


_LOFT_PROFILE_CAP = 16


def _loft_many_via_unions(cq, profiles: list, separation_mm: float):
    """
    Loft each consecutive pair (i, i+1), translate segment i by (0,0,i*sep), union.
    Reuses _loft_two_profiles winding logic per segment. Returns (solid | None, strategy | None).
    """
    if len(profiles) < 2:
        return None, None
    sep = float(separation_mm)
    if sep <= 0:
        return None, None
    acc = None
    tags: list[str] = []
    for i in range(len(profiles) - 1):
        pair = [profiles[i], profiles[i + 1]]
        solid, strat = _loft_two_profiles(cq, pair, sep)
        if solid is None:
            return None, None
        solid = solid.translate((0, 0, i * sep))
        tags.append(strat or "?")
        acc = solid if acc is None else acc.union(solid)
    n = len(profiles)
    strat = f"multi+union-chain:{n}:" + "+".join(tags)
    return acc, strat


# CadQuery face tags at axis extrema (same convention as fillet_select / chamfer_select).
_SHELL_CAP_SELECTORS: dict[str, tuple[str, str]] = {
    "+X": (">X", "<X"),
    "-X": ("<X", ">X"),
    "+Y": (">Y", "<Y"),
    "-Y": ("<Y", ">Y"),
    "+Z": (">Z", "<Z"),
    "-Z": ("<Z", ">Z"),
}


def _normalize_shell_open_direction(open_direction: str | None) -> str:
    if open_direction is None:
        return "+Z"
    s = str(open_direction).strip().upper()
    if s in _SHELL_CAP_SELECTORS:
        return s
    raise ValueError("shell_inward openDirection must be one of +X,-X,+Y,-Y,+Z,-Z when set")


def _shell_inward_on_cap(solid, thickness_mm: float, open_direction: str | None):
    """Remove one planar cap (selector by normal) and shell inward; try opposite cap on OCC failure."""
    t = float(thickness_mm)
    if t <= 0:
        raise ValueError("shell_inward requires positive thicknessMm")
    direction = _normalize_shell_open_direction(open_direction)
    primary, fallback = _SHELL_CAP_SELECTORS[direction]
    err_primary: str | None = None
    try:
        return solid.faces(primary).shell(-t)
    except Exception as e:  # noqa: BLE001
        err_primary = str(e)
    try:
        return solid.faces(fallback).shell(-t)
    except Exception as e2:  # noqa: BLE001
        raise ValueError(
            f"shell_inward failed for {direction} (thicknessMm={t}): "
            f"primary cap {primary} ({err_primary}); opposite {fallback} ({e2})"
        ) from e2


def _count_valid_profiles_for_extrude(profiles: list) -> int:
    n = 0
    for p in profiles:
        if not isinstance(p, dict):
            continue
        if p.get("type") == "circle":
            try:
                cx, cy, r = float(p["cx"]), float(p["cy"]), float(p["r"])
            except (KeyError, TypeError, ValueError):
                continue
            if r > 0 and math.isfinite(cx) and math.isfinite(cy) and math.isfinite(r):
                n += 1
        elif p.get("type") == "loop" and _normalize_loop_profile(p) is not None:
            n += 1
    return n


def _loft_profiles_valid(profiles: list) -> bool:
    if len(profiles) < 2 or len(profiles) > _LOFT_PROFILE_CAP:
        return False
    for p in profiles:
        if not isinstance(p, dict):
            return False
        t = p.get("type")
        if t not in ("circle", "loop"):
            return False
        if t == "loop" and _normalize_loop_profile(p) is None:
            return False
    return True


def _require_finite_mm(prefix: str, **fields: float) -> None:
    """Raise ValueError if any numeric mm field is non-finite (NaN/inf)."""
    for name, v in fields.items():
        if not math.isfinite(v):
            raise ValueError(f"{prefix} {name} must be finite")


def _format_post_op_failure(idx: int, kind, err: BaseException) -> str:
    """Stable prefix for invalid_payload / build_failed when a postSolidOp fails (validation or CadQuery)."""
    k = "<missing kind>" if kind is None else kind
    return f"postSolidOps[{idx}] kind={k!r}: {err}"


_PROFILE_INDEX_POST_OPS = frozenset(
    {
        "boolean_combine_profile",
        "hole_from_profile",
        "press_pull_profile",
        "sweep_profile_path",
        "sweep_profile_path_true",
    }
)


def _validate_post_solid_profile_indices(post_ops: list, profile_count: int) -> str | None:
    """Return invalid_payload detail if profileIndex is out of range; None if OK."""
    for idx, op in enumerate(post_ops):
        if not isinstance(op, dict):
            continue
        kind = op.get("kind")
        if kind not in _PROFILE_INDEX_POST_OPS:
            continue
        try:
            pidx = int(op.get("profileIndex", -1))
        except (TypeError, ValueError):
            return _format_post_op_failure(
                idx, kind, ValueError("profileIndex must be an integer")
            )
        if pidx < 0:
            continue
        if pidx >= profile_count:
            if profile_count == 0:
                detail = (
                    f"profileIndex {pidx} invalid: payload has no closed profiles — "
                    f"sketch must yield extractable profiles for {kind} (design/sketch + kernel payload)"
                )
            else:
                detail = (
                    f"profileIndex {pidx} out of range — use 0..{profile_count - 1} "
                    f"({profile_count} profile(s) in payload)"
                )
            return _format_post_op_failure(idx, kind, ValueError(detail))
    return None


def _validate_post_solid_ops(ops: list) -> str | None:
    """Return error detail if postSolidOps are structurally invalid; None if OK."""
    if not isinstance(ops, list):
        return "postSolidOps must be a list"
    for idx, op in enumerate(ops):
        if not isinstance(op, dict):
            return f"postSolidOps[{idx}] must be an object"
        kind = op.get("kind")
        try:
            if kind == "fillet_all":
                r = float(op.get("radiusMm", 0))
                _require_finite_mm("fillet_all", radiusMm=r)
                if r <= 0:
                    raise ValueError("fillet_all requires positive radiusMm")
            elif kind == "chamfer_all":
                ln = float(op.get("lengthMm", 0))
                _require_finite_mm("chamfer_all", lengthMm=ln)
                if ln <= 0:
                    raise ValueError("chamfer_all requires positive lengthMm")
            elif kind == "fillet_select":
                r = float(op.get("radiusMm", 0))
                _require_finite_mm("fillet_select", radiusMm=r)
                if r <= 0:
                    raise ValueError("fillet_select requires positive radiusMm")
                d = str(op.get("edgeDirection", "")).strip().upper()
                if d not in ("+X", "-X", "+Y", "-Y", "+Z", "-Z"):
                    raise ValueError("fillet_select edgeDirection must be one of ±X/±Y/±Z")
            elif kind == "chamfer_select":
                ln = float(op.get("lengthMm", 0))
                _require_finite_mm("chamfer_select", lengthMm=ln)
                if ln <= 0:
                    raise ValueError("chamfer_select requires positive lengthMm")
                d = str(op.get("edgeDirection", "")).strip().upper()
                if d not in ("+X", "-X", "+Y", "-Y", "+Z", "-Z"):
                    raise ValueError("chamfer_select edgeDirection must be one of ±X/±Y/±Z")
            elif kind == "shell_inward":
                t = float(op.get("thicknessMm", 0))
                _require_finite_mm("shell_inward", thicknessMm=t)
                if t <= 0:
                    raise ValueError("shell_inward requires positive thicknessMm")
                d = op.get("openDirection")
                if d is not None:
                    _normalize_shell_open_direction(d)
            elif kind == "pattern_rectangular":
                cx = int(op.get("countX", 1))
                cy = int(op.get("countY", 1))
                if cx < 1 or cy < 1 or (cx == 1 and cy == 1):
                    raise ValueError("pattern_rectangular needs countX>1 or countY>1")
                if cx > 32 or cy > 32:
                    raise ValueError("pattern_rectangular count cap 32 per axis")
                sx = float(op.get("spacingXMm", 0))
                sy = float(op.get("spacingYMm", 0))
                _require_finite_mm("pattern_rectangular", spacingXMm=sx, spacingYMm=sy)
            elif kind == "pattern_circular":
                cnt = int(op.get("count", 0))
                if cnt < 2 or cnt > 32:
                    raise ValueError("pattern_circular needs 2<=count<=32")
                tot = float(op.get("totalAngleDeg", 360))
                if not math.isfinite(tot) or tot <= 0 or tot > 360.0001:
                    raise ValueError("totalAngleDeg must be in (0,360]")
                st = float(op.get("startAngleDeg", 0))
                pcx = float(op.get("centerXMm", 0))
                pcy = float(op.get("centerYMm", 0))
                _require_finite_mm(
                    "pattern_circular", startAngleDeg=st, centerXMm=pcx, centerYMm=pcy
                )
            elif kind == "boolean_subtract_cylinder":
                rr = float(op.get("radiusMm", 0))
                z0 = float(op.get("zMinMm", 0))
                z1 = float(op.get("zMaxMm", 0))
                ccx = float(op.get("centerXMm", 0))
                ccy = float(op.get("centerYMm", 0))
                _require_finite_mm(
                    "boolean_subtract_cylinder",
                    radiusMm=rr,
                    zMinMm=z0,
                    zMaxMm=z1,
                    centerXMm=ccx,
                    centerYMm=ccy,
                )
                if rr <= 0 or z1 <= z0:
                    raise ValueError("boolean_subtract_cylinder invalid radius or Z range")
            elif kind == "boolean_union_box":
                x0, x1 = float(op.get("xMinMm", 0)), float(op.get("xMaxMm", 0))
                y0, y1 = float(op.get("yMinMm", 0)), float(op.get("yMaxMm", 0))
                z0, z1 = float(op.get("zMinMm", 0)), float(op.get("zMaxMm", 0))
                _require_finite_mm(
                    "boolean_union_box",
                    xMinMm=x0,
                    xMaxMm=x1,
                    yMinMm=y0,
                    yMaxMm=y1,
                    zMinMm=z0,
                    zMaxMm=z1,
                )
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_union_box invalid axis ranges")
            elif kind == "boolean_subtract_box":
                x0, x1 = float(op.get("xMinMm", 0)), float(op.get("xMaxMm", 0))
                y0, y1 = float(op.get("yMinMm", 0)), float(op.get("yMaxMm", 0))
                z0, z1 = float(op.get("zMinMm", 0)), float(op.get("zMaxMm", 0))
                _require_finite_mm(
                    "boolean_subtract_box",
                    xMinMm=x0,
                    xMaxMm=x1,
                    yMinMm=y0,
                    yMaxMm=y1,
                    zMinMm=z0,
                    zMaxMm=z1,
                )
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_subtract_box invalid axis ranges")
            elif kind == "sheet_tab_union":
                ln = float(op.get("lengthMm", 0))
                wd = float(op.get("widthMm", 0))
                ht = float(op.get("heightMm", 0))
                tcx = float(op.get("centerXMm", 0))
                tcy = float(op.get("centerYMm", 0))
                tzb = float(op.get("zBaseMm", 0))
                _require_finite_mm(
                    "sheet_tab_union",
                    lengthMm=ln,
                    widthMm=wd,
                    heightMm=ht,
                    centerXMm=tcx,
                    centerYMm=tcy,
                    zBaseMm=tzb,
                )
                if ln <= 0 or wd <= 0 or ht <= 0:
                    raise ValueError("sheet_tab_union requires positive lengthMm, widthMm, heightMm")
            elif kind == "sheet_fold":
                yb = float(op.get("bendLineYMm", 0))
                br = float(op.get("bendRadiusMm", 0))
                ba = float(op.get("bendAngleDeg", 0))
                kf = float(op.get("kFactor", 0.44))
                _require_finite_mm(
                    "sheet_fold",
                    bendLineYMm=yb,
                    bendRadiusMm=br,
                    bendAngleDeg=ba,
                    kFactor=kf,
                )
                if br <= 0:
                    raise ValueError("sheet_fold bendRadiusMm must be positive")
                if abs(ba) < 1 or abs(ba) > 170:
                    raise ValueError("sheet_fold bendAngleDeg must satisfy 1<=|angle|<=170")
                if kf < 0 or kf > 1:
                    raise ValueError("sheet_fold kFactor must be in [0,1]")
                mode = str(op.get("bendAllowanceMode", "k_factor")).strip().lower()
                if mode not in ("k_factor", "allowance_mm", "deduction_mm"):
                    raise ValueError("sheet_fold bendAllowanceMode must be k_factor, allowance_mm, or deduction_mm")
                am = op.get("allowanceMm")
                if am is not None and (not math.isfinite(float(am)) or float(am) <= 0):
                    raise ValueError("sheet_fold allowanceMm must be finite and > 0 when set")
                dm = op.get("deductionMm")
                if dm is not None and (not math.isfinite(float(dm)) or float(dm) <= 0):
                    raise ValueError("sheet_fold deductionMm must be finite and > 0 when set")
            elif kind == "sheet_flat_pattern":
                bool(op.get("includeBendLines", True))
            elif kind == "loft_guide_rails":
                rails = op.get("rails")
                if not isinstance(rails, list) or len(rails) < 1 or len(rails) > 4:
                    raise ValueError("loft_guide_rails rails must be a list of 1..4 rails")
                for ridx, rail in enumerate(rails):
                    if not isinstance(rail, list) or len(rail) < 2:
                        raise ValueError(f"loft_guide_rails rails[{ridx}] needs >=2 points")
                    prev = None
                    non_zero = False
                    for p in rail:
                        if not isinstance(p, (list, tuple)) or len(p) != 2:
                            raise ValueError(f"loft_guide_rails rails[{ridx}] entries must be [x,y]")
                        x, y = float(p[0]), float(p[1])
                        if not (math.isfinite(x) and math.isfinite(y)):
                            raise ValueError(f"loft_guide_rails rails[{ridx}] must be finite")
                        if prev is not None and (x != prev[0] or y != prev[1]):
                            non_zero = True
                        prev = (x, y)
                    if not non_zero:
                        raise ValueError(f"loft_guide_rails rails[{ridx}] needs at least one non-zero segment")
            elif kind == "plastic_rule_fillet":
                rr = float(op.get("radiusMm", 0))
                _require_finite_mm("plastic_rule_fillet", radiusMm=rr)
                if rr <= 0:
                    raise ValueError("plastic_rule_fillet radiusMm must be positive")
            elif kind == "plastic_boss":
                cx = float(op.get("centerXMm", 0))
                cy = float(op.get("centerYMm", 0))
                z0 = float(op.get("zBaseMm", 0))
                ro = float(op.get("outerRadiusMm", 0))
                hh = float(op.get("heightMm", 0))
                dr = float(op.get("draftDeg", 1))
                _require_finite_mm(
                    "plastic_boss",
                    centerXMm=cx,
                    centerYMm=cy,
                    zBaseMm=z0,
                    outerRadiusMm=ro,
                    heightMm=hh,
                    draftDeg=dr,
                )
                if ro <= 0 or hh <= 0:
                    raise ValueError("plastic_boss outerRadiusMm and heightMm must be positive")
                if dr < 0 or dr > 8:
                    raise ValueError("plastic_boss draftDeg must be in [0,8]")
                hr = op.get("holeRadiusMm")
                if hr is not None and (not math.isfinite(float(hr)) or float(hr) <= 0):
                    raise ValueError("plastic_boss holeRadiusMm must be finite and >0 when set")
            elif kind == "plastic_lip_groove":
                mode = str(op.get("mode", "")).strip().lower()
                if mode not in ("lip", "groove"):
                    raise ValueError("plastic_lip_groove mode must be lip or groove")
                x0, x1 = float(op.get("xMinMm", 0)), float(op.get("xMaxMm", 0))
                y0, y1 = float(op.get("yMinMm", 0)), float(op.get("yMaxMm", 0))
                z0 = float(op.get("zBaseMm", 0))
                dd = float(op.get("depthMm", 0))
                _require_finite_mm(
                    "plastic_lip_groove",
                    xMinMm=x0,
                    xMaxMm=x1,
                    yMinMm=y0,
                    yMaxMm=y1,
                    zBaseMm=z0,
                    depthMm=dd,
                )
                if x1 <= x0 or y1 <= y0 or dd <= 0:
                    raise ValueError("plastic_lip_groove requires x/y ranges and positive depthMm")
            elif kind == "pattern_linear_3d":
                cnt = int(op.get("count", 0))
                if cnt < 2 or cnt > 32:
                    raise ValueError("pattern_linear_3d needs 2<=count<=32")
                dx = float(op.get("dxMm", 0))
                dy = float(op.get("dyMm", 0))
                dz = float(op.get("dzMm", 0))
                _require_finite_mm("pattern_linear_3d", dxMm=dx, dyMm=dy, dzMm=dz)
                if dx == 0 and dy == 0 and dz == 0:
                    raise ValueError("pattern_linear_3d needs non-zero step")
            elif kind == "pattern_path":
                cnt = int(op.get("count", 0))
                if cnt < 2 or cnt > 32:
                    raise ValueError("pattern_path needs 2<=count<=32")
                pts = op.get("pathPoints")
                if not isinstance(pts, list) or len(pts) < 2:
                    raise ValueError("pattern_path pathPoints needs >= 2 points")
                closed_path = bool(op.get("closedPath", False))
                if closed_path and len(pts) < 3:
                    raise ValueError(
                        "pattern_path closedPath requires at least 3 path points"
                    )
                prev = None
                non_zero = False
                for p in pts:
                    if not isinstance(p, (list, tuple)) or len(p) != 2:
                        raise ValueError("pattern_path pathPoints entries must be [x,y]")
                    x, y = float(p[0]), float(p[1])
                    if not (math.isfinite(x) and math.isfinite(y)):
                        raise ValueError("pattern_path pathPoints must be finite")
                    if prev is not None and (x != prev[0] or y != prev[1]):
                        non_zero = True
                    prev = (x, y)
                if not non_zero:
                    raise ValueError("pattern_path needs at least one non-zero segment")
                if "alignToPathTangent" in op and not isinstance(
                    op.get("alignToPathTangent"), bool
                ):
                    raise ValueError("pattern_path alignToPathTangent must be boolean")
            elif kind == "mirror_union_plane":
                pl = str(op.get("plane", "")).strip().upper()
                if pl not in ("YZ", "XZ", "XY"):
                    raise ValueError("mirror_union_plane plane must be YZ, XZ, or XY")
                mox = float(op.get("originXMm", 0))
                moy = float(op.get("originYMm", 0))
                moz = float(op.get("originZMm", 0))
                _require_finite_mm(
                    "mirror_union_plane", originXMm=mox, originYMm=moy, originZMm=moz
                )
            elif kind == "boolean_intersect_box":
                x0, x1 = float(op.get("xMinMm", 0)), float(op.get("xMaxMm", 0))
                y0, y1 = float(op.get("yMinMm", 0)), float(op.get("yMaxMm", 0))
                z0, z1 = float(op.get("zMinMm", 0)), float(op.get("zMaxMm", 0))
                _require_finite_mm(
                    "boolean_intersect_box",
                    xMinMm=x0,
                    xMaxMm=x1,
                    yMinMm=y0,
                    yMaxMm=y1,
                    zMinMm=z0,
                    zMaxMm=z1,
                )
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_intersect_box invalid axis ranges")
            elif kind == "boolean_combine_profile":
                mode = str(op.get("mode", "")).strip().lower()
                if mode not in ("union", "subtract", "intersect"):
                    raise ValueError("boolean_combine_profile mode must be union, subtract, or intersect")
                pidx = int(op.get("profileIndex", -1))
                if pidx < 0:
                    raise ValueError("boolean_combine_profile profileIndex must be >= 0")
                depth = float(op.get("extrudeDepthMm", 0))
                if not math.isfinite(depth) or depth <= 0:
                    raise ValueError("boolean_combine_profile extrudeDepthMm must be positive")
                zs = float(op.get("zStartMm", 0))
                _require_finite_mm("boolean_combine_profile", zStartMm=zs)
                ed = str(op.get("extrudeDirection", "+Z")).strip().upper()
                if ed not in ("+Z", "-Z"):
                    raise ValueError(
                        "boolean_combine_profile extrudeDirection must be +Z or -Z"
                    )
            elif kind == "split_keep_halfspace":
                ax = str(op.get("axis", "")).strip().upper()
                if ax not in ("X", "Y", "Z"):
                    raise ValueError("split_keep_halfspace axis must be X, Y, or Z")
                keep = str(op.get("keep", "")).strip().lower()
                if keep not in ("positive", "negative"):
                    raise ValueError("split_keep_halfspace keep must be positive or negative")
                off = float(op.get("offsetMm", 0))
                _require_finite_mm("split_keep_halfspace", offsetMm=off)
            elif kind == "hole_from_profile":
                pidx = int(op.get("profileIndex", -1))
                if pidx < 0:
                    raise ValueError("hole_from_profile profileIndex must be >= 0")
                mode = str(op.get("mode", "")).strip().lower()
                if mode not in ("depth", "through_all"):
                    raise ValueError("hole_from_profile mode must be depth or through_all")
                if mode == "depth":
                    depth = float(op.get("depthMm", 0))
                    if not math.isfinite(depth) or depth <= 0:
                        raise ValueError("hole_from_profile depth mode requires positive depthMm")
                hzs = float(op.get("zStartMm", 0))
                _require_finite_mm("hole_from_profile", zStartMm=hzs)
            elif kind == "thread_cosmetic":
                rr = float(op.get("majorRadiusMm", 0))
                p = float(op.get("pitchMm", 0))
                ln = float(op.get("lengthMm", 0))
                d = float(op.get("depthMm", 0))
                tcx = float(op.get("centerXMm", 0))
                tcy = float(op.get("centerYMm", 0))
                tzs = float(op.get("zStartMm", 0))
                _require_finite_mm(
                    "thread_cosmetic",
                    majorRadiusMm=rr,
                    pitchMm=p,
                    lengthMm=ln,
                    depthMm=d,
                    centerXMm=tcx,
                    centerYMm=tcy,
                    zStartMm=tzs,
                )
                if rr <= 0 or p <= 0 or ln <= 0 or d <= 0:
                    raise ValueError("thread_cosmetic requires positive radius/pitch/length/depth")
            elif kind == "transform_translate":
                tdx = float(op.get("dxMm", 0))
                tdy = float(op.get("dyMm", 0))
                tdz = float(op.get("dzMm", 0))
                _require_finite_mm("transform_translate", dxMm=tdx, dyMm=tdy, dzMm=tdz)
                bool(op.get("keepOriginal", False))
            elif kind == "press_pull_profile":
                pidx = int(op.get("profileIndex", -1))
                if pidx < 0:
                    raise ValueError("press_pull_profile profileIndex must be >= 0")
                d = float(op.get("deltaMm", 0))
                ppzs = float(op.get("zStartMm", 0))
                _require_finite_mm("press_pull_profile", deltaMm=d, zStartMm=ppzs)
                if d == 0:
                    raise ValueError("press_pull_profile requires non-zero deltaMm")
            elif kind == "sweep_profile_path":
                pidx = int(op.get("profileIndex", -1))
                if pidx < 0:
                    raise ValueError("sweep_profile_path profileIndex must be >= 0")
                pts = op.get("pathPoints")
                if not isinstance(pts, list) or len(pts) < 2:
                    raise ValueError("sweep_profile_path pathPoints needs >= 2 points")
                prev = None
                non_zero = False
                for p in pts:
                    if not isinstance(p, (list, tuple)) or len(p) != 2:
                        raise ValueError("sweep_profile_path pathPoints entries must be [x,y]")
                    x, y = float(p[0]), float(p[1])
                    if not (math.isfinite(x) and math.isfinite(y)):
                        raise ValueError("sweep_profile_path pathPoints must be finite")
                    if prev is not None and (x != prev[0] or y != prev[1]):
                        non_zero = True
                    prev = (x, y)
                if not non_zero:
                    raise ValueError("sweep_profile_path needs at least one non-zero segment")
                swzs = float(op.get("zStartMm", 0))
                _require_finite_mm("sweep_profile_path", zStartMm=swzs)
            elif kind == "sweep_profile_path_true":
                pidx = int(op.get("profileIndex", -1))
                if pidx < 0:
                    raise ValueError("sweep_profile_path_true profileIndex must be >= 0")
                pts = op.get("pathPoints")
                if not isinstance(pts, list) or len(pts) < 2:
                    raise ValueError("sweep_profile_path_true pathPoints needs >= 2 points")
                prev = None
                non_zero = False
                for p in pts:
                    if not isinstance(p, (list, tuple)) or len(p) != 2:
                        raise ValueError("sweep_profile_path_true pathPoints entries must be [x,y]")
                    x, y = float(p[0]), float(p[1])
                    if not (math.isfinite(x) and math.isfinite(y)):
                        raise ValueError("sweep_profile_path_true pathPoints must be finite")
                    if prev is not None and (x != prev[0] or y != prev[1]):
                        non_zero = True
                    prev = (x, y)
                if not non_zero:
                    raise ValueError("sweep_profile_path_true needs at least one non-zero segment")
                swzs = float(op.get("zStartMm", 0))
                _require_finite_mm("sweep_profile_path_true", zStartMm=swzs)
                om = str(op.get("orientationMode", "frenet")).strip().lower()
                if om not in ("fixed_normal", "frenet", "path_tangent_lock"):
                    raise ValueError("sweep_profile_path_true orientationMode must be fixed_normal, frenet, or path_tangent_lock")
                if om == "fixed_normal":
                    n = _vec3_from_json(op.get("fixedNormal"), "fixedNormal")
                    if n is None or _v3_norm(n[0], n[1], n[2]) is None:
                        raise ValueError("sweep_profile_path_true fixedNormal must be [x,y,z] non-zero")
            elif kind == "pipe_path":
                pts = op.get("pathPoints")
                if not isinstance(pts, list) or len(pts) < 2:
                    raise ValueError("pipe_path pathPoints needs >= 2 points")
                prev = None
                non_zero = False
                for p in pts:
                    if not isinstance(p, (list, tuple)) or len(p) != 2:
                        raise ValueError("pipe_path pathPoints entries must be [x,y]")
                    x, y = float(p[0]), float(p[1])
                    if not (math.isfinite(x) and math.isfinite(y)):
                        raise ValueError("pipe_path pathPoints must be finite")
                    if prev is not None and (x != prev[0] or y != prev[1]):
                        non_zero = True
                    prev = (x, y)
                if not non_zero:
                    raise ValueError("pipe_path needs at least one non-zero segment")
                rr = float(op.get("outerRadiusMm", 0))
                pz = float(op.get("zStartMm", 0))
                wt_raw = op.get("wallThicknessMm")
                if wt_raw is not None:
                    wt = float(wt_raw)
                    _require_finite_mm(
                        "pipe_path", outerRadiusMm=rr, wallThicknessMm=wt, zStartMm=pz
                    )
                    if wt <= 0 or wt >= rr:
                        raise ValueError("pipe_path wallThicknessMm must satisfy 0 < wallThicknessMm < outerRadiusMm")
                else:
                    _require_finite_mm("pipe_path", outerRadiusMm=rr, zStartMm=pz)
                if rr <= 0:
                    raise ValueError("pipe_path requires positive outerRadiusMm")
            elif kind == "thicken_scale":
                d = float(op.get("deltaMm", 0))
                _require_finite_mm("thicken_scale", deltaMm=d)
                if d == 0:
                    raise ValueError("thicken_scale requires non-zero deltaMm")
            elif kind == "thicken_offset":
                d = float(op.get("distanceMm", 0))
                _require_finite_mm("thicken_offset", distanceMm=d)
                if d == 0:
                    raise ValueError("thicken_offset requires non-zero distanceMm")
                side = str(op.get("side", "outward")).strip().lower()
                if side not in ("outward", "inward", "both"):
                    raise ValueError("thicken_offset side must be outward, inward, or both")
            elif kind == "thread_wizard":
                rr = float(op.get("majorRadiusMm", 0))
                p = float(op.get("pitchMm", 0))
                ln = float(op.get("lengthMm", 0))
                d = float(op.get("depthMm", 0))
                tcx = float(op.get("centerXMm", 0))
                tcy = float(op.get("centerYMm", 0))
                tzs = float(op.get("zStartMm", 0))
                _require_finite_mm(
                    "thread_wizard",
                    majorRadiusMm=rr,
                    pitchMm=p,
                    lengthMm=ln,
                    depthMm=d,
                    centerXMm=tcx,
                    centerYMm=tcy,
                    zStartMm=tzs,
                )
                if rr <= 0 or p <= 0 or ln <= 0 or d <= 0:
                    raise ValueError("thread_wizard requires positive radius/pitch/length/depth")
                mode = str(op.get("mode", "modeled")).strip().lower()
                if mode not in ("modeled", "cosmetic"):
                    raise ValueError("thread_wizard mode must be modeled or cosmetic")
                hand = str(op.get("hand", "right")).strip().lower()
                if hand not in ("right", "left"):
                    raise ValueError("thread_wizard hand must be right or left")
                starts = int(op.get("starts", 1))
                if starts < 1 or starts > 8:
                    raise ValueError("thread_wizard starts must be 1..8")
            elif kind == "coil_cut":
                rr = float(op.get("majorRadiusMm", 0))
                p = float(op.get("pitchMm", 0))
                t = float(op.get("turns", 0))
                d = float(op.get("depthMm", 0))
                ccx = float(op.get("centerXMm", 0))
                ccy = float(op.get("centerYMm", 0))
                czs = float(op.get("zStartMm", 0))
                _require_finite_mm(
                    "coil_cut",
                    majorRadiusMm=rr,
                    pitchMm=p,
                    turns=t,
                    depthMm=d,
                    centerXMm=ccx,
                    centerYMm=ccy,
                    zStartMm=czs,
                )
                if rr <= 0 or p <= 0 or t <= 0 or d <= 0:
                    raise ValueError("coil_cut requires positive radius/pitch/turns/depth")
            else:
                raise ValueError(f"unknown postSolidOp kind {kind!r}")
        except Exception as e:  # noqa: BLE001
            return _format_post_op_failure(idx, kind, e)
    return None


def _validate_kernel_payload(data: dict, solid_kind: str, profiles: list, post_ops: list) -> str | None:
    """Return detail string for invalid_payload, or None."""
    v = _validate_post_solid_ops(post_ops)
    if v:
        return v
    if not isinstance(profiles, list):
        return "profiles must be a list"
    pi_err = _validate_post_solid_profile_indices(post_ops, len(profiles))
    if pi_err:
        return pi_err
    if solid_kind == "extrude":
        if len(profiles) == 0:
            return "extrude requires at least one profile"
        if _count_valid_profiles_for_extrude(profiles) == 0:
            return "extrude has no valid profiles (need loop with ≥3 non-degenerate points or circle with r>0)"
    elif solid_kind == "revolve":
        if len(profiles) == 0:
            return "revolve requires at least one profile"
        p0 = profiles[0]
        if not isinstance(p0, dict):
            return "revolve requires first profile to be an object"
        if p0.get("type") == "circle":
            return "revolve does not support circle profiles in kernel; use a closed loop"
        if p0.get("type") != "loop":
            return "revolve requires first profile type loop"
        if _normalize_loop_profile(p0) is None:
            return "revolve first loop is invalid (need ≥3 non-degenerate points)"
    elif solid_kind == "loft":
        if len(profiles) < 2:
            return "loft requires at least two profiles"
        if len(profiles) > _LOFT_PROFILE_CAP:
            return f"loft supports at most {_LOFT_PROFILE_CAP} profiles"
        if not _loft_profiles_valid(profiles):
            return "loft profiles invalid (need circle or closed loop with ≥3 points on each profile)"
    return None


def _validate_solid_kind_numeric(data: dict, solid_kind: str) -> str | None:
    if solid_kind == "extrude":
        try:
            d = float(data.get("extrudeDepthMm", 10))
        except (TypeError, ValueError):
            return "extrudeDepthMm must be a number"
        if d <= 0 or not math.isfinite(d):
            return "extrudeDepthMm must be a finite positive number (mm)"
    elif solid_kind == "revolve":
        rev = data.get("revolve") if isinstance(data.get("revolve"), dict) else {}
        try:
            angle = float(rev.get("angleDeg", 360))
            axis_x = float(rev.get("axisX", 0))
        except (TypeError, ValueError):
            return "revolve.angleDeg and revolve.axisX must be numbers"
        if not math.isfinite(angle) or angle <= 0:
            return "revolve.angleDeg must be a finite positive number"
        if not math.isfinite(axis_x):
            return "revolve.axisX must be finite"
    elif solid_kind == "loft":
        try:
            sep = float(data.get("loftSeparationMm", 20))
        except (TypeError, ValueError):
            return "loftSeparationMm must be a number"
        if sep <= 0 or not math.isfinite(sep):
            return "loftSeparationMm must be a finite positive number (mm)"
    return None


def _rotate_solid_around_z_mm(solid, pivot_x: float, pivot_y: float, angle_deg: float):
    """Rotate solid around line parallel to +Z through (pivot_x, pivot_y, 0). angle_deg: CCW from +X in XY."""
    return (
        solid.translate((-pivot_x, -pivot_y, 0))
        .rotate((0, 0, 0), (0, 0, 1), float(angle_deg))
        .translate((pivot_x, pivot_y, 0))
    )


def _v3_norm(ax: float, ay: float, az: float) -> tuple[float, float, float] | None:
    h = math.sqrt(ax * ax + ay * ay + az * az)
    if h < 1e-10 or not math.isfinite(h):
        return None
    return ax / h, ay / h, az / h


def _v3_cross(
    ax: float, ay: float, az: float, bx: float, by: float, bz: float
) -> tuple[float, float, float]:
    return (
        ay * bz - az * by,
        az * bx - ax * bz,
        ax * by - ay * bx,
    )


def _v3_dot(ax: float, ay: float, az: float, bx: float, by: float, bz: float) -> float:
    return ax * bx + ay * by + az * bz


def _v3_parallel_transport_normal(
    nx: float, ny: float, nz: float, tx: float, ty: float, tz: float
) -> tuple[float, float, float] | None:
    """Project N onto the plane perpendicular to unit tangent T; normalize (or None if degenerate)."""
    d = _v3_dot(nx, ny, nz, tx, ty, tz)
    return _v3_norm(nx - d * tx, ny - d * ty, nz - d * tz)


def _polyline_sweep_segment_frame(
    orient: str,
    tx: float,
    ty: float,
    tz: float,
    prev_n: tuple[float, float, float] | None,
    fixed_n: tuple[float, float, float] | None,
) -> tuple[float, float, float, float, float, float, tuple[float, float, float]]:
    """
    Build orthonormal (B, N2, T): profile XY maps to (B, N2), extrude +Z maps to path tangent T.
    For frenet/path_tangent_lock, pass returned N2 back as prev_n on the next segment (parallel transport).
    For fixed_normal, pass fixed_n each time; prev_n is ignored.
    """
    if orient == "fixed_normal":
        if fixed_n is None:
            raise ValueError("fixed_normal requires fixedNormal")
        fx, fy, fz = fixed_n
        cand = _v3_parallel_transport_normal(fx, fy, fz, tx, ty, tz)
        if cand is None:
            raise ValueError("fixed_normal: fixedNormal is parallel to path tangent")
        nx, ny, nz = cand
    else:
        sx, sy, sz = (0.0, 0.0, 1.0) if prev_n is None else prev_n
        cand = _v3_parallel_transport_normal(sx, sy, sz, tx, ty, tz)
        if cand is None:
            for aux in ((0.0, 1.0, 0.0), (1.0, 0.0, 0.0), (0.0, 0.0, -1.0)):
                cand = _v3_parallel_transport_normal(aux[0], aux[1], aux[2], tx, ty, tz)
                if cand is not None:
                    break
        if cand is None:
            raise ValueError("could not resolve sweep normal vs path tangent")
        nx, ny, nz = cand

    b = _v3_cross(tx, ty, tz, nx, ny, nz)
    bn = _v3_norm(*b)
    if bn is None:
        raise ValueError("sweep frame binormal degenerate")
    bx, by, bz = bn
    n2 = _v3_cross(bx, by, bz, tx, ty, tz)
    nn2 = _v3_norm(*n2)
    if nn2 is None:
        raise ValueError("sweep frame normal degenerate")
    n2x, n2y, n2z = nn2
    return (bx, by, bz, n2x, n2y, n2z, (n2x, n2y, n2z))


def _vec3_from_json(v: object, label: str) -> tuple[float, float, float] | None:
    if not isinstance(v, (list, tuple)) or len(v) != 3:
        return None
    try:
        x, y, z = float(v[0]), float(v[1]), float(v[2])
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(t) for t in (x, y, z)):
        return None
    return x, y, z


def _validate_sketch_plane(plane: object) -> str | None:
    """Return invalid_payload detail, or None."""
    if not isinstance(plane, dict):
        return "sketchPlane must be an object"
    kind = plane.get("kind", "datum")
    if kind == "datum":
        d = str(plane.get("datum", "XY")).strip().upper()
        if d not in ("XY", "XZ", "YZ"):
            return "sketchPlane.datum must be XY, XZ, or YZ"
        return None
    if kind == "face":
        if _vec3_from_json(plane.get("origin"), "origin") is None:
            return "sketchPlane.face requires origin [x,y,z] (finite numbers)"
        if _vec3_from_json(plane.get("normal"), "normal") is None:
            return "sketchPlane.face requires normal [x,y,z] (finite numbers)"
        if _vec3_from_json(plane.get("xAxis"), "xAxis") is None:
            return "sketchPlane.face requires xAxis [x,y,z] (finite numbers)"
        n = _vec3_from_json(plane.get("normal"), "n")
        assert n is not None
        if _v3_norm(n[0], n[1], n[2]) is None:
            return "sketchPlane.face normal must be non-zero"
        return None
    return "sketchPlane.kind must be datum or face"


def _sketch_plane_gp_trsf(plane: dict):
    """
    Same basis as renderer `sketchPreviewPlacementMatrix`: canonical CadQuery XY/+Z extrude → world mm.
    """
    from OCP.gp import gp_Trsf

    kind = plane.get("kind", "datum")
    trsf = gp_Trsf()
    if kind == "datum":
        datum = str(plane.get("datum", "XY")).strip().upper()
        ox = oy = oz = 0.0
        if datum in ("XY", "XZ"):
            ux, uy, uz = 1.0, 0.0, 0.0
            vx, vy, vz = 0.0, 0.0, -1.0
            nx, ny, nz = 0.0, 1.0, 0.0
        elif datum == "YZ":
            ux, uy, uz = 0.0, 1.0, 0.0
            vx, vy, vz = 0.0, 0.0, 1.0
            nx, ny, nz = 1.0, 0.0, 0.0
        else:
            raise ValueError(f"invalid sketchPlane.datum {datum!r}")
        trsf.SetValues(
            ux,
            vx,
            nx,
            ox,
            uy,
            vy,
            ny,
            oy,
            uz,
            vz,
            nz,
            oz,
        )
        return trsf
    if kind == "face":
        o = _vec3_from_json(plane.get("origin"), "origin")
        n_raw = _vec3_from_json(plane.get("normal"), "normal")
        u_raw = _vec3_from_json(plane.get("xAxis"), "xAxis")
        if o is None or n_raw is None or u_raw is None:
            raise ValueError("face sketchPlane missing origin, normal, or xAxis")
        ox, oy, oz = o
        nn = _v3_norm(n_raw[0], n_raw[1], n_raw[2])
        if nn is None:
            raise ValueError("face sketchPlane normal is degenerate")
        nx, ny, nz = nn
        ux, uy, uz = u_raw[0], u_raw[1], u_raw[2]
        leg = _v3_norm(ux, uy, uz)
        if leg is None:
            ux, uy, uz = 1.0, 0.0, 0.0
        else:
            ux, uy, uz = leg
        d = _v3_dot(ux, uy, uz, nx, ny, nz)
        ux -= nx * d
        uy -= ny * d
        uz -= nz * d
        leg = _v3_norm(ux, uy, uz)
        if leg is None:
            ux, uy, uz = 0.0, 1.0, 0.0
            d = _v3_dot(ux, uy, uz, nx, ny, nz)
            ux -= nx * d
            uy -= ny * d
            uz -= nz * d
            leg = _v3_norm(ux, uy, uz)
        if leg is None:
            ux, uy, uz = 0.0, 0.0, 1.0
        else:
            ux, uy, uz = leg
        vx, vy, vz = _v3_cross(nx, ny, nz, ux, uy, uz)
        leg = _v3_norm(vx, vy, vz)
        if leg is None:
            raise ValueError("face sketchPlane could not build tangent v = n×u")
        vx, vy, vz = leg
        cx, cy, cz = _v3_cross(ux, uy, uz, vx, vy, vz)
        if _v3_dot(cx, cy, cz, nx, ny, nz) < 0:
            vx, vy, vz = -vx, -vy, -vz
        trsf.SetValues(
            ux,
            vx,
            nx,
            ox,
            uy,
            vy,
            ny,
            oy,
            uz,
            vz,
            nz,
            oz,
        )
        return trsf
    raise ValueError(f"invalid sketchPlane.kind {kind!r}")


def _cq_transform_solid_by_gp_trsf(cq, solid, trsf) -> object:
    """Apply OCCT transform to a CadQuery solid/compound (copy)."""
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform

    val = solid.val()
    wrapped = val.wrapped
    bt = BRepBuilderAPI_Transform(wrapped, trsf, True)
    out = bt.Shape()
    casted = cq.Shape.cast(out)
    return cq.Workplane("XY").newObject([casted])


def _extruded_tool_from_profile_index(
    cq,
    profiles: list,
    profile_index: int,
    depth_mm: float,
    z_start_mm: float,
    extrude_sign: float = 1.0,
):
    """Build tool body from one payload profile index; supports loop or circle.
    extrude_sign: +1 extrudes +Z, -1 extrudes -Z from the workplane at z_start_mm.
    """
    if profile_index < 0 or profile_index >= len(profiles):
        raise ValueError(f"profileIndex out of range: {profile_index}")
    p = profiles[profile_index]
    if not isinstance(p, dict):
        raise ValueError(f"profile[{profile_index}] is not an object")
    depth = float(depth_mm)
    if depth <= 0 or not math.isfinite(depth):
        raise ValueError("extrudeDepthMm must be finite and > 0")
    z0 = float(z_start_mm)
    if not math.isfinite(z0):
        raise ValueError("zStartMm must be finite")
    sign = -1.0 if float(extrude_sign) < 0 else 1.0
    ext = depth * sign
    wp = cq.Workplane("XY").workplane(offset=z0)
    if p.get("type") == "circle":
        cx, cy, rr = float(p.get("cx", 0)), float(p.get("cy", 0)), float(p.get("r", 0))
        if rr <= 0 or not all(math.isfinite(v) for v in (cx, cy, rr)):
            raise ValueError(f"profile[{profile_index}] circle is invalid")
        return wp.center(cx, cy).circle(rr).extrude(ext)
    if p.get("type") == "loop":
        pts = _normalize_loop_profile(p)
        if pts is None:
            raise ValueError(f"profile[{profile_index}] loop is invalid")
        return wp.polyline(pts).close().extrude(ext)
    raise ValueError(f"profile[{profile_index}] unsupported type {p.get('type')!r}")


def _halfspace_box_for_split(cq, solid, axis: str, offset_mm: float, keep: str):
    """Build large axis-aligned box representing one side of axis plane axis=offset."""
    bb = solid.val().BoundingBox()
    pad = max(bb.xlen, bb.ylen, bb.zlen, 1.0) * 2.0 + 10.0
    x0, x1 = bb.xmin - pad, bb.xmax + pad
    y0, y1 = bb.ymin - pad, bb.ymax + pad
    z0, z1 = bb.zmin - pad, bb.zmax + pad
    off = float(offset_mm)
    if axis == "X":
        if keep == "positive":
            x0 = max(x0, off)
        else:
            x1 = min(x1, off)
    elif axis == "Y":
        if keep == "positive":
            y0 = max(y0, off)
        else:
            y1 = min(y1, off)
    else:
        if keep == "positive":
            z0 = max(z0, off)
        else:
            z1 = min(z1, off)
    if x1 <= x0 or y1 <= y0 or z1 <= z0:
        raise ValueError("split_keep_halfspace produced empty keep region")
    cx = (x0 + x1) / 2.0
    cy = (y0 + y1) / 2.0
    cz = (z0 + z1) / 2.0
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0).translate((cx, cy, cz))


def _loft_rail_sketch_yaw_deg_from_ops(ops: list) -> float | None:
    """First non-suppressed loft_guide_rails rail segment defines −atan2(dy,dx) yaw in sketch XY (deg)."""
    for op in ops:
        if not isinstance(op, dict) or op.get("suppressed"):
            continue
        if op.get("kind") != "loft_guide_rails":
            continue
        if str(op.get("behavior", "")).strip().lower() == "marker":
            continue
        rails = op.get("rails")
        if not isinstance(rails, list) or len(rails) < 1:
            continue
        rail = rails[0]
        if not isinstance(rail, list) or len(rail) < 2:
            continue
        try:
            x0, y0 = float(rail[0][0]), float(rail[0][1])
            x1, y1 = float(rail[1][0]), float(rail[1][1])
        except (TypeError, ValueError, IndexError):
            continue
        dx, dy = x1 - x0, y1 - y0
        if math.hypot(dx, dy) < 1e-9:
            continue
        return -math.degrees(math.atan2(dy, dx))
    return None


def _profiles_clone_with_yaw_second(profiles: list, yaw_deg: float) -> list:
    """Deep-copy profiles and rotate the second profile in XY about the sketch origin."""
    out = copy.deepcopy(profiles)
    if len(out) < 2:
        return out
    rad = math.radians(float(yaw_deg))
    c, s = math.cos(rad), math.sin(rad)

    def rot_xy(x: float, y: float) -> tuple[float, float]:
        return (c * x - s * y, s * x + c * y)

    p1 = out[1]
    if isinstance(p1, dict) and p1.get("type") == "loop":
        n = _normalize_loop_profile(p1)
        if n:
            p1["points"] = [[rot_xy(a, b)[0], rot_xy(a, b)[1]] for a, b in n]
    elif isinstance(p1, dict) and p1.get("type") == "circle":
        cx, cy = float(p1.get("cx", 0)), float(p1.get("cy", 0))
        ncx, ncy = rot_xy(cx, cy)
        p1["cx"], p1["cy"] = ncx, ncy
    return out


def _hole_depth_from_mode(solid, mode: str, depth_mm: float | None) -> float:
    bb = solid.val().BoundingBox()
    span = max(bb.xlen, bb.ylen, bb.zlen, 1.0)
    if mode == "through_all":
        return span * 4.0 + 20.0
    if depth_mm is None:
        raise ValueError("hole_from_profile depth mode requires depthMm")
    d = float(depth_mm)
    if d <= 0 or not math.isfinite(d):
        raise ValueError("hole_from_profile depthMm must be finite and > 0")
    return d


def _path_points_from_op(op: dict, label: str) -> list[tuple[float, float]]:
    pts = op.get("pathPoints")
    if not isinstance(pts, list) or len(pts) < 2:
        raise ValueError(f"{label} pathPoints needs >= 2 points")
    out: list[tuple[float, float]] = []
    for p in pts:
        if not isinstance(p, (list, tuple)) or len(p) != 2:
            raise ValueError(f"{label} pathPoints entries must be [x,y]")
        x, y = float(p[0]), float(p[1])
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError(f"{label} pathPoints must be finite")
        if not out or out[-1][0] != x or out[-1][1] != y:
            out.append((x, y))
    if len(out) < 2:
        raise ValueError(f"{label} path collapsed to zero-length")
    return out


def _sweep_profile_path_true(cq, profiles: list, op: dict):
    profile_index = int(op.get("profileIndex", -1))
    path_pts = _path_points_from_op(op, "sweep_profile_path_true")
    z0 = float(op.get("zStartMm", 0))
    if not math.isfinite(z0):
        raise ValueError("sweep_profile_path_true zStartMm must be finite")
    orient = str(op.get("orientationMode", "frenet")).strip().lower()
    if orient not in ("fixed_normal", "frenet", "path_tangent_lock"):
        raise ValueError("sweep_profile_path_true orientationMode must be fixed_normal, frenet, or path_tangent_lock")
    fixed_n: tuple[float, float, float] | None = None
    if orient == "fixed_normal":
        n_raw = _vec3_from_json(op.get("fixedNormal"), "fixedNormal")
        if n_raw is None:
            raise ValueError("sweep_profile_path_true fixed_normal requires fixedNormal [x,y,z]")
        fn = _v3_norm(n_raw[0], n_raw[1], n_raw[2])
        if fn is None:
            raise ValueError("sweep_profile_path_true fixedNormal must be non-zero")
        fixed_n = fn

    from OCP.gp import gp_Trsf
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform

    acc = None
    prev_n: tuple[float, float, float] | None = None
    for i in range(1, len(path_pts)):
        x0, y0 = path_pts[i - 1]
        x1, y1 = path_pts[i]
        dx = x1 - x0
        dy = y1 - y0
        seg_len = math.hypot(dx, dy)
        if seg_len <= 1e-9:
            continue
        tx, ty, tz = dx / seg_len, dy / seg_len, 0.0
        bx, by, bz, n2x, n2y, n2z, new_prev = _polyline_sweep_segment_frame(
            orient, tx, ty, tz, prev_n, fixed_n
        )
        if orient != "fixed_normal":
            prev_n = new_prev

        # Tiny overlap along tangent helps B-rep union close at polyline vertices.
        overlap = min(2e-4, max(1e-7, seg_len * 2e-5))
        extrude_len = seg_len + overlap
        seg = _extruded_tool_from_profile_index(cq, profiles, profile_index, extrude_len, z0)
        # Local basis: U=X(profile X), V=Y(profile Y), N=+Z(extrude) -> mapped to (B, N2, T)
        tr = gp_Trsf()
        tr.SetValues(
            bx,
            n2x,
            tx,
            x0,
            by,
            n2y,
            ty,
            y0,
            bz,
            n2z,
            tz,
            z0,
        )
        wrapped = seg.val().wrapped
        bt = BRepBuilderAPI_Transform(wrapped, tr, True)
        out = cq.Shape.cast(bt.Shape())
        seg_world = cq.Workplane("XY").newObject([out])
        acc = seg_world if acc is None else acc.union(seg_world)
    if acc is None:
        raise ValueError("sweep_profile_path_true has zero effective length")
    return acc


def _thread_wizard_apply(cq, solid, op: dict):
    mode = str(op.get("mode", "modeled")).strip().lower()
    if mode not in ("modeled", "cosmetic"):
        raise ValueError("thread_wizard mode must be modeled or cosmetic")
    if mode == "cosmetic":
        return solid
    cx = float(op.get("centerXMm", 0))
    cy = float(op.get("centerYMm", 0))
    r_major = float(op.get("majorRadiusMm", 0))
    pitch = float(op.get("pitchMm", 0))
    length = float(op.get("lengthMm", 0))
    depth = float(op.get("depthMm", 0))
    z0 = float(op.get("zStartMm", 0))
    starts = int(op.get("starts", 1))
    hand = str(op.get("hand", "right")).strip().lower()
    if hand not in ("right", "left"):
        raise ValueError("thread_wizard hand must be right or left")
    if starts < 1 or starts > 8:
        raise ValueError("thread_wizard starts must be 1..8")
    if r_major <= 0 or pitch <= 0 or length <= 0 or depth <= 0:
        raise ValueError("thread_wizard requires positive radius/pitch/length/depth")
    r_mean = max(1e-6, r_major - depth * 0.5)
    tool_r = max(0.015, min(depth * 0.45, pitch * 0.28, r_mean * 0.14))
    turns = length / pitch
    # Finer sampling on short pitches / multi-start; still capped for runtime.
    samples = max(
        48,
        min(
            2048,
            int(math.ceil(length / max(pitch / (16.0 * max(starts, 1)), 0.03))),
        ),
    )
    handed = 1.0 if hand == "right" else -1.0

    for s in range(starts):
        phase = (2.0 * math.pi * float(s)) / float(starts)
        for i in range(samples):
            u = i / max(1, samples - 1)
            ang = phase + handed * (2.0 * math.pi * turns * u)
            px = cx + math.cos(ang) * r_mean
            py = cy + math.sin(ang) * r_mean
            pz = z0 + u * length
            try:
                ball = cq.Workplane("XY").sphere(tool_r).translate((px, py, pz))
            except Exception:  # noqa: BLE001
                seg = (
                    cq.Workplane("XY")
                    .workplane(offset=pz - tool_r)
                    .center(px, py)
                    .circle(tool_r)
                    .extrude(2.0 * tool_r)
                )
                solid = solid.cut(seg)
            else:
                solid = solid.cut(ball)
    return solid


def _occt_offset_tol_mm(solid) -> float:
    """Scale OCC offset tolerance with model size (small parts keep ≥1e-3 mm; large bodies relax slightly)."""
    bb = solid.val().BoundingBox()
    d = math.sqrt(
        max(bb.xlen, 1e-12) ** 2 + max(bb.ylen, 1e-12) ** 2 + max(bb.zlen, 1e-12) ** 2
    )
    return max(1e-3, min(2.0, d * 5e-5))


def _thicken_offset_apply(cq, solid, op: dict):
    dist = float(op.get("distanceMm", 0))
    if not math.isfinite(dist) or abs(dist) < 1e-9:
        raise ValueError("thicken_offset distanceMm must be finite and non-zero")
    side = str(op.get("side", "outward")).strip().lower()
    if side not in ("outward", "inward", "both"):
        raise ValueError("thicken_offset side must be outward, inward, or both")
    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeOffsetShape
    from OCP.GeomAbs import GeomAbs_Intersection

    base_shape = solid.val().wrapped
    tol0 = _occt_offset_tol_mm(solid)

    def _offset_shape(amount: float, tol: float):
        mk = BRepOffsetAPI_MakeOffsetShape()
        mk.PerformByJoin(
            base_shape,
            float(amount),
            float(tol),
            0,
            False,
            False,
            GeomAbs_Intersection,
            False,
        )
        out = mk.Shape()
        casted = cq.Shape.cast(out)
        return cq.Workplane("XY").newObject([casted])

    mag = abs(dist)
    last_err: Exception | None = None
    for tol in (tol0, tol0 * 8.0, max(0.01, tol0 * 32.0), max(0.05, tol0 * 128.0)):
        try:
            if side == "outward":
                return _offset_shape(mag, tol)
            if side == "inward":
                return _offset_shape(-mag, tol)
            out_p = _offset_shape(mag, tol)
            out_n = _offset_shape(-mag, tol)
            return out_p.union(out_n)
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue
    assert last_err is not None
    raise ValueError(
        f"thicken_offset failed ({side}, distanceMm={dist}) after tolerance retries: {last_err}"
    ) from last_err


def _apply_post_solid_ops(
    cq, solid, ops: list, profiles: list, split_discard_out: list | None = None
):
    """Apply ordered CadQuery ops after base extrude/revolve/loft."""
    for idx, op in enumerate(ops):
        kind = op.get("kind")
        try:
            if kind == "fillet_all":
                r = float(op.get("radiusMm", 0))
                if r <= 0:
                    raise ValueError("fillet_all requires positive radiusMm")
                solid = solid.edges().fillet(r)
            elif kind == "chamfer_all":
                ln = float(op.get("lengthMm", 0))
                if ln <= 0:
                    raise ValueError("chamfer_all requires positive lengthMm")
                solid = solid.edges().chamfer(ln)
            elif kind == "fillet_select":
                r = float(op.get("radiusMm", 0))
                if r <= 0:
                    raise ValueError("fillet_select requires positive radiusMm")
                d = str(op.get("edgeDirection", "")).strip().upper()
                selector = {
                    "+X": ">X",
                    "-X": "<X",
                    "+Y": ">Y",
                    "-Y": "<Y",
                    "+Z": ">Z",
                    "-Z": "<Z",
                }.get(d)
                if selector is None:
                    raise ValueError("fillet_select edgeDirection must be one of ±X/±Y/±Z")
                solid = solid.edges(selector).fillet(r)
            elif kind == "chamfer_select":
                ln = float(op.get("lengthMm", 0))
                if ln <= 0:
                    raise ValueError("chamfer_select requires positive lengthMm")
                d = str(op.get("edgeDirection", "")).strip().upper()
                selector = {
                    "+X": ">X",
                    "-X": "<X",
                    "+Y": ">Y",
                    "-Y": "<Y",
                    "+Z": ">Z",
                    "-Z": "<Z",
                }.get(d)
                if selector is None:
                    raise ValueError("chamfer_select edgeDirection must be one of ±X/±Y/±Z")
                solid = solid.edges(selector).chamfer(ln)
            elif kind == "shell_inward":
                direction = op.get("openDirection")
                solid = _shell_inward_on_cap(solid, float(op.get("thicknessMm", 0)), direction)
            elif kind == "pattern_rectangular":
                cx = int(op.get("countX", 1))
                cy = int(op.get("countY", 1))
                if cx < 1 or cy < 1 or (cx == 1 and cy == 1):
                    raise ValueError("pattern_rectangular needs countX>1 or countY>1")
                if cx > 32 or cy > 32:
                    raise ValueError("pattern_rectangular count cap 32")
                dx = float(op.get("spacingXMm", 0))
                dy = float(op.get("spacingYMm", 0))
                base = solid
                for i in range(cx):
                    for j in range(cy):
                        if i == 0 and j == 0:
                            continue
                        solid = solid.union(base.translate((i * dx, j * dy, 0)))
            elif kind == "pattern_circular":
                cnt = int(op.get("count", 0))
                if cnt < 2 or cnt > 32:
                    raise ValueError("pattern_circular needs 2<=count<=32")
                ccx = float(op.get("centerXMm", 0))
                ccy = float(op.get("centerYMm", 0))
                total = float(op.get("totalAngleDeg", 360))
                if not math.isfinite(total) or total <= 0 or total > 360.0001:
                    raise ValueError("pattern_circular totalAngleDeg must be in (0,360]")
                start = float(op.get("startAngleDeg", 0))
                step = total / float(cnt)
                base = solid
                for i in range(1, cnt):
                    ang = start + i * step
                    solid = solid.union(_rotate_solid_around_z_mm(base, ccx, ccy, ang))
            elif kind == "boolean_subtract_cylinder":
                ccx = float(op.get("centerXMm", 0))
                ccy = float(op.get("centerYMm", 0))
                rr = float(op.get("radiusMm", 0))
                z0 = float(op.get("zMinMm", 0))
                z1 = float(op.get("zMaxMm", 0))
                if rr <= 0 or z1 <= z0:
                    raise ValueError("boolean_subtract_cylinder invalid radius or Z range")
                dz = z1 - z0
                tool = (
                    cq.Workplane("XY")
                    .workplane(offset=z0)
                    .center(ccx, ccy)
                    .circle(rr)
                    .extrude(dz)
                )
                solid = solid.cut(tool)
            elif kind == "boolean_union_box":
                x0 = float(op.get("xMinMm", 0))
                x1 = float(op.get("xMaxMm", 0))
                y0 = float(op.get("yMinMm", 0))
                y1 = float(op.get("yMaxMm", 0))
                z0 = float(op.get("zMinMm", 0))
                z1 = float(op.get("zMaxMm", 0))
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_union_box invalid axis ranges")
                cx = (x0 + x1) / 2.0
                cy = (y0 + y1) / 2.0
                cz = (z0 + z1) / 2.0
                dx = x1 - x0
                dy = y1 - y0
                dz = z1 - z0
                tool = cq.Workplane("XY").box(dx, dy, dz).translate((cx, cy, cz))
                solid = solid.union(tool)
            elif kind == "boolean_subtract_box":
                x0 = float(op.get("xMinMm", 0))
                x1 = float(op.get("xMaxMm", 0))
                y0 = float(op.get("yMinMm", 0))
                y1 = float(op.get("yMaxMm", 0))
                z0 = float(op.get("zMinMm", 0))
                z1 = float(op.get("zMaxMm", 0))
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_subtract_box invalid axis ranges")
                cx = (x0 + x1) / 2.0
                cy = (y0 + y1) / 2.0
                cz = (z0 + z1) / 2.0
                dx = x1 - x0
                dy = y1 - y0
                dz = z1 - z0
                tool = cq.Workplane("XY").box(dx, dy, dz).translate((cx, cy, cz))
                solid = solid.cut(tool)
            elif kind == "boolean_intersect_box":
                x0 = float(op.get("xMinMm", 0))
                x1 = float(op.get("xMaxMm", 0))
                y0 = float(op.get("yMinMm", 0))
                y1 = float(op.get("yMaxMm", 0))
                z0 = float(op.get("zMinMm", 0))
                z1 = float(op.get("zMaxMm", 0))
                if x1 <= x0 or y1 <= y0 or z1 <= z0:
                    raise ValueError("boolean_intersect_box invalid axis ranges")
                cx = (x0 + x1) / 2.0
                cy = (y0 + y1) / 2.0
                cz = (z0 + z1) / 2.0
                dx = x1 - x0
                dy = y1 - y0
                dz = z1 - z0
                tool = cq.Workplane("XY").box(dx, dy, dz).translate((cx, cy, cz))
                solid = solid.intersect(tool)
            elif kind == "boolean_combine_profile":
                mode = str(op.get("mode", "")).strip().lower()
                ed = str(op.get("extrudeDirection", "+Z")).strip().upper()
                ex_sign = -1.0 if ed == "-Z" else 1.0
                tool = _extruded_tool_from_profile_index(
                    cq,
                    profiles,
                    int(op.get("profileIndex", -1)),
                    float(op.get("extrudeDepthMm", 0)),
                    float(op.get("zStartMm", 0)),
                    ex_sign,
                )
                if mode == "union":
                    solid = solid.union(tool)
                elif mode == "subtract":
                    solid = solid.cut(tool)
                elif mode == "intersect":
                    solid = solid.intersect(tool)
                else:
                    raise ValueError("boolean_combine_profile mode must be union, subtract, or intersect")
            elif kind == "split_keep_halfspace":
                axis = str(op.get("axis", "")).strip().upper()
                keep = str(op.get("keep", "")).strip().lower()
                if axis not in ("X", "Y", "Z"):
                    raise ValueError("split_keep_halfspace axis must be X, Y, or Z")
                if keep not in ("positive", "negative"):
                    raise ValueError("split_keep_halfspace keep must be positive or negative")
                off = float(op.get("offsetMm", 0))
                other = "negative" if keep == "positive" else "positive"
                discard_tool = _halfspace_box_for_split(cq, solid, axis, off, other)
                keep_tool = _halfspace_box_for_split(cq, solid, axis, off, keep)
                if split_discard_out is not None:
                    try:
                        disc = solid.intersect(discard_tool)
                        if disc.val().Volume() > 1e-8:
                            split_discard_out.clear()
                            split_discard_out.append(disc)
                    except Exception:  # noqa: BLE001
                        pass
                solid = solid.intersect(keep_tool)
            elif kind == "hole_from_profile":
                mode = str(op.get("mode", "")).strip().lower()
                if mode not in ("depth", "through_all"):
                    raise ValueError("hole_from_profile mode must be depth or through_all")
                depth = _hole_depth_from_mode(
                    solid,
                    mode,
                    float(op.get("depthMm")) if op.get("depthMm") is not None else None,
                )
                tool = _extruded_tool_from_profile_index(
                    cq,
                    profiles,
                    int(op.get("profileIndex", -1)),
                    depth,
                    float(op.get("zStartMm", 0)),
                )
                solid = solid.cut(tool)
            elif kind == "thread_cosmetic":
                cx = float(op.get("centerXMm", 0))
                cy = float(op.get("centerYMm", 0))
                r_major = float(op.get("majorRadiusMm", 0))
                pitch = float(op.get("pitchMm", 0))
                length = float(op.get("lengthMm", 0))
                depth = float(op.get("depthMm", 0))
                z0 = float(op.get("zStartMm", 0))
                if r_major <= 0 or pitch <= 0 or length <= 0 or depth <= 0:
                    raise ValueError("thread_cosmetic requires positive radius/pitch/length/depth")
                r_minor = max(1e-4, r_major - depth)
                ring_count = max(1, min(256, int(math.floor(length / pitch)) + 1))
                z_step = length / float(ring_count)
                for i in range(ring_count):
                    zc = z0 + i * z_step + z_step * 0.5
                    ring = (
                        cq.Workplane("XY")
                        .workplane(offset=zc - z_step * 0.5)
                        .center(cx, cy)
                        .circle(r_major)
                        .circle(r_minor)
                        .extrude(max(0.05, z_step))
                    )
                    solid = solid.cut(ring)
            elif kind == "transform_translate":
                dx = float(op.get("dxMm", 0))
                dy = float(op.get("dyMm", 0))
                dz = float(op.get("dzMm", 0))
                keep = bool(op.get("keepOriginal", False))
                moved = solid.translate((dx, dy, dz))
                solid = solid.union(moved) if keep else moved
            elif kind == "press_pull_profile":
                delta = float(op.get("deltaMm", 0))
                if delta == 0:
                    raise ValueError("press_pull_profile requires non-zero deltaMm")
                z0 = float(op.get("zStartMm", 0))
                if delta > 0:
                    tool = _extruded_tool_from_profile_index(
                        cq,
                        profiles,
                        int(op.get("profileIndex", -1)),
                        delta,
                        z0,
                    )
                    solid = solid.union(tool)
                else:
                    tool = _extruded_tool_from_profile_index(
                        cq,
                        profiles,
                        int(op.get("profileIndex", -1)),
                        -delta,
                        z0 + delta,
                    )
                    solid = solid.cut(tool)
            elif kind == "sweep_profile_path":
                pts = op.get("pathPoints")
                assert isinstance(pts, list)
                path_pts = [(float(p[0]), float(p[1])) for p in pts]
                z0 = float(op.get("zStartMm", 0))
                acc = None
                for i in range(1, len(path_pts)):
                    x0, y0 = path_pts[i - 1]
                    x1, y1 = path_pts[i]
                    seg_len = math.hypot(x1 - x0, y1 - y0)
                    if seg_len <= 1e-9:
                        continue
                    tool = _extruded_tool_from_profile_index(
                        cq,
                        profiles,
                        int(op.get("profileIndex", -1)),
                        seg_len,
                        z0,
                    ).translate((x0, y0, 0))
                    acc = tool if acc is None else acc.union(tool)
                if acc is None:
                    raise ValueError("sweep_profile_path has zero effective length")
                solid = solid.union(acc)
            elif kind == "sweep_profile_path_true":
                acc = _sweep_profile_path_true(cq, profiles, op)
                solid = solid.union(acc)
            elif kind == "pipe_path":
                pts = op.get("pathPoints")
                assert isinstance(pts, list)
                path_pts = [(float(p[0]), float(p[1])) for p in pts]
                z0 = float(op.get("zStartMm", 0))
                outer_r = float(op.get("outerRadiusMm", 0))
                wt_raw = op.get("wallThicknessMm")
                inner_r = None
                if wt_raw is not None:
                    inner_r = max(1e-6, outer_r - float(wt_raw))
                orient = str(op.get("orientationMode", "frenet")).strip().lower()
                if orient not in ("fixed_normal", "frenet", "path_tangent_lock"):
                    raise ValueError("pipe_path orientationMode must be fixed_normal, frenet, or path_tangent_lock")
                fixed_n_pipe: tuple[float, float, float] | None = None
                if orient == "fixed_normal":
                    n_raw = _vec3_from_json(op.get("fixedNormal"), "fixedNormal")
                    if n_raw is None:
                        raise ValueError("pipe_path fixed_normal requires fixedNormal [x,y,z]")
                    fn = _v3_norm(n_raw[0], n_raw[1], n_raw[2])
                    if fn is None:
                        raise ValueError("pipe_path fixedNormal must be non-zero")
                    fixed_n_pipe = fn
                prev_n = None
                from OCP.gp import gp_Trsf
                from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform

                acc = None
                for i in range(1, len(path_pts)):
                    x0, y0 = path_pts[i - 1]
                    x1, y1 = path_pts[i]
                    seg_len = math.hypot(x1 - x0, y1 - y0)
                    if seg_len <= 1e-9:
                        continue
                    tx, ty, tz = (x1 - x0) / seg_len, (y1 - y0) / seg_len, 0.0
                    bx, by, bz, n2x, n2y, n2z, new_prev = _polyline_sweep_segment_frame(
                        orient, tx, ty, tz, prev_n, fixed_n_pipe
                    )
                    if orient != "fixed_normal":
                        prev_n = new_prev
                    overlap = min(2e-4, max(1e-7, seg_len * 2e-5))
                    extrude_len = seg_len + overlap
                    wp = cq.Workplane("XY").circle(outer_r)
                    if inner_r is not None:
                        wp = wp.circle(inner_r)
                    seg = wp.extrude(extrude_len)
                    tr = gp_Trsf()
                    tr.SetValues(
                        bx,
                        n2x,
                        tx,
                        x0,
                        by,
                        n2y,
                        ty,
                        y0,
                        bz,
                        n2z,
                        tz,
                        z0,
                    )
                    wrapped = seg.val().wrapped
                    bt = BRepBuilderAPI_Transform(wrapped, tr, True)
                    out = cq.Shape.cast(bt.Shape())
                    seg_world = cq.Workplane("XY").newObject([out])
                    acc = seg_world if acc is None else acc.union(seg_world)
                if acc is None:
                    raise ValueError("pipe_path has zero effective length")
                solid = solid.union(acc)
            elif kind == "thicken_scale":
                delta = float(op.get("deltaMm", 0))
                if delta == 0:
                    raise ValueError("thicken_scale requires non-zero deltaMm")
                bb = solid.val().BoundingBox()
                span = max(bb.xlen, bb.ylen, bb.zlen, 1e-6)
                factor = 1.0 + (delta / span)
                if factor <= 0.05:
                    raise ValueError("thicken_scale factor too small/non-positive")
                cx = (bb.xmin + bb.xmax) * 0.5
                cy = (bb.ymin + bb.ymax) * 0.5
                cz = (bb.zmin + bb.zmax) * 0.5
                scaled = (
                    solid.translate((-cx, -cy, -cz))
                    .scale(factor)
                    .translate((cx, cy, cz))
                )
                solid = scaled
            elif kind == "thicken_offset":
                solid = _thicken_offset_apply(cq, solid, op)
            elif kind == "thread_wizard":
                solid = _thread_wizard_apply(cq, solid, op)
            elif kind == "coil_cut":
                cx = float(op.get("centerXMm", 0))
                cy = float(op.get("centerYMm", 0))
                r_major = float(op.get("majorRadiusMm", 0))
                pitch = float(op.get("pitchMm", 0))
                turns = float(op.get("turns", 0))
                depth = float(op.get("depthMm", 0))
                z0 = float(op.get("zStartMm", 0))
                if r_major <= 0 or pitch <= 0 or turns <= 0 or depth <= 0:
                    raise ValueError("coil_cut requires positive radius/pitch/turns/depth")
                r_minor = max(1e-4, r_major - depth)
                total_len = pitch * turns
                ring_count = max(1, min(1024, int(math.floor(turns * 16.0))))
                z_step = total_len / float(ring_count)
                for i in range(ring_count):
                    # Partial helix surrogate: rotate ring center around axis while stepping +Z.
                    a = (2.0 * math.pi * i) / max(1.0, ring_count / max(1.0, turns))
                    ox = cx + math.cos(a) * 0.05 * pitch
                    oy = cy + math.sin(a) * 0.05 * pitch
                    zc = z0 + i * z_step + z_step * 0.5
                    ring = (
                        cq.Workplane("XY")
                        .workplane(offset=zc - z_step * 0.5)
                        .center(ox, oy)
                        .circle(r_major)
                        .circle(r_minor)
                        .extrude(max(0.05, z_step))
                    )
                    solid = solid.cut(ring)
            elif kind == "pattern_linear_3d":
                cnt = int(op.get("count", 0))
                if cnt < 2 or cnt > 32:
                    raise ValueError("pattern_linear_3d needs 2<=count<=32")
                dx = float(op.get("dxMm", 0))
                dy = float(op.get("dyMm", 0))
                dz = float(op.get("dzMm", 0))
                if dx == 0 and dy == 0 and dz == 0:
                    raise ValueError("pattern_linear_3d needs non-zero step")
                base = solid
                for i in range(1, cnt):
                    solid = solid.union(base.translate((i * dx, i * dy, i * dz)))
            elif kind == "pattern_path":
                cnt = int(op.get("count", 0))
                pts_raw = op.get("pathPoints")
                if not isinstance(pts_raw, list) or len(pts_raw) < 2:
                    raise ValueError("pattern_path pathPoints needs >= 2 points")
                path_pts = [(float(p[0]), float(p[1])) for p in pts_raw]
                closed_path = bool(op.get("closedPath", False))
                if closed_path and len(path_pts) < 3:
                    raise ValueError(
                        "pattern_path closedPath requires at least 3 path points"
                    )
                seg_lens: list[float] = []
                seg_starts: list[tuple[float, float]] = []
                seg_ends: list[tuple[float, float]] = []
                total = 0.0
                for i in range(1, len(path_pts)):
                    x0, y0 = path_pts[i - 1]
                    x1, y1 = path_pts[i]
                    ll = math.hypot(x1 - x0, y1 - y0)
                    seg_lens.append(ll)
                    seg_starts.append((x0, y0))
                    seg_ends.append((x1, y1))
                    total += ll
                if closed_path and len(path_pts) >= 2:
                    x0, y0 = path_pts[-1]
                    x1, y1 = path_pts[0]
                    ll = math.hypot(x1 - x0, y1 - y0)
                    if ll > 1e-9:
                        seg_lens.append(ll)
                        seg_starts.append((x0, y0))
                        seg_ends.append((x1, y1))
                        total += ll
                if total <= 1e-9:
                    raise ValueError("pattern_path has zero total length")

                def sample_path(dist: float) -> tuple[float, float]:
                    d = max(0.0, min(float(dist), total))
                    acc = 0.0
                    for si, ll in enumerate(seg_lens):
                        if ll <= 1e-12:
                            continue
                        nxt = acc + ll
                        if d <= nxt or si == len(seg_lens) - 1:
                            t = 0.0 if ll <= 1e-12 else (d - acc) / ll
                            x0, y0 = seg_starts[si]
                            x1, y1 = seg_ends[si]
                            return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
                        acc = nxt
                    return path_pts[-1]

                def tangent_at(dist: float) -> tuple[float, float]:
                    d = max(0.0, min(float(dist), total))
                    acc = 0.0
                    for si, ll in enumerate(seg_lens):
                        if ll <= 1e-12:
                            continue
                        nxt = acc + ll
                        if d <= nxt or si == len(seg_lens) - 1:
                            x0, y0 = seg_starts[si]
                            x1, y1 = seg_ends[si]
                            dx, dy = x1 - x0, y1 - y0
                            nn = math.hypot(dx, dy)
                            if nn <= 1e-12:
                                return (1.0, 0.0)
                            return (dx / nn, dy / nn)
                        acc = nxt
                    x0, y0 = seg_starts[-1]
                    x1, y1 = seg_ends[-1]
                    dx, dy = x1 - x0, y1 - y0
                    nn = math.hypot(dx, dy)
                    if nn <= 1e-12:
                        return (1.0, 0.0)
                    return (dx / nn, dy / nn)

                align_tangent = bool(op.get("alignToPathTangent", False))
                base = solid
                x_ref, y_ref = path_pts[0]
                step = total / float(cnt - 1)
                t0x, t0y = tangent_at(0.0)
                ref_ang = math.atan2(t0y, t0x)
                for i in range(1, cnt):
                    dist_i = step * i
                    sx, sy = sample_path(dist_i)
                    if align_tangent:
                        tix, tiy = tangent_at(dist_i)
                        ang_i = math.atan2(tiy, tix)
                        delta_deg = math.degrees(ang_i - ref_ang)
                        dup = _rotate_solid_around_z_mm(
                            base, x_ref, y_ref, delta_deg
                        ).translate((sx - x_ref, sy - y_ref, 0))
                        solid = solid.union(dup)
                    else:
                        solid = solid.union(
                            base.translate((sx - x_ref, sy - y_ref, 0))
                        )
            elif kind == "mirror_union_plane":
                plane = str(op.get("plane", "YZ")).strip().upper()
                if plane not in ("YZ", "XZ", "XY"):
                    raise ValueError("mirror_union_plane plane must be YZ, XZ, or XY")
                ox = float(op.get("originXMm", 0))
                oy = float(op.get("originYMm", 0))
                oz = float(op.get("originZMm", 0))
                base_pt = (ox, oy, oz)
                dup = solid.mirror(plane, base_pt)
                solid = solid.union(dup)
            elif kind == "sheet_tab_union":
                cx = float(op.get("centerXMm", 0))
                cy = float(op.get("centerYMm", 0))
                zb = float(op.get("zBaseMm", 0))
                ln = float(op.get("lengthMm", 0))
                wd = float(op.get("widthMm", 0))
                ht = float(op.get("heightMm", 0))
                if ln <= 0 or wd <= 0 or ht <= 0:
                    raise ValueError("sheet_tab_union requires positive lengthMm, widthMm, heightMm")
                cz = zb + ht / 2.0
                tool = cq.Workplane("XY").box(ln, wd, ht).translate((cx, cy, cz))
                solid = solid.union(tool)
            elif kind == "sheet_fold":
                bend_y = float(op.get("bendLineYMm", 0))
                bend_angle = float(op.get("bendAngleDeg", 0))
                bend_radius = float(op.get("bendRadiusMm", 0))
                k_factor = float(op.get("kFactor", 0.44))
                mode = str(op.get("bendAllowanceMode", "k_factor")).strip().lower()
                allowance_mm = float(op.get("allowanceMm")) if op.get("allowanceMm") is not None else None
                deduction_mm = float(op.get("deductionMm")) if op.get("deductionMm") is not None else None
                theta = math.radians(abs(bend_angle))
                if mode == "allowance_mm" and allowance_mm is not None:
                    neutral_arc = allowance_mm
                elif mode == "deduction_mm" and deduction_mm is not None:
                    neutral_arc = max(0.0, bend_radius * theta - deduction_mm)
                else:
                    neutral_arc = theta * (bend_radius + k_factor * max(0.1, bend_radius))
                shift = neutral_arc if bend_angle >= 0 else -neutral_arc
                bb = solid.val().BoundingBox()
                pad = max(bb.xlen, bb.ylen, bb.zlen, 1.0) * 2.0 + 10.0
                x0, x1 = bb.xmin - pad, bb.xmax + pad
                y0, y1 = bb.ymin - pad, bb.ymax + pad
                z0, z1 = bb.zmin - pad, bb.zmax + pad
                fold_box = (
                    cq.Workplane("XY")
                    .box(x1 - x0, y1 - bend_y, z1 - z0)
                    .translate(((x0 + x1) * 0.5, (bend_y + y1) * 0.5, (z0 + z1) * 0.5))
                )
                fold_half = solid.intersect(fold_box)
                stay_box = (
                    cq.Workplane("XY")
                    .box(x1 - x0, bend_y - y0, z1 - z0)
                    .translate(((x0 + x1) * 0.5, (y0 + bend_y) * 0.5, (z0 + z1) * 0.5))
                )
                stay_half = solid.intersect(stay_box)
                fold_half = fold_half.translate((0, shift, 0)).rotate((0, bend_y, 0), (1, bend_y, 0), bend_angle)
                solid = stay_half.union(fold_half)
            elif kind == "sheet_flat_pattern":
                # Marker op: keeps shape unchanged; export path consumes sheet ops from features/design.
                solid = solid
            elif kind == "loft_guide_rails":
                # MVP validation marker for guide rails; kernel loft remains profile-driven in this phase.
                solid = solid
            elif kind == "plastic_rule_fillet":
                rr = float(op.get("radiusMm", 0))
                solid = solid.edges().fillet(rr)
            elif kind == "plastic_boss":
                cx = float(op.get("centerXMm", 0))
                cy = float(op.get("centerYMm", 0))
                z0 = float(op.get("zBaseMm", 0))
                ro = float(op.get("outerRadiusMm", 0))
                hh = float(op.get("heightMm", 0))
                hr_raw = op.get("holeRadiusMm")
                boss = cq.Workplane("XY").workplane(offset=z0).center(cx, cy).circle(ro).extrude(hh)
                if hr_raw is not None:
                    hr = float(hr_raw)
                    if hr > 0 and hr < ro:
                        hole = cq.Workplane("XY").workplane(offset=z0).center(cx, cy).circle(hr).extrude(hh)
                        boss = boss.cut(hole)
                solid = solid.union(boss)
            elif kind == "plastic_lip_groove":
                mode = str(op.get("mode", "")).strip().lower()
                x0 = float(op.get("xMinMm", 0))
                x1 = float(op.get("xMaxMm", 0))
                y0 = float(op.get("yMinMm", 0))
                y1 = float(op.get("yMaxMm", 0))
                zb = float(op.get("zBaseMm", 0))
                dd = float(op.get("depthMm", 0))
                cx = (x0 + x1) * 0.5
                cy = (y0 + y1) * 0.5
                tool = cq.Workplane("XY").workplane(offset=zb).box(x1 - x0, y1 - y0, dd).translate((cx, cy, dd * 0.5))
                solid = solid.union(tool) if mode == "lip" else solid.cut(tool)
            else:
                raise ValueError(f"unknown_post_solid_op:{kind}")
        except Exception as e:  # noqa: BLE001
            raise ValueError(_format_post_op_failure(idx, kind, e)) from e
    return solid


def main() -> None:
    if len(sys.argv) < 4:
        _emit_json(
            {
                "ok": False,
                "error": "usage",
                "detail": "build_part.py <payload.json> <out_dir> <basename>",
            },
            2,
        )
    payload_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    base = sys.argv[3]

    try:
        data = json.loads(payload_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        _emit_json({"ok": False, "error": "payload_read_failed", "detail": str(e)}, 1)

    if not isinstance(data, dict):
        _emit_json({"ok": False, "error": "invalid_payload", "detail": "root must be a JSON object"}, 1)

    ver = data.get("version", 1)
    if ver not in (1, 2, 3, 4):
        _emit_json({"ok": False, "error": "bad_payload_version", "detail": str(ver)}, 1)

    profiles = data.get("profiles") or []
    solid_kind = str(data.get("solidKind", "extrude"))
    post_ops = data.get("postSolidOps") or []

    if solid_kind not in ("extrude", "revolve", "loft"):
        _emit_json(
            {"ok": False, "error": "unknown_solid_kind", "detail": solid_kind},
            1,
        )

    num_err = _validate_solid_kind_numeric(data, solid_kind)
    if num_err:
        _emit_json({"ok": False, "error": "invalid_payload", "detail": num_err}, 1)

    payload_err = _validate_kernel_payload(data, solid_kind, profiles, post_ops)
    if payload_err:
        _emit_json({"ok": False, "error": "invalid_payload", "detail": payload_err}, 1)

    raw_plane = data.get("sketchPlane")
    sketch_plane: dict = raw_plane if isinstance(raw_plane, dict) else {"kind": "datum", "datum": "XY"}
    spl_err = _validate_sketch_plane(sketch_plane)
    if spl_err:
        _emit_json({"ok": False, "error": "invalid_payload", "detail": spl_err}, 1)

    try:
        import cadquery as cq  # type: ignore
    except Exception as e:  # noqa: BLE001
        _emit_json({"ok": False, "error": "cadquery_not_installed", "detail": str(e)}, 1)

    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        _emit_json({"ok": False, "error": "output_dir_failed", "detail": str(e)}, 1)

    step_path = out_dir / f"{base}.step"
    stl_path = out_dir / f"{base}.stl"

    loft_strategy: str | None = None
    loft_profiles = profiles
    loft_rail_mode: str = "marker"
    rail_yaw = _loft_rail_sketch_yaw_deg_from_ops(post_ops)
    if solid_kind == "loft" and rail_yaw is not None:
        loft_profiles = _profiles_clone_with_yaw_second(profiles, rail_yaw)
        loft_rail_mode = "sketch_xy_align"

    split_discard_holder: list = []
    stl_mesh_kw: dict = {}
    try:
        atd = data.get("stlMeshAngularToleranceDeg")
        if atd is not None:
            stl_mesh_kw["angularTolerance"] = float(atd)
    except (TypeError, ValueError):
        stl_mesh_kw = {}

    split_step_path = out_dir / f"{base}-split-discard.step"
    split_stl_path = out_dir / f"{base}-split-discard.stl"

    try:
        if solid_kind == "extrude":
            depth = float(data.get("extrudeDepthMm", 10))
            solid = _extrude_profiles(cq, profiles, depth)
        elif solid_kind == "revolve":
            rev = data.get("revolve") or {}
            angle = float(rev.get("angleDeg", 360))
            axis_x = float(rev.get("axisX", 0))
            solid = _revolve_profiles(cq, profiles, angle, axis_x)
        else:
            loft_sep = float(data.get("loftSeparationMm", 20))
            if len(loft_profiles) == 2:
                solid, loft_strategy = _loft_two_profiles(cq, loft_profiles, loft_sep)
            else:
                solid, loft_strategy = _loft_many_via_unions(cq, loft_profiles, loft_sep)

        if solid is None:
            detail = "no valid solid from profiles after kernel rules"
            if solid_kind == "loft":
                detail = "loft failed after smooth/ruled and winding variants (check profile compatibility)"
            _emit_json({"ok": False, "error": "no_solid", "detail": detail}, 1)

        if post_ops:
            solid = _apply_post_solid_ops(cq, solid, post_ops, profiles, split_discard_holder)

        try:
            trsf = _sketch_plane_gp_trsf(sketch_plane)
            solid = _cq_transform_solid_by_gp_trsf(cq, solid, trsf)
            if split_discard_holder:
                split_discard_holder[0] = _cq_transform_solid_by_gp_trsf(
                    cq, split_discard_holder[0], trsf
                )
        except ValueError as e:
            _emit_json({"ok": False, "error": "invalid_payload", "detail": str(e)}, 1)

        cq.exporters.export(solid, str(step_path.resolve()), exportType="STEP")
        cq.exporters.export(solid, str(stl_path.resolve()), exportType="STL", **stl_mesh_kw)
        if split_discard_holder:
            cq.exporters.export(split_discard_holder[0], str(split_step_path.resolve()), exportType="STEP")
            cq.exporters.export(
                split_discard_holder[0], str(split_stl_path.resolve()), exportType="STL", **stl_mesh_kw
            )
    except Exception as e:  # noqa: BLE001
        _emit_json({"ok": False, "error": "build_failed", "detail": str(e)}, 1)

    ok_payload: dict = {
        "ok": True,
        "stepPath": str(step_path.resolve()),
        "stlPath": str(stl_path.resolve()),
    }
    if any(isinstance(op, dict) and op.get("kind") == "sheet_flat_pattern" for op in post_ops):
        ok_payload["flatPatternStrategy"] = "bbox-outline+fold-centerline-markers"
    if solid_kind == "loft" and loft_strategy:
        ok_payload["loftStrategy"] = loft_strategy
    for op in reversed(post_ops):
        if isinstance(op, dict) and op.get("kind") == "split_keep_halfspace":
            try:
                ok_payload["splitKeepHalfspace"] = {
                    "axis": str(op.get("axis", "")).strip().upper(),
                    "offsetMm": float(op.get("offsetMm", 0)),
                    "keep": str(op.get("keep", "")).strip().lower(),
                }
            except (TypeError, ValueError):
                pass
            break
    if split_discard_holder:
        ok_payload["splitDiscardedStepPath"] = str(split_step_path.resolve())
        ok_payload["splitDiscardedStlPath"] = str(split_stl_path.resolve())
    if any(isinstance(op, dict) and op.get("kind") == "loft_guide_rails" for op in post_ops):
        ok_payload["loftGuideRailsKernelMode"] = loft_rail_mode
    _emit_json(ok_payload, 0)


if __name__ == "__main__":
    main()
