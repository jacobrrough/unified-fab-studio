"""
4-axis (A rotary) toolpath engine for Unified Fab Studio.

No external dependencies — pure Python (stdlib + json/math).
Reads a JSON config, generates G-code with X Z A words for cylindrical
wrapping or indexed rotation ops, and writes the result to a JSON file.

Supports two main strategies:
  - 4axis_wrapping: cylindrical wrapping with parallel, contour, silhouette_rough,
    or raster modes. Parallel/silhouette/raster generate continuous zigzag passes
    with radial waterline roughing and overcut past material edges.
  - 4axis_indexed: locks A at discrete angles and faces along X.

IPC contract
------------
- argv: python axis4_toolpath.py <config.json>
- config keys (required): stlPath | contourPoints, toolpathJsonPath,
  strategy ('4axis_wrapping' | '4axis_indexed')
- config keys (optional, with defaults):
    cylinderDiameterMm  (float, default 50) — stock cylinder outer diameter
    aAxisOrientation    ('x'|'y', default 'x') — rotation axis
    wrapMode            ('contour'|'raster'|'parallel'|'silhouette_rough', default 'parallel')
    zPassMm             (float, default -1.0) — radial depth: **negative** = into stock
                          (cutZ = radius + zPass). **Positive** values are treated as depth
                          magnitude (converted to negative) so shared CAM defaults still cut in.
    zStepMm             (float, default 0) — roughing: step into stock (mm); 0 = single pass at zPassMm
    stepoverDeg         (float, default 5.0) — angular stepover for parallel
    feedMmMin           (float, default 800)
    plungeMmMin         (float, default 300)
    safeZMm             (float, default 10.0) — radial clearance above stock
    toolDiameterMm      (float, default 3.175)
    indexAnglesDeg      (list[float]) — for 4axis_indexed: A stops to machine
    cylinderLengthMm    (float, default 100) — axial program length (clamped to stock)
    stockLengthMm       (float, default = cylinderLengthMm) — for machinable X bounds
    chuckDepthMm        (float, default 0) — in-chuck zone from left; skip cutting
    clampOffsetMm       (float, default 0) — orange buffer after chuck; skip cutting
    axialBandCount      (int, default 1) — split machinable X into N axial bands
    overcutMm           (float, default toolDiameterMm) — extend cuts past material edges
- Success: exit 0; write toolpathJsonPath with
    {"ok": true, "toolpathLines": [...], "strategy": "..."}
- Failure: non-zero exit; print {"ok": false, "error": "...", "detail": "..."}
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

ALLOWED_STRATEGIES = frozenset({"4axis_wrapping", "4axis_indexed"})


# ─── helpers ──────────────────────────────────────────────────────────────────

def _die(error: str, detail: str | None = None, code: int = 2) -> None:
    payload: dict[str, Any] = {"ok": False, "error": error}
    if detail is not None:
        payload["detail"] = detail
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def _float_param(cfg: dict[str, Any], key: str, default: float) -> float:
    v = cfg.get(key, default)
    if v is None:
        v = default
    try:
        v = float(v)
    except (TypeError, ValueError):
        _die("invalid_numeric_params", f"{key} must be a finite number")
    if not math.isfinite(v):
        _die("invalid_numeric_params", f"{key} must be finite")
    return v


def _load_cfg() -> dict[str, Any]:
    if len(sys.argv) < 2:
        _die("usage", "axis4_toolpath.py <config.json>", code=2)
    p = Path(sys.argv[1])
    try:
        raw = p.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        _die("config_not_found", str(p), code=2)
    except OSError as e:
        _die("config_read_error", str(e), code=2)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        _die("invalid_config_json", f"{e.msg} at line {e.lineno}", code=2)
    if not isinstance(data, dict):
        _die("invalid_config_shape", "root must be a JSON object", code=2)
    return data


def _machinable_x_span(
    stock_length_mm: float,
    chuck_depth_mm: float,
    clamp_offset_mm: float,
) -> tuple[float, float]:
    """
    Axial X from stock left face (WCS): machinable interval [start, end].
    Matches ShopModelViewer.buildFourAxisRig (red clamp + orange offset + amber cut zone).
    """
    sl = max(0.0, float(stock_length_mm))
    ck = max(0.0, float(chuck_depth_mm))
    off = max(0.0, float(clamp_offset_mm))
    clamp_len = max(0.0, min(ck, sl * 0.6))
    offset_len = max(0.0, min(off, max(0.0, sl - clamp_len - 1.0)))
    mach_start = clamp_len + offset_len
    mach_end = sl
    return mach_start, mach_end


def _normalize_radial_z_pass_mm(zp: float) -> float:
    """
    Match cam-runner: negative zPass = into cylinder; positive = depth magnitude; zero → -1.
    """
    if zp < -1e-9:
        return zp
    if zp > 1e-9:
        return -abs(zp)
    return -1.0


def _iter_z_depths(z_pass_mm: float, z_step_mm: float) -> list[float]:
    """
    Roughing: step from the surface toward z_pass_mm (negative = into stock).
    z_step_mm <= 0 → single pass at z_pass_mm only.
    """
    zp = float(z_pass_mm)
    zs = max(0.0, float(z_step_mm))
    if zp >= -1e-9:
        return [zp]
    if zs <= 1e-6:
        return [zp]
    out: list[float] = []
    d = -zs
    while d > zp + 1e-6:
        out.append(d)
        d -= zs
    out.append(zp)
    return out


def _mesh_informed_z_depths(
    z_pass_mm: float,
    z_step_mm: float,
    cylinder_radius_mm: float,
    mesh_radial_max_mm: float,
) -> list[float]:
    """
    Geometry-informed: STL bbox max radial extent vs cylinder R gives a shallow
    radial limit. Step from that toward z_pass.
    """
    zp = float(z_pass_mm)
    r = max(1e-6, float(cylinder_radius_mm))
    mr = float(mesh_radial_max_mm)
    if mr <= 1e-6 or mr >= r - 1e-6:
        return _iter_z_depths(zp, z_step_mm)
    z_shallow = mr - r
    if z_shallow <= zp + 1e-6:
        return _iter_z_depths(zp, z_step_mm)
    zs = max(0.0, float(z_step_mm))
    if zs <= 1e-6:
        return [zp]
    out: list[float] = []
    d = z_shallow
    while d > zp + 1e-6:
        out.append(d)
        d -= zs
    out.append(zp)
    return out


# ─── STL loading (binary) for mesh-aware Python passes ──────────────────────

def _load_binary_stl_triangles(stl_path: str, max_tris: int = 200_000) -> list[tuple[tuple[float,float,float], tuple[float,float,float], tuple[float,float,float]]] | None:
    """Load triangles from a binary STL file. Returns None on failure."""
    try:
        data = Path(stl_path).read_bytes()
    except (OSError, FileNotFoundError):
        return None
    if len(data) < 84:
        return None
    n_tris = struct.unpack_from('<I', data, 80)[0]
    if n_tris == 0:
        n_tris = (len(data) - 84) // 50
    n_tris = min(n_tris, max_tris)
    if len(data) < 84 + n_tris * 50:
        n_tris = (len(data) - 84) // 50
    tris = []
    off = 84
    for _ in range(n_tris):
        off += 12  # skip normal
        v0 = struct.unpack_from('<fff', data, off); off += 12
        v1 = struct.unpack_from('<fff', data, off); off += 12
        v2 = struct.unpack_from('<fff', data, off); off += 12
        off += 2  # skip attribute
        tris.append((v0, v1, v2))
    return tris


# ─── Cylindrical heightmap (Python version) ─────────────────────────────────

_NO_HIT = -1.0

def _ray_tri_intersect(
    ox: float, oy: float, oz: float,
    dx: float, dy: float, dz: float,
    v0: tuple[float,float,float],
    v1: tuple[float,float,float],
    v2: tuple[float,float,float],
) -> float | None:
    """Möller–Trumbore ray–triangle intersection. Returns distance or None."""
    EPS = 1e-7
    e1x = v1[0]-v0[0]; e1y = v1[1]-v0[1]; e1z = v1[2]-v0[2]
    e2x = v2[0]-v0[0]; e2y = v2[1]-v0[1]; e2z = v2[2]-v0[2]
    px = dy*e2z - dz*e2y
    py = dz*e2x - dx*e2z
    pz = dx*e2y - dy*e2x
    det = e1x*px + e1y*py + e1z*pz
    if abs(det) < EPS:
        return None
    inv = 1.0 / det
    tx = ox-v0[0]; ty = oy-v0[1]; tz = oz-v0[2]
    u = (tx*px + ty*py + tz*pz) * inv
    if u < -EPS or u > 1+EPS:
        return None
    qx = ty*e1z - tz*e1y
    qy = tz*e1x - tx*e1z
    qz = tx*e1y - ty*e1x
    v = (dx*qx + dy*qy + dz*qz) * inv
    if v < -EPS or u+v > 1+EPS:
        return None
    t = (e2x*qx + e2y*qy + e2z*qz) * inv
    return t if t > EPS else None


def _build_cylindrical_heightmap(
    tris: list,
    stock_r: float,
    x_start: float,
    x_end: float,
    nx: int,
    na: int,
) -> tuple[list[float], float, float]:
    """
    Build cylindrical heightmap. Returns (flat radii array [nx*na], dx, da_deg).
    radii[ix*na + ia] = radial distance to mesh surface, or _NO_HIT.
    """
    dx = (x_end - x_start) / max(1, nx - 1)
    da_deg = 360.0 / na
    radii = [_NO_HIT] * (nx * na)
    cast_r = stock_r + 30.0

    # Simple X-bucket acceleration
    bucket_count = max(1, min(nx, 100))
    bw = (x_end - x_start + 2*dx) / bucket_count
    bx0 = x_start - dx
    buckets: list[list[int]] = [[] for _ in range(bucket_count)]
    for ti, (v0, v1, v2) in enumerate(tris):
        t_xmin = min(v0[0], v1[0], v2[0])
        t_xmax = max(v0[0], v1[0], v2[0])
        i0 = max(0, min(bucket_count-1, int((t_xmin - bx0) / bw)))
        i1 = max(0, min(bucket_count-1, int((t_xmax - bx0) / bw)))
        for bi in range(i0, i1+1):
            buckets[bi].append(ti)

    for ix in range(nx):
        x = x_start + ix * dx
        bi = max(0, min(bucket_count-1, int((x - bx0) / bw)))
        local_idxs = buckets[bi]
        if not local_idxs:
            continue

        for ia in range(na):
            a_deg = ia * da_deg
            a_rad = math.radians(a_deg)
            uy = math.cos(a_rad)
            uz = math.sin(a_rad)
            oy = uy * cast_r
            oz = uz * cast_r

            best_t: float | None = None
            for ti in local_idxs:
                v0, v1, v2 = tris[ti]
                t = _ray_tri_intersect(x, oy, oz, 0.0, -uy, -uz, v0, v1, v2)
                if t is not None and (best_t is None or t < best_t):
                    best_t = t

            if best_t is None:
                continue
            hy = oy + best_t * (-uy)
            hz = oz + best_t * (-uz)
            r_hit = math.hypot(hy, hz)
            if r_hit < 0.01 or r_hit > stock_r + 5:
                continue
            radii[ix * na + ia] = r_hit

    return radii, dx, da_deg


def _apply_tool_compensation(
    radii: list[float],
    nx: int,
    na: int,
    dx: float,
    da_deg: float,
    tool_r: float,
    stock_r: float,
) -> list[float]:
    """Tool radius compensation: for each cell, max radius within tool footprint."""
    comp = [_NO_HIT] * (nx * na)
    kernel_ix = max(1, math.ceil(tool_r / max(0.01, dx)))
    ang_span_deg = math.degrees(tool_r / max(0.01, stock_r))
    kernel_ia = max(1, math.ceil(ang_span_deg / da_deg))

    for ix in range(nx):
        for ia in range(na):
            max_r = _NO_HIT
            has_hit = False
            for dix in range(-kernel_ix, kernel_ix + 1):
                nix = ix + dix
                if nix < 0 or nix >= nx:
                    continue
                for dia in range(-kernel_ia, kernel_ia + 1):
                    nia = (ia + dia) % na
                    dist_x = dix * dx
                    dist_a = dia * da_deg * math.pi / 180.0 * stock_r
                    if math.hypot(dist_x, dist_a) > tool_r:
                        continue
                    r = radii[nix * na + nia]
                    if r != _NO_HIT:
                        has_hit = True
                        if r > max_r:
                            max_r = r
            if has_hit:
                comp[ix * na + ia] = max_r
    return comp


def _compute_per_angle_x_extents(
    radii: list[float],
    nx: int,
    na: int,
    overcut_cells: int,
) -> list[tuple[int, int]]:
    """For each angle, find X range with mesh data, extended by overcut cells."""
    extents: list[tuple[int, int]] = []
    for ia in range(na):
        first = -1
        last = -1
        for ix in range(nx):
            if radii[ix * na + ia] != _NO_HIT:
                if first == -1:
                    first = ix
                last = ix
        if first == -1:
            extents.append((-1, -1))
        else:
            extents.append((
                max(0, first - overcut_cells),
                min(nx - 1, last + overcut_cells),
            ))

    # Fill gaps from neighboring angles
    for ia in range(na):
        if extents[ia][0] != -1:
            continue
        prev = (ia - 1 + na) % na
        nxt = (ia + 1) % na
        if extents[prev][0] != -1 and extents[nxt][0] != -1:
            extents[ia] = (
                min(extents[prev][0], extents[nxt][0]),
                max(extents[prev][1], extents[nxt][1]),
            )
        elif extents[prev][0] != -1:
            extents[ia] = extents[prev]
        elif extents[nxt][0] != -1:
            extents[ia] = extents[nxt]

    return extents


# ─── strategy: 4-axis wrapping (cylindrical) ─────────────────────────────────

def _wrap_linear_to_a_deg(linear_mm: float, cylinder_diameter_mm: float) -> float:
    circ = math.pi * cylinder_diameter_mm
    if circ <= 0:
        return 0.0
    return (linear_mm / circ) * 360.0


def _axial_bands(x0: float, x1: float, n: int) -> list[tuple[float, float]]:
    span = x1 - x0
    if n <= 1 or span <= 1e-6:
        return [(x0, x1)]
    nb = max(1, int(n))
    out: list[tuple[float, float]] = []
    for i in range(nb):
        xa = x0 + (i / nb) * span
        xb = x0 + ((i + 1) / nb) * span
        out.append((xa, xb))
    return out


def _gen_parallel_wrapping(
    *,
    cylinder_diameter_mm: float,
    mach_x_start_mm: float,
    mach_x_end_mm: float,
    z_depths_mm: list[float],
    stepover_deg: float,
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
    a_axis_orientation: str,
    axial_band_count: int = 1,
    tool_diameter_mm: float = 3.175,
    overcut_mm: float | None = None,
    stl_path: str | None = None,
) -> list[str]:
    """
    Parallel passes along X at each Z depth, stepping A by stepover_deg.
    When an STL is available, uses cylindrical heightmap for:
      - Tool radius compensation
      - Edge overcut (extending past material boundaries)
      - Continuous passes (not point-by-point)
      - Layer-by-layer roughing that respects actual geometry
    Falls back to pattern-based passes when no STL.
    """
    radius = cylinder_diameter_mm / 2.0
    clear_z = radius + safe_z_mm
    step = max(1.0, min(float(stepover_deg), 90.0))
    tool_r = tool_diameter_mm / 2.0
    oc_mm = overcut_mm if overcut_mm is not None else tool_diameter_mm

    # Try mesh-aware path generation
    tris = None
    if stl_path:
        tris = _load_binary_stl_triangles(stl_path)

    if tris and len(tris) > 0:
        return _gen_mesh_aware_parallel(
            tris=tris,
            radius=radius,
            mach_x_start_mm=mach_x_start_mm,
            mach_x_end_mm=mach_x_end_mm,
            z_depths_mm=z_depths_mm,
            stepover_deg=step,
            feed_mm_min=feed_mm_min,
            plunge_mm_min=plunge_mm_min,
            safe_z_mm=safe_z_mm,
            tool_r=tool_r,
            overcut_mm=oc_mm,
        )

    # Fallback: pattern-based (no mesh) with overcut extension
    bands = _axial_bands(mach_x_start_mm, mach_x_end_mm, axial_band_count)

    lines: list[str] = []
    lines.append(
        f"; 4-axis cylindrical parallel (pattern) — D={cylinder_diameter_mm:.1f}mm, "
        f"X=[{mach_x_start_mm:.2f}..{mach_x_end_mm:.2f}] machinable +overcut {oc_mm:.1f}mm, "
        f"axial bands={len(bands)}, Z levels={len(z_depths_mm)}, A step={step:.1f}°"
    )
    lines.append(f"; A-axis orientation: rotation around {a_axis_orientation.upper()}")
    lines.append("; VERIFY: cylinder diameter, stock zero, A WCS home, chuck bounds")

    # Extend X range by overcut
    ext_x_start = max(0.0, mach_x_start_mm - oc_mm)
    ext_x_end = mach_x_end_mm + oc_mm

    pass_num = 0
    for zd in z_depths_mm:
        cut_z = radius + zd
        if cut_z < 0.05:
            continue
        lines.append(f"; --- Z depth {zd:.3f} mm (radial cut Z={cut_z:.3f}) ---")
        a_angle = 0.0
        direction = 1
        while a_angle <= 360.0 + 1e-6:
            pass_num += 1
            lines.append(f"; Pass {pass_num}  A={a_angle:.2f}°  Z_pass={zd:.3f}")
            lines.append(f"G0 Z{clear_z:.3f}")
            lines.append(f"G0 A{a_angle:.3f}")
            if direction == 1:
                x_start, x_end = ext_x_start, ext_x_end
            else:
                x_start, x_end = ext_x_end, ext_x_start
            lines.append(f"G0 X{x_start:.3f}")
            lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}")
            lines.append(f"G1 X{x_end:.3f} F{feed_mm_min:.0f}")
            lines.append(f"G0 Z{clear_z:.3f}")
            a_angle += step
            direction *= -1

    lines.append(f"G0 Z{clear_z:.3f}")
    lines.append("G0 A0 ; return A to home")
    return lines


def _gen_mesh_aware_parallel(
    *,
    tris: list,
    radius: float,
    mach_x_start_mm: float,
    mach_x_end_mm: float,
    z_depths_mm: list[float],
    stepover_deg: float,
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
    tool_r: float,
    overcut_mm: float,
) -> list[str]:
    """
    Mesh-aware parallel wrapping with cylindrical heightmap:
    - Builds heightmap by ray-casting the STL
    - Applies tool-radius compensation
    - Generates continuous zigzag passes at each depth level
    - Extends past material edges by overcut distance
    - Separates roughing and finishing passes
    """
    clear_z = radius + safe_z_mm
    step = stepover_deg

    # Grid dimensions
    ext_x_start = mach_x_start_mm - overcut_mm
    ext_x_end = mach_x_end_mm + overcut_mm
    span_x = ext_x_end - ext_x_start
    step_x = max(0.25, tool_r * 0.8)  # X resolution ~80% of tool radius
    nx = max(2, min(600, math.ceil(span_x / step_x) + 1))
    na = max(4, min(720, math.ceil(360.0 / step)))
    actual_da = 360.0 / na

    lines: list[str] = []
    lines.append(
        f"; 4-axis mesh-aware parallel — R={radius:.1f}mm, "
        f"X=[{mach_x_start_mm:.2f}..{mach_x_end_mm:.2f}] +overcut {overcut_mm:.1f}mm, "
        f"grid {nx}×{na}, Z levels={len(z_depths_mm)}, A step={actual_da:.2f}°, "
        f"tool R={tool_r:.2f}mm"
    )
    lines.append("; Algorithm: cylindrical heightmap + tool-radius compensation + waterline roughing")
    lines.append("; VERIFY: STL WCS aligned with stock; cylinder diameter; A home")

    # Build heightmap
    radii, dx, da_deg = _build_cylindrical_heightmap(
        tris, radius, ext_x_start, ext_x_end, nx, na
    )

    # Tool compensation
    comp = _apply_tool_compensation(radii, nx, na, dx, da_deg, tool_r, radius)

    # Per-angle X extents with overcut
    overcut_cells = max(1, math.ceil(overcut_mm / max(0.01, dx)))
    x_extents = _compute_per_angle_x_extents(radii, nx, na, overcut_cells)

    # Sort depths shallowest first
    sorted_depths = sorted(z_depths_mm, reverse=True)
    has_multiple = len(sorted_depths) > 1
    roughing_depths = sorted_depths[:-1] if has_multiple else sorted_depths
    finish_depth = sorted_depths[-1] if has_multiple else None

    pass_num = 0

    # ── Roughing passes ──
    for zd in roughing_depths:
        target_r = radius + zd
        if target_r < 0.05:
            continue
        lines.append(f"; ─── Roughing: radial depth {zd:.3f}mm (cut at R={target_r:.3f}mm) ───")

        for ia in range(na):
            ext_start, ext_end = x_extents[ia]
            if ext_start == -1:
                continue
            a_deg = ia * actual_da

            # Build continuous pass
            points: list[tuple[float, float]] = []
            for ix in range(ext_start, ext_end + 1):
                x = ext_x_start + ix * dx
                cr = comp[ix * na + ia]
                if cr == _NO_HIT:
                    cut_z = target_r
                else:
                    cut_z = max(target_r, cr)
                if cut_z < 0.05 or cut_z >= radius - 0.01:
                    continue
                points.append((x, cut_z))

            if len(points) < 2:
                continue

            pass_num += 1
            if pass_num % 2 == 0:
                points.reverse()

            lines.append(f"; Pass {pass_num}: A={a_deg:.1f}° rough Z_level={zd:.3f}")
            lines.append(f"G0 Z{clear_z:.3f}")
            lines.append(f"G0 A{a_deg:.3f}")
            lines.append(f"G0 X{points[0][0]:.3f}")
            lines.append(f"G1 Z{points[0][1]:.3f} F{plunge_mm_min:.0f}")

            for i in range(1, len(points)):
                px, pz = points[i]
                prev_z = points[i-1][1]
                if abs(pz - prev_z) > 0.005:
                    lines.append(f"G1 X{px:.3f} Z{pz:.3f} F{feed_mm_min:.0f}")
                else:
                    lines.append(f"G1 X{px:.3f} F{feed_mm_min:.0f}")

            lines.append(f"G0 Z{clear_z:.3f}")

    # ── Finishing pass ──
    if finish_depth is not None:
        finish_r = radius + finish_depth
        if finish_r >= 0.05:
            # Finer angular resolution for finishing
            finish_step = max(0.5, step / 2.0)
            finish_na = max(4, math.ceil(360.0 / finish_step))
            finish_da = 360.0 / finish_na

            lines.append(
                f"; ─── Finishing: target R={finish_r:.3f}mm, "
                f"A step={finish_da:.2f}° ({finish_na} passes) ───"
            )

            # Rebuild heightmap at finer angular res if needed
            if finish_na > na:
                f_nx = max(2, min(600, nx))
                f_radii, f_dx, f_da = _build_cylindrical_heightmap(
                    tris, radius, ext_x_start, ext_x_end, f_nx, finish_na
                )
                f_comp = _apply_tool_compensation(
                    f_radii, f_nx, finish_na, f_dx, f_da, tool_r, radius
                )
                f_extents = _compute_per_angle_x_extents(f_radii, f_nx, finish_na, overcut_cells)
            else:
                f_nx = nx
                f_radii = radii
                f_dx = dx
                f_comp = comp
                f_extents = x_extents
                finish_na = na
                finish_da = actual_da

            for ia in range(finish_na):
                ext_start, ext_end = f_extents[ia]
                if ext_start == -1:
                    continue
                a_deg = ia * finish_da

                points: list[tuple[float, float]] = []
                for ix in range(ext_start, ext_end + 1):
                    x = ext_x_start + ix * f_dx
                    cr = f_comp[ix * finish_na + ia]
                    if cr == _NO_HIT:
                        cut_z = finish_r
                    else:
                        cut_z = max(finish_r, cr)
                    if cut_z < 0.05 or cut_z >= radius - 0.01:
                        continue
                    points.append((x, cut_z))

                if len(points) < 2:
                    continue

                pass_num += 1
                if pass_num % 2 == 0:
                    points.reverse()

                lines.append(f"; Finish {pass_num}: A={a_deg:.1f}°")
                lines.append(f"G0 Z{clear_z:.3f}")
                lines.append(f"G0 A{a_deg:.3f}")
                lines.append(f"G0 X{points[0][0]:.3f}")
                lines.append(f"G1 Z{points[0][1]:.3f} F{plunge_mm_min:.0f}")

                for i in range(1, len(points)):
                    px, pz = points[i]
                    prev_z = points[i-1][1]
                    if abs(pz - prev_z) > 0.005:
                        lines.append(f"G1 X{px:.3f} Z{pz:.3f} F{feed_mm_min:.0f}")
                    else:
                        lines.append(f"G1 X{px:.3f} F{feed_mm_min:.0f}")

                lines.append(f"G0 Z{clear_z:.3f}")

    lines.append(f"G0 Z{clear_z:.3f}")
    lines.append("G0 A0 ; return A to home")
    return lines


def _clamp_x(x_mm: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(x_mm)))


def _gen_contour_wrapping(
    *,
    contour_points: list[tuple[float, float]],
    cylinder_diameter_mm: float,
    mach_x_start_mm: float,
    mach_x_end_mm: float,
    z_depths_mm: list[float],
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
) -> list[str]:
    """
    Wrap a 2D contour (X, linear_Y) onto the cylinder surface; X clamped to machinable span.
    """
    radius = cylinder_diameter_mm / 2.0
    clear_z = radius + safe_z_mm

    lines: list[str] = []
    lines.append(
        f"; 4-axis contour wrapping — D={cylinder_diameter_mm:.1f}mm, "
        f"{len(contour_points)} pts, X clamp [{mach_x_start_mm:.2f}..{mach_x_end_mm:.2f}], "
        f"Z levels={len(z_depths_mm)}"
    )
    lines.append(f"G0 Z{clear_z:.3f}  ; safe clearance")

    if not contour_points:
        return lines

    for zd in z_depths_mm:
        cut_z = radius + zd
        lines.append(f"; --- contour at Z_pass={zd:.3f} ---")
        first_x, first_y = contour_points[0]
        first_x = _clamp_x(first_x, mach_x_start_mm, mach_x_end_mm)
        first_a = _wrap_linear_to_a_deg(first_y, cylinder_diameter_mm)
        lines.append(f"G0 X{first_x:.3f} A{first_a:.3f}  ; rapid to contour start")
        lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}  ; plunge to cut depth")
        for x_mm, y_mm in contour_points[1:]:
            cx = _clamp_x(x_mm, mach_x_start_mm, mach_x_end_mm)
            a_deg = _wrap_linear_to_a_deg(y_mm, cylinder_diameter_mm)
            lines.append(f"G1 X{cx:.3f} A{a_deg:.3f} F{feed_mm_min:.0f}")
        lines.append(f"G0 Z{clear_z:.3f}")

    lines.append("G0 A0 ; return A to home")
    return lines


# ─── strategy: 4-axis indexed ─────────────────────────────────────────────────

def _gen_indexed_passes(
    *,
    index_angles_deg: list[float],
    cylinder_diameter_mm: float,
    mach_x_start_mm: float,
    mach_x_end_mm: float,
    z_depths_mm: list[float],
    feed_mm_min: float,
    plunge_mm_min: float,
    safe_z_mm: float,
    tool_diameter_mm: float = 3.175,
    overcut_mm: float | None = None,
) -> list[str]:
    """
    4-axis indexed: at each angle, face along X on the machinable span + overcut.
    """
    radius = cylinder_diameter_mm / 2.0
    clear_z = radius + safe_z_mm
    oc_mm = overcut_mm if overcut_mm is not None else tool_diameter_mm
    ext_x_start = max(0.0, mach_x_start_mm - oc_mm)
    ext_x_end = mach_x_end_mm + oc_mm

    lines: list[str] = []
    lines.append(
        f"; 4-axis indexed — {len(index_angles_deg)} angles, "
        f"X=[{mach_x_start_mm:.2f}..{mach_x_end_mm:.2f}] +overcut {oc_mm:.1f}mm, "
        f"Z levels={len(z_depths_mm)}"
    )
    lines.append(f"; D={cylinder_diameter_mm:.1f}mm")
    lines.append("; VERIFY: A zero, stock zero, each index angle before running")

    direction = 1
    for zd in z_depths_mm:
        cut_z = radius + zd
        if cut_z < 0.05:
            continue
        lines.append(f"; --- indexed passes at Z_pass={zd:.3f} ---")
        for i, angle in enumerate(index_angles_deg):
            if direction == 1:
                xs, xe = ext_x_start, ext_x_end
            else:
                xs, xe = ext_x_end, ext_x_start
            lines.append(f"; Index {i + 1}/{len(index_angles_deg)}  A={angle:.2f}°  Z={zd:.3f}")
            lines.append(f"G0 Z{clear_z:.3f}")
            lines.append(f"G0 A{angle:.3f}")
            lines.append(f"G0 X{xs:.3f}")
            lines.append(f"G1 Z{cut_z:.3f} F{plunge_mm_min:.0f}")
            lines.append(f"G1 X{xe:.3f} F{feed_mm_min:.0f}")
            lines.append(f"G0 Z{clear_z:.3f}")
            direction *= -1

    lines.append("G0 A0 ; return A to home position")
    return lines


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:  # noqa: C901
    cfg = _load_cfg()

    if "toolpathJsonPath" not in cfg or not cfg["toolpathJsonPath"]:
        _die("config_missing_keys", "toolpathJsonPath", code=2)

    out_json = Path(str(cfg["toolpathJsonPath"]))
    raw_strategy = cfg.get("strategy", "4axis_wrapping")
    if raw_strategy not in ALLOWED_STRATEGIES:
        _die("invalid_strategy",
             f"must be one of {sorted(ALLOWED_STRATEGIES)}, got {raw_strategy!r}", code=2)

    strategy = str(raw_strategy)

    # common params
    cyl_d = _float_param(cfg, "cylinderDiameterMm", 50.0)
    cyl_l = _float_param(cfg, "cylinderLengthMm", 100.0)
    z_pass = _normalize_radial_z_pass_mm(_float_param(cfg, "zPassMm", -1.0))
    feed = _float_param(cfg, "feedMmMin", 800.0)
    plunge = _float_param(cfg, "plungeMmMin", 300.0)
    safe_z = _float_param(cfg, "safeZMm", 10.0)
    tool_d = _float_param(cfg, "toolDiameterMm", 3.175)
    a_orient = str(cfg.get("aAxisOrientation", "x")).lower()
    if a_orient not in ("x", "y"):
        a_orient = "x"

    if cyl_d <= 0:
        _die("invalid_numeric_params", "cylinderDiameterMm must be > 0")
    if tool_d <= 0:
        _die("invalid_numeric_params", "toolDiameterMm must be > 0")
    if feed <= 0:
        _die("invalid_numeric_params", "feedMmMin must be > 0")

    stock_len = _float_param(cfg, "stockLengthMm", cyl_l)
    chuck_dep = _float_param(cfg, "chuckDepthMm", 0.0)
    clamp_off = _float_param(cfg, "clampOffsetMm", 0.0)
    z_step = _float_param(cfg, "zStepMm", 0.0)

    overcut_mm_raw = cfg.get("overcutMm")
    overcut_mm: float | None = None
    if overcut_mm_raw is not None:
        try:
            overcut_mm = float(overcut_mm_raw)
        except (TypeError, ValueError):
            pass

    stl_path = cfg.get("stlPath")
    if stl_path is not None:
        stl_path = str(stl_path)

    mach_x_s, mach_x_e_stock = _machinable_x_span(stock_len, chuck_dep, clamp_off)
    mach_x_e = min(cyl_l, mach_x_e_stock)
    raw_mx0 = cfg.get("meshMachinableXMinMm")
    raw_mx1 = cfg.get("meshMachinableXMaxMm")
    if raw_mx0 is not None and raw_mx1 is not None:
        try:
            mx0 = float(raw_mx0)
            mx1 = float(raw_mx1)
            if mx1 > mx0:
                mach_x_s = max(mach_x_s, mx0)
                mach_x_e = min(mach_x_e, mx1)
        except (TypeError, ValueError):
            pass
    if mach_x_s >= mach_x_e - 0.05:
        _die(
            "invalid_machinable_span",
            f"machinable X empty: start={mach_x_s:.2f} end={mach_x_e:.2f} "
            f"(stock={stock_len:.1f}mm, chuck={chuck_dep:.1f}mm, offset={clamp_off:.1f}mm)",
        )

    use_mesh_radial = bool(cfg.get("useMeshRadialZBands", False))
    mesh_radial_max = cfg.get("meshRadialMaxMm")
    cyl_r = cyl_d / 2.0
    if use_mesh_radial and mesh_radial_max is not None:
        try:
            mr = float(mesh_radial_max)
            if math.isfinite(mr) and mr > 0:
                z_depths = _mesh_informed_z_depths(z_pass, z_step, cyl_r, mr)
            else:
                z_depths = _iter_z_depths(z_pass, z_step)
        except (TypeError, ValueError):
            z_depths = _iter_z_depths(z_pass, z_step)
    else:
        z_depths = _iter_z_depths(z_pass, z_step)

    raw_bands = cfg.get("axialBandCount", 1)
    try:
        axial_band_count = max(1, min(24, int(raw_bands)))
    except (TypeError, ValueError):
        axial_band_count = 1

    try:
        if strategy == "4axis_wrapping":
            wrap_mode = str(cfg.get("wrapMode", "parallel")).lower()
            stepover_deg = _float_param(cfg, "stepoverDeg", 5.0)

            if wrap_mode == "contour":
                raw_pts = cfg.get("contourPoints", [])
                if not isinstance(raw_pts, list) or len(raw_pts) < 2:
                    _die("invalid_contour_points",
                         "contourPoints must be a list of ≥2 [x, y] pairs for contour wrapping")
                try:
                    pts = [(float(p[0]), float(p[1])) for p in raw_pts]
                except (TypeError, IndexError, ValueError) as e:
                    _die("invalid_contour_points", str(e))
                lines = _gen_contour_wrapping(
                    contour_points=pts,
                    cylinder_diameter_mm=cyl_d,
                    mach_x_start_mm=mach_x_s,
                    mach_x_end_mm=mach_x_e,
                    z_depths_mm=z_depths,
                    feed_mm_min=feed,
                    plunge_mm_min=plunge,
                    safe_z_mm=safe_z,
                )
            elif wrap_mode in ("silhouette_rough", "silhouette"):
                step_coarse = max(5.0, min(90.0, float(stepover_deg) * 2.5))
                lines = _gen_parallel_wrapping(
                    cylinder_diameter_mm=cyl_d,
                    mach_x_start_mm=mach_x_s,
                    mach_x_end_mm=mach_x_e,
                    z_depths_mm=z_depths,
                    stepover_deg=step_coarse,
                    feed_mm_min=feed,
                    plunge_mm_min=plunge,
                    safe_z_mm=safe_z,
                    a_axis_orientation=a_orient,
                    axial_band_count=axial_band_count,
                    tool_diameter_mm=tool_d,
                    overcut_mm=overcut_mm,
                    stl_path=stl_path,
                )
            else:
                lines = _gen_parallel_wrapping(
                    cylinder_diameter_mm=cyl_d,
                    mach_x_start_mm=mach_x_s,
                    mach_x_end_mm=mach_x_e,
                    z_depths_mm=z_depths,
                    stepover_deg=stepover_deg,
                    feed_mm_min=feed,
                    plunge_mm_min=plunge,
                    safe_z_mm=safe_z,
                    a_axis_orientation=a_orient,
                    axial_band_count=axial_band_count,
                    tool_diameter_mm=tool_d,
                    overcut_mm=overcut_mm,
                    stl_path=stl_path,
                )

        elif strategy == "4axis_indexed":
            raw_angles = cfg.get("indexAnglesDeg", [0, 90, 180, 270])
            if not isinstance(raw_angles, list) or len(raw_angles) == 0:
                _die("invalid_index_angles",
                     "indexAnglesDeg must be a non-empty list of angles (degrees)")
            try:
                angles = [float(a) for a in raw_angles]
            except (TypeError, ValueError) as e:
                _die("invalid_index_angles", str(e))
            lines = _gen_indexed_passes(
                index_angles_deg=angles,
                cylinder_diameter_mm=cyl_d,
                mach_x_start_mm=mach_x_s,
                mach_x_end_mm=mach_x_e,
                z_depths_mm=z_depths,
                feed_mm_min=feed,
                plunge_mm_min=plunge,
                safe_z_mm=safe_z,
                tool_diameter_mm=tool_d,
                overcut_mm=overcut_mm,
            )
        else:
            _die("invalid_strategy", strategy)

    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        _die("runtime_error", str(e), code=3)

    if not lines:
        _die("empty_toolpath", f"strategy {strategy!r} produced no toolpath lines", code=4)

    payload = {"ok": True, "toolpathLines": lines, "strategy": strategy}
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "lines": len(lines), "strategy": strategy}, ensure_ascii=False))


if __name__ == "__main__":
    main()
