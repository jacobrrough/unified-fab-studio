# Architecture domains — modeling vs fabrication

This document describes **logical boundaries** inside Unified Fab Studio between **Part 1 — Modeling** (design + assembly) and **Part 2 — Fabrication** (manufacture, CAM, slicing, tools, machines). It complements `AGENTS.md` and parallel stream docs.

## What belongs where

| Domain | Scope |
|--------|--------|
| **Modeling** | Sketch-to-3D, design workspace, drawing sheets, assembly workspace, kernel/mesh import into the project, part features, STL export from the design viewport into `assets/`. |
| **Fabrication** | Manufacture workspace, staged STL for CAM/slicer, Cura slice, CAM pipeline, tool libraries, machine tool libraries, machine catalog, `manufacture.json` load/save. |
| **Shared** | App shell, utilities workspace, project open/save, settings, dialogs, `src/shared/` schemas and helpers, browser/properties shell tied to the active session. |

**Utilities** (`UtilitiesWorkspacePanels`) stays shared; individual tabs may be conceptually “modeling” or “fabrication” without a hard package split.

## Renderer import rules (guidance)

- **Fabrication** code under `src/renderer/manufacture/` should not import from `src/renderer/design/` or `src/renderer/assembly/` except for types re-exported from `src/shared/` (or unavoidable shared shell hooks coordinated with other streams).
- **Modeling** code under `src/renderer/design/` and `src/renderer/assembly/` should not import manufacture panels or CAM-only UI.
- **Stable entry surfaces**: `src/renderer/modeling/index.ts` (design + assembly workspace entry points) and `src/renderer/fabrication/index.ts` (manufacture workspace). Prefer importing workspace roots from these barrels in shell code (e.g. `App.tsx`) so the integration boundary stays explicit.

These are **conventions** for new work; legacy cross-imports may exist until refactors land.

## Main process IPC

- **`registerModelingIpc`**: drawing, CAD/mesh import and preview, kernel build/compare, design/assembly/features persistence, `model:exportStl` (writes under `assets/`).
- **`registerFabricationIpc`**: machines, `stl:stage`, `slice:cura`, `cam:run`, tools, machine tools, `manufacture:load` / `manufacture:save`.
- **Remaining handlers in `src/main/index.ts`**: app version, settings, project, file dialogs, `shell:openPath`, `file:readText`.

`model:exportStl` is registered with **modeling** because it originates from the design/export path, even though fabrication consumes the resulting mesh paths.

## Project folder handoff

The same **project directory** remains the integration contract: `project.json`, `assets/` (meshes, imports), optional `design/`, `assembly.json`, `manufacture.json`, `tools.json`, etc. Fabrication consumes **binary meshes** (e.g. STL paths under `assets/`) referenced from `manufacture.json` and staged paths for CAM/slicer.

## Fabrication 3D workspace (Manufacture → Plan)

- **Layout**: `ManufactureWorkspace` Plan tab uses a **viewport-first** grid: `ManufactureCamSimulationPanel` (`layout="workspace"`) on the left, job setup and operations in a scrollable sidebar (collapsible).
- **Coordinates**: Part STL vertices and G-code preview use the same mapping as in `ManufactureCamSimulationPanel`: CNC **X → Three X**, CNC **Z → Three Y** (vertical), CNC **Y → Three Z**. Stock wireframe and machine envelope follow the same convention.
- **Part mesh**: Loaded via existing IPC `assembly:readStlBase64` with a project-relative path (same path safety as assembly). Binary STL only in the preview path; large files are triangle-capped.
- **Stock `fromExtents`**: While `stock.kind === 'fromExtents'`, the preview stock box is the part axis-aligned bounds plus `allowanceMm` per side. **Fit stock from part** writes a concrete `box` into `manufacture.json` from the selected operation’s STL.
- **Playback**: The pink tool head moves along the parsed G0/G1 polyline by arc length; it is **not** a machine simulation. All G-code remains **unverified** until the operator validates post, units, and clearances (`docs/MACHINES.md`).

## Out of scope here

Dual Electron apps, npm workspaces, and large physical file moves are deferred; barrels + IPC registration split are the first structural step.
