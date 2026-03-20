# Bundled resources (`unified-fab-studio/resources/`)

Shipped **with the app** (Electron `resources` root) or used as **copy-paste samples** for projects on disk. **Broad lane:** **Stream F** — [`docs/agents/STREAM-F-resources-only.md`](../docs/agents/STREAM-F-resources-only.md). **Narrow lanes:** **Stream K** (posts + machines only) — [`docs/agents/STREAM-K-posts-machines.md`](../docs/agents/STREAM-K-posts-machines.md); **Stream L** (slicer only) — [`docs/agents/STREAM-L-cura-slicer.md`](../docs/agents/STREAM-L-cura-slicer.md). Pasteables: [`docs/agents/PARALLEL_PASTABLES.md`](../docs/agents/PARALLEL_PASTABLES.md).

## Layout

| Path | Purpose |
|------|---------|
| **`machines/`** | Machine profiles (JSON): work envelope, max feed, `postTemplate`, `dialect`, `meta` hints. See [`machines/README.md`](machines/README.md) (**Stream K** with `posts/`). |
| **`posts/`** | Handlebars G-code post templates. See [`posts/README.md`](posts/README.md); safety tone in [`docs/MACHINES.md`](../docs/MACHINES.md) (**Stream K** with `machines/`). |
| **`slicer/`** | CuraEngine definition stubs (`creality_k2_plus.def.json`, `generic_fdm_250.def.json`) and [`slicer/README.md`](slicer/README.md) for paths, inheritance, and **`CURA_ENGINE_SEARCH_PATH`** (**Stream L**). |
| **`sample-kernel-solid-ops/`** | Large set of `part/features.*.example.json` slices + full project; kernel / CadQuery exercises. |
| **`sample-kernel-sheet-tab/`** | Sheet-metal style tab sample (kernel). |
| **`sample-kernel-loft-multi/`** | Multi-profile loft sample (kernel). |
| **`sample-assembly-cam-kernel/`** | Assembly + `manufacture.json` + kernel design — end-to-end JSON sample. |

## Sample projects

Open the folder as a **project** in the app (Utilities → Project → Open). Each tree has its own README with workflow notes and (where relevant) a pointer to [`docs/VERIFICATION.md`](../docs/VERIFICATION.md).

| Folder | README | What it exercises |
|--------|--------|-------------------|
| **`sample-kernel-solid-ops/`** | [README](sample-kernel-solid-ops/README.md) | Phase 3 kernel ops: swap `part/features.*.example.json` into `part/features.json`; schema-checked in CI (`sample-kernel-solid-ops-examples.test.ts`). |
| **`sample-kernel-sheet-tab/`** | [README](sample-kernel-sheet-tab/README.md) | Phase 4 `sheet_tab_union` on a thin extruded plate. |
| **`sample-kernel-loft-multi/`** | [README](sample-kernel-loft-multi/README.md) | Phase 4 multi-profile loft (2–16 profiles, uniform `loftSeparationMm`). |
| **`sample-assembly-cam-kernel/`** | [README](sample-assembly-cam-kernel/README.md) | `assembly.json` + `manufacture.json` + kernel design; uses `activeMachineId` **generic-3axis**. |

## Safety

**G-code** from posts and **slice** output from CuraEngine are **not verified** for any real machine or printer until the operator checks units, limits, and start/end scripts. Do not remove or soften warning comments in templates or machine `meta` fields.

## Related docs

- [`docs/MACHINES.md`](../docs/MACHINES.md) — verification tone and checklist.
- [`docs/VERIFICATION.md`](../docs/VERIFICATION.md) — manual QA tied to features samples may exercise.

