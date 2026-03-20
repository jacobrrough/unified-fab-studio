# OCCT / CadQuery bridge

- **STL** is parsed natively in the app for bounds and CAM previews.
- **STEP** import uses an optional **CadQuery** (OpenCascade) Python stack:

```bash
pip install cadquery
```

Then point **Settings → Python** to your `python.exe` and use **Import STEP** in the UI.

- **Kernel build (Phases 1–4):** `build_part.py` reads a JSON payload (from Electron after saving `design/sketch.json` + optional `part/features.json` `kernelOps`) and writes **STEP + STL** for **extrude** / **revolve** / **loft** (loft: **2–16** profiles, uniform `loftSeparationMm`; multi-section uses stacked segment lofts + union — see [`docs/GEOMETRY_KERNEL.md`](../docs/GEOMETRY_KERNEL.md)), then ordered **`postSolidOps`**: fillet/chamfer, shell (cap via **`openDirection`** ±X/±Y/±Z), rectangular & circular & linear-3D patterns, cylinder/box booleans (union/subtract/intersect), mirror, **sheet tab**, etc. Pre-OCC validation uses **`_require_finite_mm`** so NaN/±Inf in numeric mm fields fail as **`invalid_payload`** with a `postSolidOps[i] kind='…': …` detail (same prefix as CadQuery-time post-op failures). Invoked from **Design → Build STEP (kernel)**.

Example `kernelOps` in `part/features.json`:

```json
"kernelOps": [{ "kind": "fillet_all", "radiusMm": 0.5 }]
```

```bash
# Manual test (payload written by the app under project output/)
python engines/occt/build_part.py path/to/.kernel-build-payload.json path/to/output kernel-part
```

**Windows (PowerShell)** — use quotes so spaces in paths are safe:

```powershell
cd "C:\path\to\unified-fab-studio"
python engines\occt\build_part.py "C:\temp\.kernel-build-payload.json" "C:\temp\out" kernel-part
python engines\occt\step_to_stl.py "C:\models\part.step" "C:\temp\out\part.stl"
```

If CadQuery is not installed, STEP import and kernel build return a clear error without blocking mesh-only workflows.

**STEP → STL script:** before calling CadQuery, `step_to_stl.py` checks that the input STEP exists, is non-empty (via `stat`), creates the output STL’s parent directory, and rejects an output path that is an existing directory; JSON on stdout matches [`docs/GEOMETRY_KERNEL.md`](../docs/GEOMETRY_KERNEL.md) (single JSON line; `usage` / `step_file_not_found` / `step_file_empty` / `stl_path_is_directory` / `step_import_failed` / `stl_export_failed` / etc.).
