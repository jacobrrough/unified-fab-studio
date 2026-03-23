"""
Project binary STL triangle edges to 2D (Tier A: mesh silhouette / edge soup, no HLR).

Tier B (future): OpenCascade HLRBRep_* hidden-line removal for true drawing views.

Reads JSON payload path from argv[1]; prints single JSON line on stdout.
Payload:
  { "stlPath": "<abs>", "views": [ { "id": "...", "axis": "front"|"top"|... } ] }

Success: { "ok": true, "views": [ { "id", "axis", "segments": [ { "x1","y1","x2","y2" } ] } ] }
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


def _edges_for_axis(verts: List[Vec3], axis: str, tol: float, max_segments: int) -> List[Dict[str, float]]:
    """Unique projected edges from triangle boundaries."""
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
    out_views: List[Dict[str, Any]] = []
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
        segs = _edges_for_axis(verts, axis, tol, max_seg)
        out_views.append({"id": vid, "axis": axis, "segments": segs})

    print(json.dumps({"ok": True, "views": out_views}), flush=True)


if __name__ == "__main__":
    main()
