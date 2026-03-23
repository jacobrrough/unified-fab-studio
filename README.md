# Unified Fab Studio

**Fusion-style, local-first CAD/CAM:** familiar parametric workflows (design, assembly, manufacture) with projects on disk — **not** affiliated with Autodesk or a copy of Fusion 360. See `docs/FUSION_COMMAND_PARITY.md`.

Desktop app that unifies **project workflow**, **FDM slicing** (Creality K2 Plus definition), **CNC CAM** (OpenCAMLib optional + built-in fallback), **tool library import**, and **3D model import** (STL; STEP via CadQuery; OBJ/PLY/GLTF/GLB/3MF/OFF/DAE via optional **trimesh** — see `engines/mesh/README.md`).

## Requirements

- **Node.js** 20+
- **Windows** (developed on Win10/11)

Optional:

- **CuraEngine** from an Ultimaker Cura install + **definitions** path (see `resources/slicer/README.md`)
- **Python** with `opencamlib` (richer CNC toolpaths), `cadquery` (STEP → STL), and/or `trimesh` (mesh formats → STL). Tool library: **Import library file…** (CSV, JSON, `.hsmlib` / `.tpgz` XML best-effort) or paste **Fusion Manufacture CSV** / JSON on Utilities → Tools.

## Scripts

```bash
npm install
npm run dev
npm test
npm run build
```

## Documentation map

| If you need… | Start here |
|--------------|------------|
| Honest phase status (what ships vs next) | [`docs/PARITY_PHASES.md`](docs/PARITY_PHASES.md) |
| Full remaining-phase backlog (2–7) | [`docs/PARITY_REMAINING_ROADMAP.md`](docs/PARITY_REMAINING_ROADMAP.md) |
| What “stretch” means (not all-at-once) | [`docs/STRETCH_SCOPE.md`](docs/STRETCH_SCOPE.md) |
| Manual checks + which `npm test` suites matter | [`docs/VERIFICATION.md`](docs/VERIFICATION.md) |
| Running several agents without merge fights | [`docs/AGENT_PARALLEL_PLAN.md`](docs/AGENT_PARALLEL_PLAN.md), [`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md) |
| New IPC (`main` + `preload` only — **Stream S**) | [`docs/agents/STREAM-S-ipc-integration.md`](docs/agents/STREAM-S-ipc-integration.md) |
| Main helpers (`src/main/**` except `index.ts` — **Stream P**) | [`docs/agents/STREAM-P-electron-main-helpers.md`](docs/agents/STREAM-P-electron-main-helpers.md) |
| Mesh import, tool library parsers, `importHistory`, `engines/mesh` (**Stream R**) | [`docs/agents/STREAM-R-import-mesh-tools.md`](docs/agents/STREAM-R-import-mesh-tools.md) |
| Slicer / Cura definition stubs only (**Stream L**, no posts/machines/samples) | [`docs/agents/STREAM-L-cura-slicer.md`](docs/agents/STREAM-L-cura-slicer.md) |
| Docs-only edits (Markdown, no `src/` — **Stream G**) | [`docs/agents/STREAM-G-docs-only.md`](docs/agents/STREAM-G-docs-only.md) |
| Design **3D preview** (`Viewport3D`, grid/lighting/navigation — **Stream N**; coordinate sketch **Stream A**) | [`docs/agents/STREAM-N-design-viewport3d.md`](docs/agents/STREAM-N-design-viewport3d.md) |
| G-code / machine safety tone | [`docs/MACHINES.md`](docs/MACHINES.md) |
| CadQuery manifest, loft, kernel payload | [`docs/GEOMETRY_KERNEL.md`](docs/GEOMETRY_KERNEL.md) |
| Command catalog vs commercial CAD scope | [`docs/FUSION_COMMAND_PARITY.md`](docs/FUSION_COMMAND_PARITY.md) |
| In-app shortcut reference | [`docs/KEYBOARD_SHORTCUTS.md`](docs/KEYBOARD_SHORTCUTS.md) |

## Troubleshooting (local dev)

| Symptom | What to try |
|---------|-------------|
| `ipc-contract` test fails | Every preload `invoke` channel needs a matching `ipcMain.handle` in main — update [`src/preload/index.ts`](src/preload/index.ts) and [`src/main/index.ts`](src/main/index.ts) together (one owner per batch: [`docs/agents/STREAM-S-ipc-integration.md`](docs/agents/STREAM-S-ipc-integration.md)). |
| **Build STEP (kernel)** errors | Set the **Python** path in Design settings; install **`cadquery`** in that environment (`pip install cadquery`). Save the project before building. |
| CAM shows fallback / hint copy | **`opencamlib`** is optional — `pip install opencamlib` in the Python env the app uses for CAM; without it, built-in mesh strategies apply (see [`docs/PARITY_PHASES.md`](docs/PARITY_PHASES.md)). |
| Dev server / window issues | Run commands from **`unified-fab-studio/`**; `npm install` after clone; **Node.js 20+**. |
| **FDM slice** fails (missing definition / CuraEngine) | Set **CuraEngine.exe** and the **definitions** folder (must contain `fdmprinter.def.json`) under **Utilities → Settings → Paths**. See [`resources/slicer/README.md`](resources/slicer/README.md) for Windows path examples. |
| **Mesh formats** (OBJ, PLY, GLTF, …) fail to import | App **Python** path must have **`pip install trimesh`** (see [`engines/mesh/README.md`](engines/mesh/README.md)). |

## Design + build + manufacture (Fusion-like, local)

- **Design** — Sketch v2 with **point IDs**, **parameters**, **constraints** (horizontal, vertical, parallel, perpendicular, coincident, distance, fix, collinear, midpoint, **angle**, equal length), **arcs** (three-point + optional chord profiles), **trim** (polyline/arc targets), **Solve sketch** (`solver2d.ts`). **Extrude**, **revolve**, or **loft** preview (**2–16** closed profiles in sketch order, uniform **`loftSeparationMm`** between consecutive sections; see [`docs/PARITY_PHASES.md`](docs/PARITY_PHASES.md) Phase 4). **Undo**, **mirror X**, **linear pattern**. **3D preview:** optional **Measure** (Shift+click two points, mm) and **Section** (Y clip) — uses the **preview mesh** only; verify critical sizes against kernel output if needed. Saves `design/sketch.json` (v2) + `part/features.json` (feature browser + optional **`kernelOps`**: patterns, booleans, mirror, **+ sheet tab** in the ribbon, etc.). **Build STEP (kernel)** runs CadQuery (`engines/occt/build_part.py`) → `output/kernel-part.step` + `.stl` and `part/kernel-manifest.json` (needs Python + `pip install cadquery`).
- **Assembly** — `assembly.json` (v2): components, transforms, grounded flag, optional **motion link stub** (`linkedInstanceId` + `motionLinkKind` mate/contact/align — no kinematic solver), joint presets through **`ball`**, optional **`explodeView`** / **`motionStudy`** (3D **STL preview** with explode slider + keyframe motion scrub — not a kinematic solver), optional **`revolutePreviewAngleDeg`** + **`revolutePreviewAxis`** (world X/Y/Z) and **`sliderPreviewMm`** + axis on **slider** rows (viewport-only subtree stubs), optional BOM fields **`bomUnit` / `bomVendor` / `bomCostEach`**, BOM **preview** column **Thumb** (raster from **`meshPath`**), **Duplicate row**, optional **`meshPath`** (binary STL per instance) + path **lint** hints; **Assembly** tab: **interference** → **`assembly:interferenceCheck`**, then **Export report JSON** (download); **Download BOM CSV (editor)** (current table, unsaved OK) vs **Export BOM** → `output/bom.csv` from saved file; **Export JSON** + **summary (.txt)**; **`assembly:summary`** includes mesh-path, motion-link roll-ups, **externalComponentRef** / BOM-note roll-ups, and other metadata (no substitute for interference).
- **Drawings (stretch)** — optional **`drawing/drawing.json`**: set **primary sheet** name/scale under **Utilities → Project** → **Drawing manifest**; **PDF/DXF** export includes that text in the title block (no projected model views yet).
- **Make** — `manufacture.json`: setups (machine + stock + WCS offset / fixture notes) and operation list (FDM / CNC op kinds; **`cnc_waterline`** / **`cnc_adaptive`** use **OpenCAMLib** waterline / AdaptiveWaterline in **`engines/cam/ocl_toolpath.py`** when Python has `opencamlib`, otherwise the built-in STL parallel finish; **`cnc_raster`** / **`cnc_pencil`** use **OpenCAMLib PathDropCutter** raster in the same script when OCL is available (**pencil** applies a tighter effective stepover via `resolvePencilStepoverMm`), otherwise a **built-in 2.5D mesh height-field** raster and an **orthogonal bounds** zigzag fallback). CNC ops can set **tool Ø**, **library tool**, and **cutting parameters** (`zPassMm`, `stepoverMm`, `feedMmMin`, `plungeMmMin`, `safeZMm` in `params`) for **`cam:run`** — see `src/shared/cam-cut-params.ts` / `cam-tool-resolve.ts` for defaults. **G-code is unverified** until you check posts, units, and clearances (`docs/MACHINES.md`).
- Kernel notes: [`docs/GEOMETRY_KERNEL.md`](docs/GEOMETRY_KERNEL.md). Parity phases: [`docs/PARITY_PHASES.md`](docs/PARITY_PHASES.md). **How to verify** (kernel / CAM / assembly mesh): [`docs/VERIFICATION.md`](docs/VERIFICATION.md). **Parallel agent streams:** [`AGENTS.md`](AGENTS.md) → [`docs/AGENT_PARALLEL_PLAN.md`](docs/AGENT_PARALLEL_PLAN.md).
- **Utilities → Commands** — searchable **CAD-style command catalog** (implemented / partial / planned). See [`docs/FUSION_COMMAND_PARITY.md`](docs/FUSION_COMMAND_PARITY.md) for scope; full commercial CAD depth is not implied.

## Design (2D / 3D) details

- Polylines store vertices in `points` map; constraints reference **point UUIDs** (shown as dots on canvas).
- Legacy **v1** sketch files migrate to v2 on load.

## Project layout

- `src/main` — Electron main, IPC, CAM/slicer orchestration
- `src/renderer` — React UI
- `src/renderer/design` — sketch, solver, extrude/revolve mesh, viewport, STL export
- `src/renderer/assembly` — assembly + BOM UI
- `src/renderer/manufacture` — setups / operations UI
- `resources/machines` — JSON machine profiles (Laguna, Makera, Creality)
- `resources/posts` — Handlebars G-code post templates
- `resources/slicer` — Creality K2 Plus Cura definition stub
- `engines/cam` — Python OpenCAMLib hook (`ocl_toolpath.py`: waterline, adaptive, raster PathDropCutter)
- `engines/occt` — CadQuery STEP bridge
- `engines/mesh` — optional **trimesh** mesh → STL for unified import

## Safety

Generated G-code is **not** guaranteed safe for your specific controller until you verify **post processors**, **units**, and **clearance heights**. Read `docs/MACHINES.md`.

## Cursor / AI

- **This repo:** multi-agent parity briefs → [`AGENTS.md`](AGENTS.md) (same folder as this README).
- **Parent folder** (`3d software`): if you keep workspace rules/skills there, they apply when that folder is the Cursor workspace root; this app’s stream briefs are still under **`unified-fab-studio/docs/agents/`**.
