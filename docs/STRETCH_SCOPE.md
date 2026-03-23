# Stretch goals — scope and policy

The **stretch** rows in [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) describe **optional depth** toward commercial CAD / CAM parity. They are **not** a commitment to finish every item in one release (or ever): many depend on years of kernel, solver, and UX work.

## What “finish stretch” means here

- **Not feasible:** Implementing *every* planned command (true sheet-metal flat pattern, kinematic solvers, full drawing views, splines with constraints, turning posts, …) in a single change set.
- **Feasible:** Ship **thin vertical slices**, keep **Utilities → Commands** honest via [`fusion-style-command-catalog.ts`](../src/shared/fusion-style-command-catalog.ts), and document what shipped vs what remains.

## Recently landed stretch slices (examples)

| Area | Deliverable |
|------|-------------|
| Assembly | **Save interference report** to `output/{assembly}-interference.json` (IPC `assembly:saveInterferenceReport`) in addition to browser download. |
| Assembly | **Hierarchical BOM** text: `output/bom-hierarchical.txt` from `parentId` tree (`assembly:exportBomHierarchical`, `buildHierarchicalBomText`). |
| Assembly | **Hierarchical BOM JSON** (active rows only): `output/bom-hierarchy.json` via `assembly:exportBomHierarchyJson` + `buildBomHierarchy`. |
| Design | **Parameters file I/O**: `design:exportParameters` → `output/design-parameters.json`; `design:mergeParameters` merges `{ parameters }` into `design/sketch.json` (Utilities → Project). |
| Drawings | **`drawing/drawing.json`** + Project **Drawing manifest** (sheet + view slots). PDF/DXF run **Tier A** mesh-edge projection via `engines/occt/project_views.py` when **`output/kernel-part.stl`** + Python succeed (**no HLR**); otherwise title block + placeholder copy. |
| Manufacture | **Simulation (`mf_simulate` partial):** Manufacture tab **Tier 1** G0/G1 path preview + **Tier 2** coarse 2.5D removal proxy + optional **Tier 3** experimental voxel carve — **not** swept-volume boolean, **not** collision-safe, **not** machine kinematics. Utilities → **CAM** keeps **G-code text analysis** (bounds/motion cues). See `docs/VERIFICATION.md`. |

## Roadmap vs catalog

Several Phase **2** table rows in [`PARITY_REMAINING_ROADMAP.md`](PARITY_REMAINING_ROADMAP.md) lag the app: e.g. **Extend / Break / Split**, **concentric**, **radius/diameter** constraints, and **tangent** are already **implemented** in code — see the catalog and `solver2d` / sketch UI. Treat the roadmap tables as **historical epics**, not live truth; the catalog is the user-facing status source.

## How to extend stretch work safely

1. One **command** or **IPC** at a time (schema → main/preload → UI → tests → catalog notes).
2. After geometry / CAM / assembly changes: [`VERIFICATION.md`](VERIFICATION.md) + `npm test` from `unified-fab-studio/`.
3. Update **this file** or the roadmap when a stretch slice lands so expectations stay clear.
