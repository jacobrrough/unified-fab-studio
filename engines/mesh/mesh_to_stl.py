"""
Convert common mesh files to binary STL using trimesh (optional dependency).

Usage:
  python mesh_to_stl.py <input_path> <output.stl>

Stdout: single JSON line on the last line (contract matches other engine scripts).
"""
from __future__ import annotations

import json
import sys


def emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def main() -> int:
    if len(sys.argv) < 3:
        emit({"ok": False, "error": "bad_args", "detail": "expected: mesh_to_stl.py <input> <output.stl>"})
        return 1
    inp = sys.argv[1]
    outp = sys.argv[2]
    try:
        import trimesh
    except ImportError:
        emit(
            {
                "ok": False,
                "error": "trimesh_not_installed",
                "detail": "pip install trimesh  (same Python as Design/CAM settings)",
            }
        )
        return 1
    try:
        loaded = trimesh.load(inp, force=None)
        if isinstance(loaded, trimesh.Scene):
            geoms = [g for g in loaded.geometry.values() if isinstance(g, trimesh.Trimesh)]
            if not geoms:
                emit({"ok": False, "error": "empty_scene", "detail": "No triangle meshes in file"})
                return 1
            mesh = trimesh.util.concatenate(geoms) if len(geoms) > 1 else geoms[0]
        elif isinstance(loaded, trimesh.Trimesh):
            mesh = loaded
        else:
            emit({"ok": False, "error": "unsupported_geometry", "detail": type(loaded).__name__})
            return 1
        mesh.export(outp, file_type="stl")
    except Exception as e:
        emit({"ok": False, "error": "mesh_import_failed", "detail": str(e)})
        return 1
    emit({"ok": True})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
