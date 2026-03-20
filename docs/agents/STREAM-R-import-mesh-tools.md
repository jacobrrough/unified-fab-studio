# Agent brief — Stream R: Mesh import, unified asset pipeline, tool libraries

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **R** (import / mesh / tools). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Related:** [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md) — shared Zod/helpers lane; coordinate on **`mesh-import-formats.ts`**. [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) — **Stream P** may touch other `src/main/**` modules; **R** owns registry / tools-import / unique-asset-filename / **`engines/mesh`** unless coordinated.

**Role:** Own the **project mesh import registry** (STL / STEP / trimesh-backed formats), **collision-safe asset filenames**, **Fusion-style tool library import** (CSV / JSON / `.tools` gzip), and the **`importHistory` audit trail** — without taking over sketch schema, kernel solid payloads, or unrelated CAM strategy.

### See also

- Manual checks: [`../VERIFICATION.md`](../VERIFICATION.md) (§Project mesh import, §Tool library).
- STEP tessellation (CadQuery): coordinate **Stream B** / **J** — [`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md) for kernel JSON; **R** does not own `build_part.py`.

## Mission

Ship improvements so that:

- **Unified import** (`importMeshViaRegistry`) stays predictable: correct extension routing, clear `MeshImportErr` codes, honest `ImportHistoryEntry` reports (`roundTripLevel`, warnings).
- **Python mesh bridge** (`engines/mesh/mesh_to_stl.py`) stays aligned with Node: **last non-empty line** of stdout is a single JSON object (same pattern as OCCT scripts — see [`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md) if you document it next to other Python bridges).
- **Tool imports** (`tools-import.ts`) tolerate real-world Fusion exports: CSV edge cases, JSON validation, gzip `.tools` — with regression tests.
- **Project JSON** (`importHistory` on `project.json`) remains valid: extend fields only when import/report semantics need it, with Zod + tests.

## Allowed paths

| Primary | Notes |
|---------|--------|
| [`src/main/mesh-import-registry.ts`](../../src/main/mesh-import-registry.ts) | Routes `.stl` / `.step|.stp` / trimesh extensions; builds `ImportHistoryEntry` |
| [`src/main/mesh-import-registry.test.ts`](../../src/main/mesh-import-registry.test.ts) | Registry + dialog extensions |
| [`src/main/tools-import.ts`](../../src/main/tools-import.ts) | `parseFusionToolsCsv`, JSON / gzip tool library merge |
| [`src/main/tools-import.test.ts`](../../src/main/tools-import.test.ts) | Parser + merge behavior |
| [`src/main/unique-asset-filename.ts`](../../src/main/unique-asset-filename.ts) | `_2`, `_3`, … disambiguation under `assets/` |
| [`src/main/unique-asset-filename.test.ts`](../../src/main/unique-asset-filename.test.ts) | Filename helper |
| [`src/shared/mesh-import-formats.ts`](../../src/shared/mesh-import-formats.ts) | `MESH_IMPORT_FILE_EXTENSIONS`, `MESH_PYTHON_EXTENSIONS` (keep in sync with Python README) |
| [`engines/mesh/*`](../../engines/mesh/) | `mesh_to_stl.py`, [`README.md`](../../engines/mesh/README.md) |
| [`src/shared/project-schema.ts`](../../src/shared/project-schema.ts) | **`importHistory` / `importHistoryEntrySchema` / `roundTripLevel` only** when the import pipeline needs new audit fields |

**Read-only / thin touch elsewhere**

| File | When |
|------|------|
| [`src/main/cad/occt-import.ts`](../../src/main/cad/occt-import.ts) | **STEP branch** calls `importStepToProjectStl` — do not redesign CadQuery behavior here (**Stream B** + **J** own `step_to_stl.py` / kernel cad) |
| [`src/main/index.ts`](../../src/main/index.ts) + [`src/preload/index.ts`](../../src/preload/index.ts) | **New or renamed IPC** ⇒ **preload + main + `ipc-contract.test.ts`** in the same batch; prefer **Stream S** if `main` is crowded |
| [`src/shared/tool-schema.ts`](../../src/shared/tool-schema.ts) | Prefer **Stream R** for fields required by **import/merge**; coordinate **Stream D** if manufacture / CAM semantics of `ToolRecord` change |
| [`src/renderer/utilities/UtilitiesWorkspacePanels.tsx`](../../src/renderer/utilities/UtilitiesWorkspacePanels.tsx) | Import history / mesh & tools import **UX** tied to `importHistory` or import copy — coordinate **Stream Q** if the change is generic Utilities polish only |

## IPC channels (existing)

| Channel | Owner body |
|---------|------------|
| `assets:importMesh` | `importMeshViaRegistry` (project dir, source path, python path) |
| `tools:import` | `tools-import` merge into `manufacture.json` |
| `tools:importFile` | File path variant |

Any **new** `ipcRenderer.invoke` name must have a matching `ipcMain.handle` and appear in [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts).

## Stdout JSON contract (`engines/mesh/mesh_to_stl.py`)

Node uses **`runPythonJson`** (shared with OCCT): the **final non-empty line** after exit must be JSON.

- Success: `{ "ok": true }` (see [`engines/mesh/README.md`](../../engines/mesh/README.md))
- Failure: `{ "ok": false, "error": "...", "detail": "..." }`

Do not `print()` debug noise to stdout; use stderr if needed.

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| New mesh format routed through **registry** + **formats list** + **Python script** (if needed) | Redesign **sketch-profile** / **design-schema** |
| Clearer errors, warnings on `ImportHistoryEntry`, batch import UX (renderer) when import-scoped | Large unrelated **CAM** refactors (`cam-local`, toolpath) — **Stream D** |
| Extend `importHistoryEntrySchema` with optional fields + migration-safe defaults | Silent import failures or breaking `project.json` without Zod/tests |

- **`npm test` && `npm run build`** from `unified-fab-studio/` before claiming **Aggressive — Stream R** done.
- Update **[`docs/VERIFICATION.md`](../VERIFICATION.md)** when the **manual checklist** for mesh/import behavior changes.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **S** | **IPC registration** batch owner — R implements handlers in dedicated modules; S wires `index.ts` / preload when needed |
| **P** | **Main helpers** (`src/main/**` except `index.ts`) — **P** must not own **R** files unless coordinated; serialize **H2** tests on the same `src/main/*.ts` pair |
| **B** / **J** | **STEP → STL** implementation and CadQuery errors — R consumes `occt-import`; coordinate if STEP error codes or paths change |
| **D** | **Manufacture** tab and CAM use of tool libraries — coordinate if `tool-schema` or on-disk `manufacture.json` shape changes for non-import reasons |
| **O** | Shared modules under `src/shared/` — **O** must not expand **`mesh-import-formats.ts`** for routing without **R** (see [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md)) |
| **Q** | **Utilities** workspace shell — R owns import/history **behavior**; Q owns broad Utilities **layout** — avoid two agents editing the same file in one batch |
| **H** | Extra tests in `mesh-import-registry.test.ts`, `tools-import.test.ts`, etc. — pick an island; do not add **new** IPC from H |
| **I** | **`engines/cam/`** — disjoint from **`engines/mesh/`**; safe in parallel |
| **G** | Doc-only tweaks to VERIFICATION import rows — **G** can own prose; **R** owns behavior truth |
| **O** | **`mesh-import-formats.ts`** — **R** owns extension tables and registry alignment; **O** touches other `src/shared/**` modules — coordinate if both need the same file |

## Success criteria (pick one slice per chat)

One shipped theme, for example:

- One new **file extension** in the unified dialog + registry + `mesh_to_stl.py` (if applicable) + tests  
- One **CSV / `.tools` parser** edge case with tests  
- **importHistory** UX row (warnings, `roundTripLevel` explanation) in Utilities  
- **VERIFICATION.md** row + matching behavior for import or tool merge  

## Final reply format

End with a single line:

`Shipped: Import — <format / parser / IPC / schema slice> — <designer or integrator-visible outcome>.`
