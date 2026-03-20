# All streams — copy-paste agent plans

**App root:** `unified-fab-studio/` — run commands from there unless noted.

**Master references:** [`AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md), [`COORDINATOR_PARALLEL_WORKFLOW.md`](COORDINATOR_PARALLEL_WORKFLOW.md) (lead-chat guide: variants, streams, conflicts, merge order, gates), [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) (aggressive blocks + conflict matrix), [`VERIFICATION.md`](../VERIFICATION.md).

**Parity:** [`PARITY_PHASES.md`](../PARITY_PHASES.md) — phases **1–7 baselines Done**; **§ Stream status & todos** below maps each stream to **done vs next**.

**How to use:** Start a **new chat**, paste **one** block below as the first message. For depth, open the linked **STREAM-*.md** brief in the same folder.

---

## Quick index

| Stream | Focus | Full brief |
|--------|--------|------------|
| **Coordinator** | Merge order, hot files, gate collection | [`COORDINATOR_PARALLEL_WORKFLOW.md`](COORDINATOR_PARALLEL_WORKFLOW.md); pasteables: this file § below + [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → Aggressive coordinator |
| **A** | Sketch v2, solver, design UI | [`STREAM-A-phase2-sketch.md`](STREAM-A-phase2-sketch.md) |
| **B** | CadQuery kernel, `build_part.py`, manifest | [`STREAM-B-phase3-solid-kernel.md`](STREAM-B-phase3-solid-kernel.md) |
| **C** | Assembly, BOM, interference, viewport | [`STREAM-C-phase5-assembly.md`](STREAM-C-phase5-assembly.md) |
| **D** | Manufacture, CAM, `cam:run`, engines/cam TS | [`STREAM-D-phase6-manufacture.md`](STREAM-D-phase6-manufacture.md) |
| **E** | Shell, palette, product polish | [`STREAM-E-phase7-product.md`](STREAM-E-phase7-product.md) |
| **F** | `resources/**` bundles | [`STREAM-F-resources-only.md`](STREAM-F-resources-only.md) |
| **G** | Docs-only | [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md) |
| **H** | Vitest islands H1–H4 | [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md) |
| **I** | `engines/cam/*.py` | [`STREAM-I-python-cam.md`](STREAM-I-python-cam.md) |
| **J** | `engines/occt/*.py` | [`STREAM-J-python-occt.md`](STREAM-J-python-occt.md) |
| **K** | `resources/posts/`, `resources/machines/` | [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) |
| **L** | `resources/slicer/` | [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) |
| **M** | Smoke gate, in-chat report (not drift file) | [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) |
| **N** | Design `Viewport3D` | [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) |
| **O** | `src/shared/*` except design sketch | [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md) |
| **P** | `src/main/*` except `index.ts` | [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) |
| **Q** | Utilities workspace UI | [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) |
| **R** | Mesh import, tools, `importHistory` | [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) |
| **S** | Preload + `main/index.ts` IPC only | [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) |
| **T** | `VERIFICATION_DRIFT.md`, typecheck truth | [`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md) |

---

## Stream status & todos (sync with `PARITY_PHASES.md`)

**Source of truth:** [`PARITY_PHASES.md`](../PARITY_PHASES.md) — phases **1–7** baselines are **Done** (as of the table there). This section tells each stream what is **already shipped** vs **typical next work**; details and catalog IDs live in [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) and [`STRETCH_SCOPE.md`](../STRETCH_SCOPE.md).

| Stream | Already complete (baseline — do not claim as greenfield) | Current todos (pick one slice per chat) |
|--------|------------------------------------------------------------|-------------------------------------------|
| **A** | Sketch v2 baseline: line, polygon, slot, polylines, arcs, trim/fillet/chamfer, extend/break/split, offset, major constraints, linear dims (phase table). **Shipped stretch:** **ellipse**, **spline_fit / spline_cp**, **spline/solver honesty** (catalog + `design-schema` tests), **selection-scoped** move/rotate/scale/mirror vs whole sketch, **linear + circular `sk_pattern_sk`** (circular matches kernel `pattern_circular` step rule), optional **`parameterKey`** dim readout + **driving-length** path (`co_distance` + same key), trim/fillet polish on **ellipse / spline** edges in `sketch-profile`, partial **`sk_project`** (mesh pick → plane projection; not B-rep edge topology). | **`sk_project` depth** (true edge/curve references + trim — coordinate **N**/kernel), **path `sk_pattern_sk`** along sketch polyline, deeper **driving dimensions** (beyond `co_distance` + parameterKey), remaining trim/fillet edge cases — §Phase 2 + [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) |
| **B** | Kernel solid ops + samples, loft multi-profile + sheet tab, manifest `loftStrategy`, suppressed ops queue (phases 3–4) | Bends/flat pattern, loft guides, richer combine/split/thread UX, plastic/rule features — §Phase 3–4 stretch |
| **C** | v2 assembly, STL viewport, explode + keyframe motion, BOM CSV + hierarchical exports, BOM **preview** thumbnails (cache + lazy-load), interference save/download, summary roll-ups, joint/DOF + motion-link UX, **revolute** + **slider** + **universal** + **cylindrical** preview stubs, motion vs joint **preview order** documented in UI, **Duplicate row**, **Insert from project** (relative `partPath`) | Full multibody kinematics / joint limits beyond preview — §Phase 5 stretch |
| **D** | Setups/stock/WCS, `cnc_parallel` + OCL waterline/adaptive/raster w/ fallbacks, 2D contour/pocket/drill w/ validation, error+hint, sim stub panel | Stock-removal sim, deeper 2D/slicer, OCL/fallback polish, cycle tuning — §Phase 6 stretch |
| **E** | Command palette + a11y, shortcuts, parameters export/merge, drawing PDF/DXF shell, persistence, partial drawing manifest / measure / section (phase 7 row) | True projected views, kernel-accurate inspect, fuller drawing pipeline, i18n — §Phase 7 stretch |
| **F** | — | Machine/post/sample/slicer **bundle** quality under `resources/**` |
| **G** | — | Align README, agents docs, PARITY/VERIFICATION prose; run `npm test` when IPC paths cited |
| **H** | — | Add Vitest coverage by island H1–H4; use [`VERIFICATION.md`](../VERIFICATION.md) suite list as backlog hints |
| **I** | Python OCL sidecar + smoke script | Clearer JSON/errors, README, isolated `ocl_toolpath` experiments — coordinate **D** on TS contract |
| **J** | OCCT/CadQuery scripts + stdout JSON contract | Edge-case errors, docs in `GEOMETRY_KERNEL.md` — **zero** `src/**`; coordinate **B** |
| **K** | — | Posts + machines JSON honesty, template headers, MACHINES.md tone |
| **L** | — | `resources/slicer/*.def.json` + README (`CURA_ENGINE_SEARCH_PATH`, inherits) |
| **M** | — | `npm test` + `npm run build` + `npm run typecheck` → in-chat Gates / Drift / Handoffs |
| **N** | Design 3D preview (extrude mesh) + bounds tests | R3F polish, `.design-3d*` CSS, `viewport3d-bounds` — not sketch schema |
| **O** | Shared Zod/helpers for project/CAM/assembly/kernel (non-sketch) | One theme O1–O5: schema hardening + tests; coordinate **R** on `mesh-import-formats.ts` |
| **P** | CAM/slicer/drawing/assembly STL helpers in `src/main/*` | Errors, extraction, tests — **not** `index.ts`; defer import registry to **R** |
| **Q** | Utilities tabs (Project, Settings, Slice, CAM, Tools, Commands, Shortcuts) baseline | Copy, a11y, import-history presentation, MACHINES.md disclaimers — **no** new IPC |
| **R** | Unified `assets:importMesh`, formats → STL, `importHistory`, Fusion CSV + tool file import (roadmap §7.E) | Parser edge cases, format coverage, Utilities import UX — new IPC → **S** |
| **S** | Existing preload ↔ main channel pairs (`ipc-contract.test.ts`) | Additive IPC batches only; thin handlers in `src/main/*.ts` |
| **T** | — | Refresh `docs/agents/VERIFICATION_DRIFT.md`; do not pair with **M** on same drift rewrite |

---

## Coordinator (optional lead chat)

```text
COORDINATOR — Unified Fab Studio (unified-fab-studio/)

Read: docs/agents/COORDINATOR_PARALLEL_WORKFLOW.md, docs/AGENT_PARALLEL_PLAN.md, docs/PARITY_PHASES.md, docs/PARITY_REMAINING_ROADMAP.md, docs/VERIFICATION.md, docs/agents/PARALLEL_PASTABLES.md (conflict matrix + Aggressive coordinator rules).

Your job: assign streams, enforce merge order, collect Shipped: one-liners and gate results.

Hard rules (summary):
• At most ONE parallel chat freely edits src/main/index.ts + src/preload/index.ts per batch — use Stream S or serialize.
• IPC: every preload ipcRenderer.invoke must have ipcMain.handle — npm test runs ipc-contract.test.ts.
• Merge order: S first if IPC batch → A before B if sketch-profile/design-schema changed → others if git diff is disjoint.
• App.tsx: ≤25 lines per non-S chat unless extracted to a new module first.
• Stream T owns docs/agents/VERIFICATION_DRIFT.md — do not assign M and T to rewrite it in the same batch.

Reject work with no npm test / no honest catalog + PARITY updates when behavior is user-visible.

Shipped: Coordinator — <batch id> — <merge notes; open risks>.
```

**Full guide (variants, stream table, conflict pairs, merge order, gate matrix):** [`COORDINATOR_PARALLEL_WORKFLOW.md`](COORDINATOR_PARALLEL_WORKFLOW.md).

---

## Stream A — Phase 2 sketch

```text
STREAM A — Phase 2 sketch (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-A-phase2-sketch.md

You own: src/shared/design-schema.ts, src/shared/sketch-profile.ts, src/renderer/design/*, src/renderer/design/solver2d.ts. Minimize src/renderer/src/App.tsx; extract helpers to design/*.

**Status:** Phase 2 baseline **Done** (see PARITY_PHASES + § Stream status & todos above). Deliver **stretch** or **regression** slices — not “ship baseline sketch” unless the phase table regressed.

Do NOT change engines/occt/build_part.py without coordinating Stream B on kernel payload.

Deliver: one vertical slice per chat — e.g. spline/driving-dim/constraint edge case, catalog honesty, bugfix with tests.

Gates: npm test && npm run build from unified-fab-studio/

Docs: update src/shared/fusion-style-command-catalog.ts for commands you touch; PARITY_PHASES or roadmap if scope shifts.

Shipped: A — <catalog id(s) or fix> — <user-visible outcome>.
```

---

## Stream B — Phase 3–4 kernel (CadQuery)

```text
STREAM B — Kernel / CadQuery (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-B-phase3-solid-kernel.md

You own: engines/occt/*, src/main/cad/build-kernel-part.ts, kernel-manifest / part-features schemas as needed.

**Status:** Phases 3–4 baselines **Done** (solid-op samples, loft, sheet tab, `loftStrategy`). Deliver **stretch** kernel/surface/sheet work — PARITY_REMAINING_ROADMAP §3–4.

Do NOT own sketch canvas UI. Rebase after Stream A if sketch-profile or design-schema changed upstream.

Deliver: one kernel op improvement, clearer Python errors, or sample under resources/sample-kernel-solid-ops/ with tests.

Gates: npm test && npm run build

Docs: docs/GEOMETRY_KERNEL.md for behavior you change; PARITY + catalog when user-visible.

Shipped: B — Kernel — <op/sample> — <outcome>.
```

---

## Stream C — Phase 5 assembly

```text
STREAM C — Assembly (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-C-phase5-assembly.md

You own: src/shared/assembly-schema.ts, src/renderer/assembly/*

**Status:** Phase 5 baseline + stretch **Done** (viewport, BOM exports + preview thumbs with cache + lazy-load, revolute/slider/universal/cylindrical **viewport preview** stubs + parent-local frames, motion-study vs joint **preview order** note, duplicate row, interference, motion scrub, joint/DOF + motion-link UX, **Insert from project**). Next: true kinematics beyond preview stubs — PARITY_REMAINING_ROADMAP §5.

IPC: if you add/change channels, use Stream S in the same batch — preload + main + ipc-contract.

Do NOT edit design-schema or sketch solver.

Gates: npm test && npm run build

Shipped: C — Assembly — <surface> — <outcome>.
```

---

## Stream D — Phase 6 manufacture / CAM

```text
STREAM D — Manufacture / CAM (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-D-phase6-manufacture.md

You own: src/shared/manufacture-schema.ts, src/renderer/manufacture/*, src/main/cam-*, engines/cam/* (with Stream I for Python).

**Status:** Phase 6 baseline **Done** (2D ops, OCL stack, hints, sim stub). Next: stretch in PARITY_REMAINING_ROADMAP §6 — not “prove baseline CAM” unless regressed.

Do NOT own design sketch or assembly internals.

Safety: never imply G-code is safe without user verification — docs/MACHINES.md tone in UI.

Gates: npm test && npm run build

Shipped: D — CAM — <area> — <machinist-visible outcome>.
```

---

## Stream E — Phase 7 product / shell

```text
STREAM E — Product / shell (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-E-phase7-product.md

You own: src/renderer/shell/*, src/renderer/commands/*, src/shared/fusion-style-command-catalog.ts, src/renderer/src/styles.css — prefer new files over huge src/renderer/src/App.tsx edits.

**Status:** Phase 7 baseline **Done** (palette, shortcuts, parameters, drawing export shell, partial inspect/drawing manifest per PARITY_PHASES). Next: true views, kernel inspect, pipeline depth — §7 roadmap.

Cap: ≤25 lines in src/renderer/src/App.tsx per batch unless you extracted a component module first.

Gates: npm test && npm run build

Shipped: E — Product — <command id or feature> — <what user sees>.
```

---

## Stream F — Resources only

```text
STREAM F — Resources only (Unified Fab Studio)

App root: unified-fab-studio/

You work ONLY under resources/ (machines, posts, slicer stubs, samples) and optional docs that describe those paths.

Avoid src/** except a one-line path string fix if something is broken.

Gates: npm test if docs assert IPC or paths; otherwise optional per PARALLEL_PASTABLES Aggressive F.

Shipped: F — Resources — <path> — <artifact>.
```

---

## Stream G — Docs only

```text
STREAM G — Docs only (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-G-docs-only.md (allowed paths, IPC spot-check, overlap F/H/T/M/S, closing checklist — all in that file)

You edit: unified-fab-studio/docs/*.md, README.md, AGENTS.md, docs/agents/*.md — no application logic except comment typos.

Align with PARITY_PHASES.md and VERIFICATION.md. Run npm test when docs name IPC channels or test file paths.

Do NOT create/replace VERIFICATION_DRIFT.md while Stream T owns that file in the same batch — consume T’s drift then fix target docs.

Gates: npm test when IPC/path claims; npm run build optional unless full release gate (see PARALLEL_PASTABLES rule 6).

Shipped: G — Docs — <files> — <what readers get>.
```

---

## Stream H — Tests only (pick one island)

```text
STREAM H — Tests only (Unified Fab Studio)

App root: unified-fab-studio/
Full brief: docs/agents/STREAM-H-tests-only.md (workflow, merge safety, backlog, serialization — all in that file)

Declare island: H1 shared, H2 main (not index), H3 renderer design, H4 other — one chat per *.test.ts file to avoid merge fights.

Do not refactor production code except tiny exports to enable tests.

Gates: npm test (required). Aggressive H also: npm run build.

Shipped: H — <island> — <test file> — <coverage added>.
```

---

## Stream I — Python CAM

```text
STREAM I — Python CAM (Unified Fab Studio)

You work ONLY under engines/cam/*.py and engines/cam/README.md.

Respect JSON/CLI contracts consumed by Node (read cam-runner / main invocation — do not break TS without coordinating Stream D).

Minimize TypeScript changes; one additive path if needed.

Gates: python smoke optional (engines/cam/smoke_ocl_toolpath.py) when touching OCL paths; npm test if TS touched.

Shipped: I — engines/cam — <script or behavior> — <outcome>.
```

---

## Stream J — Python OCCT

```text
STREAM J — Python OCCT (Unified Fab Studio)

You work ONLY under engines/occt/*.py (build_part.py, step_to_stl.py, etc.).

Stdout JSON contract on last line must stay stable — coordinate Stream B if schema/payload changes.

Gates: npm test if TS glue changed; manual Build STEP smoke note if occt touched.

Shipped: J — engines/occt — <file> — <behavior>.
```

---

## Stream K — Posts & machines JSON

```text
STREAM K — Posts & machines JSON (Unified Fab Studio)

You work ONLY under resources/posts/ and resources/machines/.

Deliver: safer Handlebars comments, another machine stub, metadata hints. Read docs/MACHINES.md for safety tone.

Avoid src/main/post-process.ts unless one-line template name fix — prefer zero TS.

Gates: npm test if docs reference IPC paths.

Shipped: K — resources — <posts|machines> — <change>.
```

---

## Stream L — Cura / slicer resources

**Full brief:** [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) · **Slicer README:** [`resources/slicer/README.md`](../../resources/slicer/README.md)

```text
STREAM L — Cura / slicer resources (Unified Fab Studio)

Allowed: resources/slicer/** — plus docs/*.md that describe ONLY Cura paths, env vars, or resources/slicer/ files.

Forbidden in the same chat: resources/machines/, resources/posts/, resources/sample-*/**; engines/cam/, engines/occt/; src/** (except one objective path/string fix in src/main/slicer.ts if JSON cannot fix it — coordinate).

Do not touch CAM kernel or engines/occt in the same chat.

Coordinate before changing src/main/slicer.ts — prefer docs-only.

Gates: npm test if docs assert IPC, slicer.ts behavior, or paths covered by src/main/slicer.test.ts.

Shipped: L — slicer — <artifact> — <outcome>.
```

---

## Stream M — Smoke gate & in-chat verification

```text
STREAM M — Smoke / verify (Unified Fab Studio)

Full brief: docs/agents/STREAM-M-verifier-smoke.md

Run: npm test && npm run build && npm run typecheck from unified-fab-studio/

Deliver IN CHAT: Gates (pass/fail), Drift/risk bullets, Handoffs (which stream owns each item).

Do NOT create or overwrite docs/agents/VERIFICATION_DRIFT.md — that is Stream T.

Allowed repo edits: ≤1 micro-fix theme (≤40 lines total) OR ≤5 doc lines across ≤2 files OR report-only.

Shipped: M — Verify — <pass|fail> — <one-line summary>.
```

---

## Stream N — Design Viewport3D

```text
STREAM N — Design Viewport3D (Unified Fab Studio)

Full brief: docs/agents/STREAM-N-design-viewport3d.md
Aggressive + micro-sprint: docs/agents/PARALLEL_PASTABLES.md → Aggressive — Stream N, MICRO-SPRINT (attach to Stream N)

You own: src/renderer/design/Viewport3D.tsx, viewport3d-bounds.ts (+ viewport3d-bounds.test.ts when bounds change), src/renderer/src/styles.css under .design-3d* (watch global .viewport-3d vs AssemblyViewport3D — Stream C).

NOT owned: Sketch2DCanvas, design-schema, sketch-profile, src/renderer/design/solver2d.ts, engines/occt, main/cad.

Default: zero src/renderer/design/DesignWorkspace.tsx diff; if unavoidable ≤15 lines.

Gates: npm test && npm run build

Shipped: Viewport3D — <files> — <outcome>.
```

---

## Stream O — Shared non-design

```text
STREAM O — Shared src/shared (non-design) (Unified Fab Studio)

Full brief: docs/agents/STREAM-O-shared-non-design.md

You own: src/shared/**/*.ts EXCLUDING design-schema.ts and sketch-profile.ts (those are Stream A).

Themes O1–O5: declare one per chat (see STREAM-O-shared-non-design.md — project/tools, manufacture/CAM, assembly, kernel messages, cross-cutting modules).

No new ipcMain.handle — Stream S. No catalog status rows — Stream E.

Gates: npm test; Aggressive O also npm run build

Shipped: O — <theme> — <module(s)> — <contract improvement>.
```

---

## Stream P — Electron main helpers (not index.ts)

```text
STREAM P — Main process helpers (Unified Fab Studio)

Full brief: docs/agents/STREAM-P-electron-main-helpers.md

You own: src/main/**/*.ts EXCLUDING src/main/index.ts — e.g. cam-local.ts, drawing-export-service.ts, slicer.ts (coordinate Stream R for mesh-import-registry / tools-import / unique-asset-filename).

Do NOT add new ipcMain.handle here — hand off to Stream S for registration.

Islands P1–P4: declare one; avoid colliding with another P chat on the same file.

Gates: npm test && npm run build (Aggressive P)

Shipped: P — <file> — <tests or behavior> — <outcome>.
```

---

## Stream Q — Utilities workspace UI

```text
STREAM Q — Utilities workspace UI (Unified Fab Studio)

Full brief: docs/agents/STREAM-Q-utilities-ui.md

You own: src/renderer/utilities/**, Utilities tab strip in src/renderer/shell/AppShell.tsx when needed, scoped src/renderer/src/styles.css for utilities — Project, Settings, Slice, CAM, Tools, Commands, Shortcuts.

No new IPC — Stream S. Cap src/renderer/src/App.tsx ≤25 lines per batch; prefer utilities/* modules.

Safety copy for G-code/slicer: match docs/MACHINES.md.

Gates: npm test && npm run build

Shipped: Q — Utilities — <tab or panel> — <UX/a11y outcome>.
```

---

## Stream R — Import / mesh / tool libraries

```text
STREAM R — Import & tool libraries (Unified Fab Studio)

Full brief: docs/agents/STREAM-R-import-mesh-tools.md

You own: src/main/mesh-import-registry.ts, tools-import.ts, unique-asset-filename.ts, src/shared/mesh-import-formats.ts, engines/mesh/*, importHistory-related project fields.

IPC changes: preload + main + ipc-contract in same batch as Stream S owner.

Coordinate Stream Q for Utilities copy; Stream B for STEP if needed.

Gates: npm test && npm run build

Shipped: R — Import — <format or IPC> — <behavior>.
```

---

## Stream S — IPC integration (main + preload)

```text
STREAM S — IPC integration (Unified Fab Studio)

Full brief: docs/agents/STREAM-S-ipc-integration.md

You are the ONLY chat this batch that freely edits src/main/index.ts AND src/preload/index.ts.

Deliver: additive ipcMain.handle + contextBridge Api + Api typing; delegate bodies to src/main/<module>.ts (thin handlers).

Every invoke must have a handle — ipc-contract.test.ts must pass.

Gates: npm test && npm run build

Shipped: S — IPC — <channel names> — <consumer>.
```

---

## Stream T — Verifier & VERIFICATION_DRIFT.md

```text
STREAM T — Verifier / drift file (Unified Fab Studio)

Full brief: docs/agents/STREAM-T-verifier-drift.md
Artifact: docs/agents/VERIFICATION_DRIFT.md (you own this file)

Run: npm test && npm run build && npm run typecheck

Refresh VERIFICATION_DRIFT.md: gates table, IPC inventory (§2), typecheck debt (§3), handoffs (§5), resolution log (§6).

Skim docs/VERIFICATION.md vs §2 for wrong channel names.

Code fixes: ≤3 tiny P0, ≤40 lines total — no large tsc cleanup unless user widens scope.

Do NOT edit design-schema or kernel payload as primary work.

Parallel: Stream M must not edit VERIFICATION_DRIFT.md same batch.

Shipped: T — Verifier — VERIFICATION_DRIFT.md — <refreshed summary>.
Handoffs: <Stream>: <item>; …
```

---

## One-liner: which stream?

| I need to… | Stream |
|------------|--------|
| Sketch tools / constraints / solver | **A** |
| CadQuery / kernel build / loft | **B** |
| Assembly BOM / interference / joints | **C** |
| CAM / manufacture / G-code pipeline | **D** |
| Palette / shell / cross-workspace product | **E** |
| Bundled JSON, posts, samples, slicer defs | **F** (broad) or **K** / **L** (narrow) |
| Markdown only | **G** |
| More Vitest coverage | **H** |
| Python toolpaths | **I** |
| Python STEP/kernel scripts | **J** |
| Register IPC end-to-end | **S** |
| Drift doc + typecheck bar | **T** |
| Quick smoke report in chat | **M** |
| Shared Zod (not sketch) | **O** |
| Main helper without index.ts | **P** |
| Utilities tab UI | **Q** |
| Mesh + tools import | **R** |
| Design 3D preview only | **N** |

---

*Copy-paste index; keep in sync with [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) (conflict matrix + all **Aggressive — Stream \*** blocks, including **Q**).*
