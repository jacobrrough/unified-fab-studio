# Sample project — assembly + manufacture + kernel

Open this folder as a **project** in Unified Fab Studio. It is meant to **exercise on-disk JSON** for:

- **`assembly.json`** — two instances of the same part, grounded base, child with `parentId`, `joint`, BOM-style fields, and different transforms.
- **`manufacture.json`** — one **setup** (stock box, WCS index, fixture note) and **operations** (`export_stl`, `cnc_parallel`) with explicit **CAM params** (feeds, safe Z). Adjust `sourceMesh` after you have an STL under the project.
- **Kernel path** — `design/sketch.json` + `part/features.json` match the other kernel samples (rectangular pattern post-op).

## Workflow (high level)

1. **Design** — build/rebuild the body with **Design → Build STEP (kernel)** (Python + CadQuery, same as `sample-kernel-solid-ops`).
2. **STL for CAM** — export or copy a mesh to e.g. `assets/part.stl` and set `manufacture.json` → `operations` → `sourceMesh` to that path (or use the app’s STL export flow if you prefer).
3. **Assembly** — interference / mesh checks only apply if you add valid **binary** `meshPath` entries on components (see schema notes in app); this sample uses sketch paths only.
4. **G-code** — any generated toolpath is **unverified** until you match post, machine profile, and controller (`docs/MACHINES.md`).

## Machine ID

`project.json` uses **`activeMachineId`: `generic-3axis`**, shipped as `resources/machines/generic-3axis.json`. Duplicate or edit that file for your real machine; do not rely on the stub envelope for collision or feed limits.

**Manual QA:** [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — **CAM / manufacture (cam:run)**, **Assembly mesh + interference**, and **Geometry kernel** for **Design → Build STEP**.
