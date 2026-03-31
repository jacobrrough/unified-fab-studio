"""
Project binary STL triangle edges to 2D (Tier A: mesh silhouette / edge soup, no HLR).

Tier A+: optional JSON `includeConvexHull` adds a 2D convex hull of projected vertices (merged with edge soup; still not HLR).

Tier B (stretch): Adds **mesh section** polylines — plane through mesh bbox center, perpendicular
to the view depth axis (e.g. front → Y plane), merged with Tier A edges. Not HLR; not B-rep–exact.

Tier C (stretch): When optional **stepPath** points to kernel STEP and CadQuery/OCP load succeeds,
merges **BRep plane section** polylines (tessellated edges) at the same bbox-center plane as Tier B,
then applies Tier B mesh section, then Tier A edges (union of segment sets). Still not full HLR;
section is B-rep–based when STEP works; falls back to A+B if STEP/section fails.

Reads JSON payload path from argv[1]; prints single JSON line on stdout.
Payload:
  { "stlPath": "<abs>", "views": [ { "id": "...", "axis": "front"|"top"|... } ],
    optional: "snapTolMm", "maxSegments", "includeConvexHull" (Tier A+ hull merged with edges),
    optional: "meshProjectionTier" "A"|"B"|"C" — C tries STEP BRep section + B mesh section + A,
    optional: "stepPath" "<abs>" — required for Tier C BRep attempt }

Success: { "ok": true, "views": [ { "id", "axis", "segments": [ { "x1","y1","x2","y2" } ] } ],
    optional: "projectionNotes": [ "tier_c_brep_section" ] }
Errors: { "ok": false, "error": "...", "detail": "..." }
"""

from __future__ import annotations

import json
import math
import struct
import sys
from typing import Any, Dict, List, Set, Tuple

Vec3 = Tuple[float, float, float]
Seg2 = Tuple[Tuple[float, float], Tuple[float, float]]


def _fail(code: str, detail: str | None = None) -> None:
    o: Dict[str, Any] = {"ok": False, "error": code}
    if detail:
        o["detail"] = detail
    print(json.dumps(o), flush=True)
    sys.exit(1)


def _read_binary_stl(path: str) -> List[Vec3]:
    with open(path, "rb") as f:
        data = f.read()
    if len(data) < 84:
        _fail("stl_too_small", path)
    if data[:5].lower() == b"solid":
        _fail("ascii_stl_not_supported", path)
    (n,) = struct.unpack("<I", data[80:84])
    need = 84 + n * 50
    if len(data) < need:
        _fail("stl_corrupt", f"expected {need} bytes")
    verts: List[Vec3] = []
    o = 84
    for _ in range(n):
        o += 12  # normal
        for _v in range(3):
            x, y, z = struct.unpack("<fff", data[o : o + 12])
            o += 12
            verts.append((float(x), float(y), float(z)))
        o += 2  # attribute
    return verts


def _project(axis: str, x: float, y: float, z: float) -> Tuple[float, float]:
    a = axis.lower()
    if a == "top":
        return (x, y)
    if a == "bottom":
        return (x, -y)
    if a == "front":
        return (x, z)
    if a == "back":
        return (-x, z)
    if a == "right":
        return (y, z)
    if a == "left":
        return (-y, z)
    if a == "iso":
        # Dimetric-style screen projection (documentation only)
        ex = (x - y) * math.cos(math.pi / 6)
        ey = z + (x + y) * 0.35
        return (ex, ey)
    raise ValueError(f"unknown_axis:{axis}")


def _snap(v: float, tol: float) -> float:
    return round(v / tol) * tol


def _seg_norm(p1: Tuple[float, float], p2: Tuple[float, float], tol: float) -> Seg2:
    a = (_snap(p1[0], tol), _snap(p1[1], tol))
    b = (_snap(p2[0], tol), _snap(p2[1], tol))
    if a <= b:
        return (a, b)
    return (b, a)


def _convex_hull_monotone(points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """2D convex hull; `points` may contain duplicates."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o: Tuple[float, float], a: Tuple[float, float], b: Tuple[float, float]) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: List[Tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: List[Tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _bbox_mid(verts: List[Vec3]) -> Vec3:
    if not verts:
        return (0.0, 0.0, 0.0)
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    return (
        (min(xs) + max(xs)) * 0.5,
        (min(ys) + max(ys)) * 0.5,
        (min(zs) + max(zs)) * 0.5,
    )


def _interp_edge_plane_y(
    ax: float,
    ay: float,
    az: float,
    bx: float,
    by: float,
    bz: float,
    y0: float,
) -> Vec3 | None:
    """Intersection of segment AB with plane y=y0; returns 3D point or None."""
    if abs(by - ay) < 1e-12:
        if abs(ay - y0) < 1e-9:
            return (ax, ay, az)
        return None
    t = (y0 - ay) / (by - ay)
    if t < -1e-9 or t > 1.0 + 1e-9:
        return None
    t = max(0.0, min(1.0, t))
    return (ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az))


def _interp_edge_plane_x(ax, ay, az, bx, by, bz, x0) -> Vec3 | None:
    if abs(bx - ax) < 1e-12:
        if abs(ax - x0) < 1e-9:
            return (ax, ay, az)
        return None
    t = (x0 - ax) / (bx - ax)
    if t < -1e-9 or t > 1.0 + 1e-9:
        return None
    t = max(0.0, min(1.0, t))
    return (ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az))


def _interp_edge_plane_z(ax, ay, az, bx, by, bz, z0) -> Vec3 | None:
    if abs(bz - az) < 1e-12:
        if abs(az - z0) < 1e-9:
            return (ax, ay, az)
        return None
    t = (z0 - az) / (bz - az)
    if t < -1e-9 or t > 1.0 + 1e-9:
        return None
    t = max(0.0, min(1.0, t))
    return (ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az))


def _section_edges_for_axis(
    verts: List[Vec3],
    axis: str,
    x_mid: float,
    y_mid: float,
    z_mid: float,
    tol: float,
    max_segments: int,
) -> List[Dict[str, float]]:
    """Triangle-plane intersections at bbox mid-plane (axis-dependent depth)."""
    a = axis.lower()
    edges_3d: Set[Tuple[Vec3, Vec3]] = set()

    def add_seg(p: Vec3, q: Vec3) -> None:
        if math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-9:
            return
        if p <= q:
            edges_3d.add((p, q))
        else:
            edges_3d.add((q, p))

    n_tris = len(verts) // 3
    for i in range(n_tris):
        base = i * 3
        tri = [verts[base], verts[base + 1], verts[base + 2]]
        pts: List[Vec3] = []
        if a in ("front", "back"):
            y0 = y_mid
            for k in range(3):
                va = tri[k]
                vb = tri[(k + 1) % 3]
                ip = _interp_edge_plane_y(
                    va[0], va[1], va[2], vb[0], vb[1], vb[2], y0
                )
                if ip:
                    pts.append(ip)
        elif a in ("top", "bottom"):
            z0 = z_mid
            for k in range(3):
                va = tri[k]
                vb = tri[(k + 1) % 3]
                ip = _interp_edge_plane_z(
                    va[0], va[1], va[2], vb[0], vb[1], vb[2], z0
                )
                if ip:
                    pts.append(ip)
        elif a in ("right", "left"):
            x0 = x_mid
            for k in range(3):
                va = tri[k]
                vb = tri[(k + 1) % 3]
                ip = _interp_edge_plane_x(
                    va[0], va[1], va[2], vb[0], vb[1], vb[2], x0
                )
                if ip:
                    pts.append(ip)
        else:
            continue
        # Dedupe close points on this triangle
        uniq: List[Vec3] = []
        for p in pts:
            if not any(
                math.hypot(p[0] - u[0], p[1] - u[1], p[2] - u[2]) < 1e-6
                for u in uniq
            ):
                uniq.append(p)
        if len(uniq) >= 2:
            add_seg(uniq[0], uniq[1])
        if len(uniq) >= 3:
            add_seg(uniq[1], uniq[2])
            add_seg(uniq[2], uniq[0])
        if len(edges_3d) >= max_segments:
            break

    seg2d: Set[Seg2] = set()
    for p, q in edges_3d:
        p1 = _project(axis, p[0], p[1], p[2])
        p2 = _project(axis, q[0], q[1], q[2])
        seg2d.add(_seg_norm(p1, p2, tol))
        if len(seg2d) >= max_segments:
            break

    out: List[Dict[str, float]] = []
    for (xa, ya), (xb, yb) in sorted(seg2d):
        if (xa, ya) == (xb, yb):
            continue
        out.append({"x1": xa, "y1": ya, "x2": xb, "y2": yb})
    return out


def _merge_segment_dicts(
    a: List[Dict[str, float]], b: List[Dict[str, float]], tol: float
) -> List[Dict[str, float]]:
    edges: Set[Seg2] = set()
    for s in a + b:
        try:
            p1 = (float(s["x1"]), float(s["y1"]))
            p2 = (float(s["x2"]), float(s["y2"]))
        except (KeyError, TypeError, ValueError):
            continue
        edges.add(_seg_norm(p1, p2, tol))
    out: List[Dict[str, float]] = []
    for (xa, ya), (xb, yb) in sorted(edges):
        if (xa, ya) == (xb, yb):
            continue
        out.append({"x1": xa, "y1": ya, "x2": xb, "y2": yb})
    return out


def _brep_plane_section_segments(
    step_path: str,
    axis: str,
    x_mid: float,
    y_mid: float,
    z_mid: float,
    axis_name: str,
    tol: float,
    max_segments: int,
) -> List[Dict[str, float]]:
    """Section TopoDS shape from STEP with a plane through bbox center; project edges to 2D."""
    try:
        import cadquery as cq
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
        from OCP.BRepAdaptor import BRepAdaptor_Curve
        from OCP.GCPnts import GCPnts_QuasiUniformDeflection
        from OCP.TopAbs import TopAbs_EDGE
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopoDS import TopoDS
        from OCP.gp import gp_Dir, gp_Pln, gp_Pnt
    except ImportError:
        return []

    try:
        imp = cq.importers.importStep(step_path)
        objs = getattr(imp, "objects", None) or []
        if not objs:
            return []
        shape = objs[0].val().wrapped
    except OSError:
        return []
    except Exception:
        return []

    a = axis.lower()
    pnt = gp_Pnt(float(x_mid), float(y_mid), float(z_mid))
    if a in ("front", "back"):
        d = gp_Dir(0.0, 1.0, 0.0)
    elif a in ("top", "bottom"):
        d = gp_Dir(0.0, 0.0, 1.0)
    elif a in ("right", "left"):
        d = gp_Dir(1.0, 0.0, 0.0)
    else:
        return []
    pln = gp_Pln(pnt, d)
    try:
        sec = BRepAlgoAPI_Section(shape, pln)
        sec.Build()
        if not sec.IsDone():
            return []
        sec_shape = sec.Shape()
    except Exception:
        return []

    deflection = max(0.08, float(tol) * 3.0)
    seg2d: Set[Seg2] = set()
    explorer = TopExp_Explorer(sec_shape, TopAbs_EDGE)
    while explorer.More() and len(seg2d) < max_segments:
        try:
            edge = TopoDS.Edge(explorer.Current())
            adaptor = BRepAdaptor_Curve(edge)
            u0 = adaptor.FirstParameter()
            u1 = adaptor.LastParameter()
            disc = GCPnts_QuasiUniformDeflection()
            disc.Initialize(adaptor, deflection, u0, u1)
            if not disc.IsDone() or disc.NbPoints() < 2:
                explorer.Next()
                continue
            pts3d: List[Vec3] = []
            for i in range(1, disc.NbPoints() + 1):
                v = disc.Value(i)
                pts3d.append((float(v.X()), float(v.Y()), float(v.Z())))
            for i in range(len(pts3d) - 1):
                p1 = _project(axis_name, pts3d[i][0], pts3d[i][1], pts3d[i][2])
                p2 = _project(axis_name, pts3d[i + 1][0], pts3d[i + 1][1], pts3d[i + 1][2])
                seg2d.add(_seg_norm(p1, p2, tol))
        except Exception:
            pass
        explorer.Next()

    out: List[Dict[str, float]] = []
    for (xa, ya), (xb, yb) in sorted(seg2d):
        if (xa, ya) == (xb, yb):
            continue
        out.append({"x1": xa, "y1": ya, "x2": xb, "y2": yb})
    return out


def _edges_for_axis(
    verts: List[Vec3],
    axis: str,
    tol: float,
    max_segments: int,
    include_convex_hull: bool,
) -> List[Dict[str, float]]:
    """Unique projected edges from triangle boundaries; optional Tier A+ convex hull outline."""
    edges: Set[Seg2] = set()
    n_tris = len(verts) // 3
    for i in range(n_tris):
        base = i * 3
        tri = [verts[base], verts[base + 1], verts[base + 2]]
        for k in range(3):
            a = tri[k]
            b = tri[(k + 1) % 3]
            p1 = _project(axis, a[0], a[1], a[2])
            p2 = _project(axis, b[0], b[1], b[2])
            edges.add(_seg_norm(p1, p2, tol))
            if len(edges) >= max_segments:
                break
        if len(edges) >= max_segments:
            break

    if include_convex_hull:
        snapped2d: List[Tuple[float, float]] = []
        for x, y, z in verts:
            u, v = _project(axis, x, y, z)
            snapped2d.append((_snap(u, tol), _snap(v, tol)))
        hull = _convex_hull_monotone(snapped2d)
        if len(hull) >= 3:
            for i in range(len(hull)):
                p1 = (hull[i][0], hull[i][1])
                p2 = (hull[(i + 1) % len(hull)][0], hull[(i + 1) % len(hull)][1])
                if p1 != p2:
                    edges.add(_seg_norm(p1, p2, tol))

    out: List[Dict[str, float]] = []
    for (xa, ya), (xb, yb) in sorted(edges):
        if (xa, ya) == (xb, yb):
            continue
        out.append({"x1": xa, "y1": ya, "x2": xb, "y2": yb})
    return out


def main() -> None:
    if len(sys.argv) < 2:
        _fail("usage", "project_views.py <payload.json>")
    try:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            payload = json.load(f)
    except OSError as e:
        _fail("payload_read_failed", str(e))
    except json.JSONDecodeError as e:
        _fail("payload_json_invalid", str(e))

    stl_path = payload.get("stlPath")
    views = payload.get("views")
    if not isinstance(stl_path, str) or not stl_path.strip():
        _fail("invalid_payload", "stlPath")
    if not isinstance(views, list) or len(views) == 0:
        _fail("invalid_payload", "views")

    try:
        verts = _read_binary_stl(stl_path)
    except OSError as e:
        _fail("stl_read_failed", str(e))

    tol = float(payload.get("snapTolMm") or 0.02)
    max_seg = int(payload.get("maxSegments") or 25000)
    include_hull = bool(payload.get("includeConvexHull"))
    tier_raw = str(payload.get("meshProjectionTier") or "A").strip().upper()
    use_tier_b = tier_raw in ("B", "C")
    use_tier_c = tier_raw == "C"
    step_path_opt = payload.get("stepPath")
    step_ok = (
        use_tier_c
        and isinstance(step_path_opt, str)
        and bool(step_path_opt.strip())
    )
    x_mid, y_mid, z_mid = _bbox_mid(verts)
    out_views: List[Dict[str, Any]] = []
    used_brep_section = False
    for raw in views:
        if not isinstance(raw, dict):
            continue
        vid = raw.get("id")
        axis = raw.get("axis")
        if not isinstance(vid, str) or not isinstance(axis, str):
            continue
        try:
            _project(axis, 0.0, 0.0, 0.0)
        except ValueError:
            _fail("unknown_axis", axis)
        segs = _edges_for_axis(verts, axis, tol, max_seg, include_hull)
        if use_tier_b:
            sec = _section_edges_for_axis(
                verts, axis, x_mid, y_mid, z_mid, tol, max_seg
            )
            segs = _merge_segment_dicts(segs, sec, tol)
        if step_ok:
            bp = _brep_plane_section_segments(
                step_path_opt.strip(),
                axis,
                x_mid,
                y_mid,
                z_mid,
                axis,
                tol,
                max_seg,
            )
            if bp:
                used_brep_section = True
                segs = _merge_segment_dicts(segs, bp, tol)
        out_views.append({"id": vid, "axis": axis, "segments": segs})

    out_obj: Dict[str, Any] = {"ok": True, "views": out_views}
    if use_tier_c and used_brep_section:
        out_obj["projectionNotes"] = ["tier_c_brep_section"]
    print(json.dumps(out_obj), flush=True)


if __name__ == "__main__":
    main()
