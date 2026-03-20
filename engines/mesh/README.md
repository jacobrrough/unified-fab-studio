# Mesh import (unified pipeline)

`mesh_to_stl.py` converts **OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE** (and other formats **trimesh** supports) to **binary STL** under the project `assets/` folder.

## Python dependency

Use the same interpreter as **Design → Python** / STEP import:

```bash
pip install trimesh
```

Optional extras for some formats (see [trimesh docs](https://trimesh.org/install.html)).

## Contract

- Last line of stdout must be a single JSON object: `{ "ok": true }` or `{ "ok": false, "error": "...", "detail": "..." }`.
