# Agent brief — Stream D: Phase 6 (Manufacture / CAM)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **D** (manufacture / CAM). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Status:** Phase **6 baseline** is **complete** ([`PARITY_PHASES.md`](../PARITY_PHASES.md)); this brief covers **stretch** work, **maintenance**, and **parallel-agent** boundaries.

## Mission

Extend **manufacture** intent (`manufacture/manufacture.json`) and **CAM / slice** pipelines: more operation kinds, clearer validation and operator messaging, optional OpenCAMLib paths, stock / WCS — keep Electron **main** as orchestrator.

## Owned paths (do not cross without sync)

| Area | Paths |
|------|--------|
| Schema | [`src/shared/manufacture-schema.ts`](../../src/shared/manufacture-schema.ts), [`src/shared/manufacture-cam-gate.ts`](../../src/shared/manufacture-cam-gate.ts) (`fdm_slice` / `export_stl` vs `cam:run`), [`src/shared/cam-cut-params.ts`](../../src/shared/cam-cut-params.ts) |
| Renderer | [`src/renderer/manufacture/ManufactureWorkspace.tsx`](../../src/renderer/manufacture/ManufactureWorkspace.tsx) |
| Main CAM | [`src/main/cam-runner.ts`](../../src/main/cam-runner.ts) (`runCamPipeline`, `readStlBufferForCam`, 2D validation), [`src/main/cam-local.ts`](../../src/main/cam-local.ts), [`src/main/cam-operation-policy.ts`](../../src/main/cam-operation-policy.ts) |
| Slicer | [`src/main/slicer.ts`](../../src/main/slicer.ts) |
| Python | [`engines/cam/*.py`](../../engines/cam/) |

**Avoid:** `design-schema.ts`, sketch solver, `src/renderer/design/*` (Stream A), `engines/occt/*` without Stream B coordination.

## Hard rules

- Do **not** change **`design-schema.ts`** or sketch solver.
- **G-code** is **unverified** for real machines until the operator checks post, units, and clearances — tone matches [`MACHINES.md`](../MACHINES.md).
- New **IPC**: extend in a **backward-compatible** way; **`cam:run`** already returns optional **`hint`** on failure — keep preload + renderer types in sync with main.
- From **`unified-fab-studio/`:** **`npm test`** + **`npm run build`** before claiming done.

## Suggested implementation order

1. **Schema** — new `ManufactureOperation` kinds or setup fields with Zod defaults.
2. **Validation** — actionable **`error` + `hint`** in [`cam-runner.ts`](../../src/main/cam-runner.ts) (2D geometry, empty toolpaths, OCL fallbacks already document hints on success).
3. **UI** — `ManufactureWorkspace` rows for new fields; **Make** tab surfaces CAM failure text (see `App.tsx` + `camOut`).
4. **Main** — wire to Python / built-in CAM; keep handler bodies thin in [`index.ts`](../../src/main/index.ts) if you only need registration (prefer **Stream S** for crowded IPC batches).

## Success criteria (one slice per PR)

- At least one **user-visible** improvement: new op/setup field, better error copy, test coverage in **`cam-*.test.ts`** / **`manufacture-schema`**, or catalog honesty in [`fusion-style-command-catalog.ts`](../../src/shared/fusion-style-command-catalog.ts).
- Update **[`VERIFICATION.md`](../VERIFICATION.md)** when CAM checklists or failure UX change.
- For catalog rows you touch: **status + notes** stay honest vs behavior.

## Stretch backlog (epics)

See [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) §Phase 6: true 2D cycles, stock-removal simulation, deeper slicer integration. The Manufacture tab may document **simulation stub** (`mf_simulate`) — no false claims of full sim.

## Next recommended stretch slices (pick **one** per PR)

Priority order is a suggestion; coordinate with [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) §Phase 6 epics **6.A–6.D**:

1. **Epic 6.A** — 2D milling UX: operator hints for drill cycles + contour/pocket (Manufacture); deeper sketch/projected-edge authoring remains stretch — [`ManufactureWorkspace.tsx`](../../src/renderer/manufacture/ManufactureWorkspace.tsx), [`cam-runner.ts`](../../src/main/cam-runner.ts).
2. **Epic 6.B** — OCL / builtin: harden [`ocl_toolpath.py`](../../engines/cam/ocl_toolpath.py) or [`cam-local.ts`](../../src/main/cam-local.ts) with tests (**Stream I** if Python changes).
3. **Epic 6.C** — Slicer: user-facing presets beyond fixed `buildCuraSliceArgs` / [`slicer.ts`](../../src/main/slicer.ts) (**Stream L** if `resources/slicer/` changes); Slice tab now documents current CLI defaults.
4. **Epic 6.D** — Simulation: honest **`mf_simulate`** stub copy only (no full stock-removal claims).

## Parallel note

Safe alongside **Streams A, C, E**. Prefer **no** large **`App.tsx`** edits; extract Make-tab helpers if a change grows. **Stream S** owns **`main/index.ts` + `preload`** when adding new `ipcMain.handle` channels.

**Stream R** ([`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md)) owns **tool library import** (`tools-import.ts`, merge into `manufacture.json` / `tools.json` via IPC) and **mesh import** — not CNC op semantics. Coordinate **R** if you change **`tool-schema.ts`** or on-disk tool shapes for reasons **other** than import/merge; **D** owns manufacture **operations**, **setups**, and **CAM** validation. **Stream P** may own refactors in **`cam-local`**, **`slicer`**, **`post-process`**, **`cam-runner`** internals without new channels — coordinate if **`cam-runner`** JSON or IPC shape changes.

## Verification pointers

- **CAM / manufacture:** [`VERIFICATION.md`](../VERIFICATION.md) §CAM / manufacture (`cam:run`).
- **Machines / posts:** [`MACHINES.md`](../MACHINES.md), [`resources/posts/`](../resources/posts/), [`resources/machines/`](../resources/machines/).

## Ready-to-paste agent block

Full parallel prompt text lives in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → **Stream D** / **Aggressive — Stream D**.
