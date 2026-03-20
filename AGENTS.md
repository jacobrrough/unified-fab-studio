# Multi-agent parity work

This repo uses **parallel streams** so several Cursor chats (or engineers) can advance CAD parity **without trashing the same files**.

1. Read **[`docs/AGENT_PARALLEL_PLAN.md`](docs/AGENT_PARALLEL_PLAN.md)** — waves, ownership, hot files, merge order.
2. Open **one new chat per stream** and paste a brief from **[`docs/agents/README.md`](docs/agents/README.md)** — or use the full menu in **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** (core **A–E** plus auxiliary **F–T**: resources, docs, tests, Python engines, **N** viewport, shared **O**, main **P**, Utilities **Q**, import **R**, IPC **S**, smoke **M**, drift **T** — see the README table).

**Reality check:** Cursor does not auto-spawn subagents for you; **you** open multiple chats and assign each brief. Streams **C + D + E** can run together with **A** if everyone respects path ownership; **B** should follow **A** when payloads change.

Track completion in **[`docs/PARITY_PHASES.md`](docs/PARITY_PHASES.md)**. **Stretch** is incremental by design — see **[`docs/STRETCH_SCOPE.md`](docs/STRETCH_SCOPE.md)**.

Verify kernel / CAM / assembly behavior against **[`docs/VERIFICATION.md`](docs/VERIFICATION.md)** before calling a phase “done.”

## Stream F (resources-only)

Bundled JSON, Handlebars posts, slicer stubs, and sample projects under **`resources/`** only — see **[`resources/README.md`](resources/README.md)** and **[`docs/agents/STREAM-F-resources-only.md`](docs/agents/STREAM-F-resources-only.md)**. Pasteable: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream F* (and **Aggressive — Stream F** for merge-ready slices). No `src/*` edits; `npm test` only if companion `docs/` changes assert IPC or file paths covered by tests.

## Stream L (slicer-only)

CuraEngine definition stubs under **`resources/slicer/`** and Cura-only **`docs/`** notes — full brief **[`docs/agents/STREAM-L-cura-slicer.md`](docs/agents/STREAM-L-cura-slicer.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream L — Cura / slicer resources*, **Aggressive — Stream L**, or **MICRO-SPRINT (attach to Stream L)** under *Micro-sprint templates*. Narrower than **F**: no `resources/machines/`, `resources/posts/`, or `resources/sample-*` in the same chat. Prefer zero **`src/**`**; one-line **`src/main/slicer.ts`** fix only if a bundled filename cannot be corrected in JSON. **`npm test`** when docs assert IPC, slicer behavior, or test-covered paths.

## Stream G (docs-only)

Markdown-only lane: README, `docs/**/*.md`, `docs/agents/**`, this file — plus workspace-root **`AGENTS.md`** only for workspace-wide entry points. Full brief: **[`docs/agents/STREAM-G-docs-only.md`](docs/agents/STREAM-G-docs-only.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream G* and **Aggressive — Stream G**.

Keep copy aligned with **`docs/PARITY_PHASES.md`** and **`docs/VERIFICATION.md`**; add checklists / troubleshooting instead of duplicating long specs. **No `src/**` or `resources/**`** (those are other streams). After edits that cite IPC channels or test-covered paths, run **`npm test`** from this folder. **`npm run build`** is optional for Stream G unless you are running a full release gate for every stream.

## Stream H (tests-only)

Vitest-only lane: **`src/**/*.test.ts`** — pick **one** island (H1 shared, H2 main helpers except `main/index.ts`, H3 `renderer/design`, H4 `ipc-contract` for **existing** channels only). Full brief: **[`docs/agents/STREAM-H-tests-only.md`](docs/agents/STREAM-H-tests-only.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream H*, **Aggressive — Stream H**, and **MICRO-SPRINT (Stream H)**. No new IPC registration (**Stream S**). Run **`npm test`**; add **`npm run build`** when using the aggressive block or a release gate.

## Stream P (Electron main helpers)

Main-process implementation under **`src/main/**/*.ts`** except **`src/main/index.ts`** — CAM/slicer/posts, drawing/project stores, assembly mesh helpers, etc. Not **`src/preload`**. Full brief: **[`docs/agents/STREAM-P-electron-main-helpers.md`](docs/agents/STREAM-P-electron-main-helpers.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream P*, **Aggressive — Stream P**, and **MICRO-SPRINT (Stream P)**. Pick one island (**P1–P4**); defer **`mesh-import-registry`**, **`tools-import`**, **`unique-asset-filename`** to **Stream R** unless coordinated; new IPC → **Stream S**. Serialize **H2** with **P** on the same **`src/main/*.ts`**. Run **`npm test`** and **`npm run build`** for **Aggressive — Stream P**.

## Stream S (IPC integration)

Single-owner lane for **`src/main/index.ts`** + **`src/preload/index.ts`** per merge batch: matching **`ipcMain.handle`** / **`ipcRenderer.invoke`**, preload **`Api`**, thin delegation to **`src/main/<module>.ts`**. Full brief: **[`docs/agents/STREAM-S-ipc-integration.md`](docs/agents/STREAM-S-ipc-integration.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream S*, **Aggressive — Stream S**, **MICRO-SPRINT (Stream S)**. Always **`npm test`** and **`npm run build`**. **Stream P** implements main helpers without registering IPC here.

## Stream N (design 3D viewport)

Design extrude/preview **R3F** viewport — **`src/renderer/design/Viewport3D.tsx`**, **`viewport3d-bounds.ts`**, and **`.design-3d*`**-scoped rules in **`styles.css`** (watch shared **`.viewport-3d`** with assembly — **Stream C**). Not sketch schema, not **Sketch2DCanvas**, not kernel. Full brief: **[`docs/agents/STREAM-N-design-viewport3d.md`](docs/agents/STREAM-N-design-viewport3d.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream N* and **Aggressive — Stream N**. Coordinate **Stream A** if **`DesignWorkspace.tsx`** must change. Run **`npm test`** and **`npm run build`** for aggressive slices.

## Stream Q (Utilities workspace UI)

**Utilities** workspace tabs — **`src/renderer/utilities/*`**, optional utility tab strip in **`AppShell.tsx`**, scoped **`styles.css`** for panels. Project / Settings / Slice / CAM / Tools / Commands / Shortcuts: copy, layout, and a11y; no new IPC (**Stream S**). Full brief: **[`docs/agents/STREAM-Q-utilities-ui.md`](docs/agents/STREAM-Q-utilities-ui.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream Q* and **Aggressive — Stream Q**. Coordinate **Stream E** on large **`App.tsx`** or **`fusion-style-command-catalog.ts`** rows. Run **`npm test`** and **`npm run build`** for aggressive slices.

## Stream M (smoke / verification report)

Post-batch **gates** and an in-chat **Gates / Drift / Handoffs** report — **`npm test`**, **`npm run build`**, **`npm run typecheck`**; optional **`python engines/cam/smoke_ocl_toolpath.py`** when **`engines/cam/`** was in scope. Full brief: **[`docs/agents/STREAM-M-verifier-smoke.md`](docs/agents/STREAM-M-verifier-smoke.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream M* and **Aggressive — Stream M**. At most **one** micro-fix per chat, or report-only. **Stream T** owns **`docs/agents/VERIFICATION_DRIFT.md`** — do not assign **M** and **T** to rewrite that file in the same batch.

## Stream O (shared non-design)

**`src/shared/**/*.ts`** except **`design-schema.ts`** and **`sketch-profile.ts`** (those are **Stream A**). Schemas and pure helpers for project, assembly, manufacture, CAM, kernel messages, etc. Full brief: **[`docs/agents/STREAM-O-shared-non-design.md`](docs/agents/STREAM-O-shared-non-design.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream O*, **Aggressive — Stream O**, and **MICRO-SPRINT (Stream O)**. Do not edit **`fusion-style-command-catalog.ts`** status rows (**Stream E**). Coordinate **Stream R** on **`mesh-import-formats.ts`**. No new IPC (**Stream S**). Run **`npm test`**; add **`npm run build`** for **Aggressive — Stream O** or a release gate.

## Stream I (Python CAM)

Python-only lane: **`engines/cam/*.py`** and **`engines/cam/README.md`**. Full brief: **[`docs/agents/STREAM-I-python-cam.md`](docs/agents/STREAM-I-python-cam.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream I* and **Aggressive — Stream I**. Coordinate **Stream D** if `cam-runner.ts` config keys, stdout error codes, or toolpath JSON file shape must change. Safe beside **Stream J** (`engines/occt/`). Run **`python engines/cam/smoke_ocl_toolpath.py`**, then **`npm test`** and **`npm run build`** when using the aggressive block.

## Stream J (Python OCCT)

Python-only lane: **`engines/occt/*.py`** and **`engines/occt/README.md`**; optional **`docs/GEOMETRY_KERNEL.md`** edits limited to Python stdout / CLI / error semantics. Full brief: **[`docs/agents/STREAM-J-python-occt.md`](docs/agents/STREAM-J-python-occt.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream J* and **Aggressive — Stream J**. No **`src/**`** — coordinate **Stream B** for kernel TypeScript and payload contracts. Safe beside **Stream I** (`engines/cam/`). Run **`npm test`** and **`npm run build`** when using the aggressive block.

## Stream R (import / mesh / tool libraries)

Unified mesh import (**`mesh-import-registry`**, **`mesh-import-formats`**), **`engines/mesh/`** (trimesh → STL), **`unique-asset-filename`**, Fusion-style **`tools-import`**, and **`project.json` `importHistory`** audit fields. Full brief: **[`docs/agents/STREAM-R-import-mesh-tools.md`](docs/agents/STREAM-R-import-mesh-tools.md)**. Pasteables: **[`docs/agents/PARALLEL_PASTABLES.md`](docs/agents/PARALLEL_PASTABLES.md)** → *Stream R — Mesh import…* and **Aggressive — Stream R**. Coordinate **Stream S** for new IPC, **Stream B**/**J** for STEP/CadQuery internals, **Stream D** for **`tool-schema`** semantics beyond import, **Stream Q** for Utilities layout vs import panels. Run **`npm test`** and **`npm run build`** when using the aggressive block.
