# Parallel pastables (copy one block per Cursor chat)

**App root:** `unified-fab-studio/` — run `npm test` and `npm run build` before claiming done.

**Parity baseline:** Phases **1–7** are **baseline complete** in [`docs/PARITY_PHASES.md`](../PARITY_PHASES.md). Default agent work is **stretch**, **hardening**, or **honest catalog/docs** updates — sequence from [`docs/PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md). Per-stream **done vs next** → [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) § *Stream status & todos*.

**Hot files (serialize or single owner):** `src/renderer/src/App.tsx`, `src/renderer/shell/AppShell.tsx` (utilities tab strip / shell chrome), `src/main/index.ts`, `src/preload/index.ts`, `src/shared/design-schema.ts`.

**After IPC changes:** update **both** `preload/index.ts` and `main/index.ts` in the **same** agent/PR when adding channels — `npm test` runs [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts).

**Conflict quick reference**

| Can run together freely | Do not pair on same PR |
|-------------------------|-------------------------|
| **F**/**K**/**L** resources slices + **G** docs + **H** tests (different H islands) + **P** main helpers (different P islands) + **O** shared (disjoint modules) + **N** design viewport (`Viewport3D` / scoped `styles.css`) | **C** + **D** if both edit `main/index.ts` |
| **N** + **C**/**D**/**E**/**F**/**G**/**H**/**I**/**J**/**K**/**L**/**O** when **N** owns only `Viewport3D` / `viewport3d-bounds*` / `.design-3d*` CSS and **O** avoids the same `src/shared` file as **H1** | **N** + **A** on heavy `DesignWorkspace.tsx` churn; **N** + **C** on global `.viewport-3d` CSS without checking assembly |
| **I** engines/cam + **J** engines/occt (different folders) | **A** + **B** if both touch `sketch-profile` / payload |
| **A** + **C** + **D** + **E** + **R** if **C/D/R** avoid `main` or use **S** for IPC | Multiple agents adding **new** `ipcMain.handle` without **Stream S** or merge plan |
| **R** + **I** + **J** + **O** (disjoint `src/shared` files vs `engines/**`) | **R** + random stream if both need new IPC without **S** |
| **T** + anything except the same files **T** edits | **S** + any stream that also edits `main/index.ts` / `preload` without coordination |
| **Q** + **F/G/H/I/J/K/L** when **Q** stays under `utilities/*` + scoped `AppShell` / `styles.css` | **Q** + **E** if both need large **`App.tsx`** edits — serialize or keep **Q** in `src/renderer/utilities/*` only |
| **M** (report-only or one cold-file fix) + **F/K/G/H/I/J/L** | **M** + **T** both rewriting **`docs/agents/VERIFICATION_DRIFT.md`** in the same batch — **T** owns that file |
| **G** + **T** on the same `docs/agents/*.md` file (e.g. `VERIFICATION_DRIFT.md`) | Serialize or split: **T** writes drift list → **G** fixes targets in other docs |
| **O** + **H1** on the same `src/shared/*.ts` (and its `*.test.ts`) | Serialize or declare one owner per batch |
| **O** + **R** on `mesh-import-formats.ts` | **R** owns import/registry story — coordinate or assign **R** |

---

## Aggressive pastables (merge-ready slices)

Use these when you want **other chats to land PR-quality work**, not exploration. Each block assumes **app root** `unified-fab-studio/`, **`npm test`** (and usually **`npm run build`**) before “done” — **carve-outs:** coordinator **rules 2 + 6–8**, plus **Aggressive F/K/L** resources-only blocks — and a **single `Shipped:` line** in the final reply. **Stream O** (shared non-design) uses **Aggressive — Stream O**; **Stream P** (main helpers, not `index.ts`) uses **Aggressive — Stream P** — same merge-ready bar as other feature slices.

**Extra hot rule for aggressive mode:** At most **one** parallel chat may touch `src/main/index.ts` + `src/preload/index.ts` per integration batch — use **Stream S** for that, or serialize.

---

### Aggressive coordinator (lead chat)

```text
AGGRESSIVE COORDINATOR — Unified Fab Studio (unified-fab-studio/)

Read first: docs/agents/COORDINATOR_PARALLEL_WORKFLOW.md, docs/AGENT_PARALLEL_PLAN.md, docs/PARITY_PHASES.md, docs/PARITY_REMAINING_ROADMAP.md, docs/VERIFICATION.md.

**Reality:** `PARITY_PHASES.md` marks phases **1–7 baselines Done** — assign **stretch slices** from `PARITY_REMAINING_ROADMAP.md` (or regressions), not “finish phase N baseline” unless the table regressed.

Your job: spawn parallel agents with the **Aggressive** stream blocks below; collect one **Shipped:** line from each; enforce merge order.

Hard rules:
1) Only ONE chat touches main IPC registration (src/main/index.ts + src/preload/index.ts) per batch — assign Stream **S** or serialize.
2) Paste **npm test** results for every stream **except** pure **G** prose with **no** IPC/path claims (rule 6). Paste **npm run build** for every stream **except** **G** (rule 6) and **F/K/L** when the block says resources-only / no `docs/` IPC claims — **H** always runs **npm test**; **npm run build** per **Aggressive H**, **Aggressive O** (rule 14), **Aggressive P**, and **every Stream S** IPC batch (rule 13). Never answer “should pass.”
3) User-visible behavior ⇒ **src/shared/fusion-style-command-catalog.ts** + **docs/PARITY_PHASES.md** (or roadmap row) must move honestly.
4) Merge order: **S** (IPC) first if present → **A** before **B** if sketch-profile / design-schema changed → **C/D/E/R** if `git diff --name-only` is disjoint.
5) **App.tsx** cap: **≤25 lines** changed per non–Stream-S chat unless the agent extracted to **src/renderer/*/** new module first.
6) **Stream G** (docs-only): **`npm run build` not required** unless this batch is a full release gate. Run **`npm test`** when G’s edits assert IPC channels, preload API names, or source paths covered by tests; pure prose/link typos ⇒ test optional.
7) **Stream H** (tests-only): each chat declares island **H1–H4**; avoid two H agents on the same **`*.test.ts`**.
8) **Stream H** gate: **Aggressive — Stream H** ⇒ **`npm test` + `npm run build`**. Short *Stream H* pasteable (non-aggressive) ⇒ **`npm test`** required; **`npm run build`** optional unless this batch is a full release gate.
9) **Stream M** (smoke/verify): **`npm test` + `npm run build` + `npm run typecheck`**; final reply includes **Gates / Drift / Handoffs** (see **Aggressive — Stream M**). **Stream T** owns **`docs/agents/VERIFICATION_DRIFT.md`** — do not assign **M** and **T** to rewrite that file in the same batch.
10) **Stream N** (design `Viewport3D`): default **zero** `DesignWorkspace.tsx` diff; if unavoidable **≤15 lines** (see **Aggressive — Stream N**). Global **`.viewport-3d`** CSS changes need **assembly** (`AssemblyViewport3D`) awareness — coordinate **Stream C**.
11) **Stream P** (main helpers): each chat declares island **P1–P4**; **no** `main/index.ts` / preload; **Aggressive — Stream P** ⇒ **`npm test` + `npm run build`**. Avoid the same `src/main/*.ts` as another **P** chat or **H2** in one batch.
12) **Stream Q** (Utilities UI): prefer **`src/renderer/utilities/*`** and scoped **`AppShell`** tab strip; **`App.tsx` ≤25 lines** per batch unless extracted first; **`npm test` + `npm run build`** for **Aggressive — Stream Q**.
13) **Stream S** (IPC): **`npm test` + `npm run build`** always for any S batch; full brief [`docs/agents/STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md).
14) **Stream O** (shared non-design): each chat declares **one** theme or file family in `src/shared/**` (not `design-schema` / `sketch-profile`); **Aggressive — Stream O** ⇒ **`npm test` + `npm run build`**. Serialize with **H1** or another **O** on the same `src/shared/*.ts` + `*.test.ts`. Full brief [`docs/agents/STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md).

Reject work that ends with “next steps” only — require the **Shipped:** one-liner + file list.
```

---

### Aggressive — Stream A (sketch)

```text
AGGRESSIVE — Stream A (Phase 2 sketch). unified-fab-studio/

Before coding, declare ONE slice (pick one):
• Move **one** command from **planned/partial → implemented** (honest) in src/shared/fusion-style-command-catalog.ts, OR
• Fix **≥2** concrete sketch bugs (trim/fillet/offset/solver) with **regression tests**.

NON-NEGOTIABLE:
• Own: src/shared/design-schema.ts, src/shared/sketch-profile.ts, src/renderer/design/*, src/renderer/design/solver2d.ts — **not** engines/occt/build_part.py (hand off to B).
• **≥2** Vitest tests touched or added (design-schema / sketch-profile / solver2d / sketch-mesh).
• Catalog rows you touch: update **status + notes** in src/shared/fusion-style-command-catalog.ts.
• **≤25 lines** in src/renderer/src/App.tsx — else extract to src/renderer/design/*.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: kernel payload bumps without Stream B agreement.

Final line format: Shipped: <catalog id(s)> — <user-visible outcome in one sentence>.
```

---

### Aggressive — Stream B (kernel / CadQuery)

```text
AGGRESSIVE — Stream B (Phase 3–4 kernel). unified-fab-studio/

Declare ONE slice before coding:
• **One** kernel op / build_part.py behavior (clear error JSON, new variant, or documented limitation), OR
• **One** new/updated sample under resources/sample-kernel-solid-ops/ wired to existing UI/schema.

NON-NEGOTIABLE:
• Own: engines/occt/*.py, src/main/cad/build-kernel-part.ts, kernel-manifest / part-features schemas as needed.
• **≥1** test file extended (kernel-manifest, part-features, main cad test, or shared schema test).
• docs/GEOMETRY_KERNEL.md updated in the section you changed (concise).
• npm test && npm run build.

FORBIDDEN: sketch canvas, assembly, manufacture tabs.

Rebase after Stream A if sketch-profile or design-schema changed in main.

Final line: Shipped: Kernel — <op/sample> — <behavior machinists/designers see>.
```

---

### Aggressive — Stream C (assembly)

```text
AGGRESSIVE — Stream C (Phase 5 assembly). unified-fab-studio/

Declare ONE slice: BOM/export/viewport/interference/joints — **one** user-visible improvement OR **one** schema hardening with tests.

NON-NEGOTIABLE:
• Own: assembly-schema.ts, src/renderer/assembly/*, assembly IPC **only if** you are the IPC chat OR you add Stream S.
• If new/changed invoke: **preload + main + ipc-contract** in same merge batch as Stream S owner.
• **≥1** assembly-related test updated or added.
• npm test && npm run build.

FORBIDDEN: design-schema, sketch solver, cam-runner.

Final line: Shipped: Assembly — <surface> — <outcome>.
```

---

### Aggressive — Stream D (manufacture / CAM)

```text
AGGRESSIVE — Stream D (Phase 6 CAM). unified-fab-studio/

Declare ONE slice: op validation/hints, cam-local/OCL path, manufacture UI copy, machine/post metadata — **no** “whole CAM rewrite.”

NON-NEGOTIABLE:
• Own: manufacture-schema.ts, src/renderer/manufacture/*, src/main/cam-*, engines/cam/*.
• **docs/MACHINES.md** or **docs/VERIFICATION.md** row if checklists or safety copy change.
• npm test && npm run build.
• Never imply G-code is safe for real machines without user verification (see MACHINES.md tone).

FORBIDDEN: sketch/kernel ownership.

Final line: Shipped: CAM — <area> — <machinist-visible outcome>.
```

---

### Aggressive — Stream E (product / shell)

```text
AGGRESSIVE — Stream E (Phase 7 product). unified-fab-studio/

Declare ONE slice: palette/shell/utilities/drawings/parameters/import UX — **one** shipped behavior.

NON-NEGOTIABLE:
• Prefer **new** files under src/renderer/shell/* or src/renderer/commands/* or src/renderer/utilities/*.
• src/renderer/src/App.tsx **≤25 lines** per batch unless you extracted components first.
• src/shared/fusion-style-command-catalog.ts + PARITY_PHASES (or roadmap) if user-visible.
• npm test && npm run build from unified-fab-studio/.

Final line: Shipped: Product — <command id or tab> — <what user sees>.
```

---

### Aggressive — Stream Q (utilities UI)

```text
AGGRESSIVE — Stream Q (Utilities workspace UI). unified-fab-studio/

Full brief: docs/agents/STREAM-Q-utilities-ui.md

Declare ONE slice before coding:
• **One** Utilities tab pass (Project, Settings, Slice, CAM, Tools, Commands, Shortcuts) — copy, layout, loading/empty states, OR `aria-*` / focus order, OR
• **One** `src/renderer/shell/AppShell.tsx` utility tab strip improvement (tablist semantics, keyboard nav, `UtilityTab`) — tab strip only, not global shell redesign, OR
• **Confirmed** bugfix in utilities with **≤40 lines** production diff across **≤3** files.

NON-NEGOTIABLE:
• Own: `src/renderer/utilities/**`; optional `src/renderer/shell/AppShell.tsx` (utilities tab strip); scoped `src/renderer/src/styles.css` for utilities panels (e.g. `.workspace-util-panel`, `.utility-strip`).
• **No** new `ipcMain.handle` / preload API — **Stream S**.
• **`src/renderer/src/App.tsx`:** **≤25 lines** per batch unless you extracted a module under `utilities/` first.
• Coordinate **Stream E** on large `src/renderer/src/App.tsx` churn or **`src/shared/fusion-style-command-catalog.ts` status/notes** rows.
• Coordinate **Stream R** when import/mesh/`importHistory` plumbing must change, not just copy.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: `design-schema`, sketch solver, `engines/*`, manufacture workspace internals (**Stream D**), assembly mesh IPC (**Stream C**).

Overlap: safe with F/G/H/I/J/K/L/M/N/O/P on disjoint files; serialize with **E** on `src/renderer/src/App.tsx`; serialize with **R** on `UtilitiesWorkspacePanels.tsx` + import pipeline.

Final line: Shipped: Utilities — <tab or file> — <UX/a11y outcome>.
```

---

### Aggressive — Stream N (design 3D viewport)

```text
AGGRESSIVE — Stream N (Design Viewport3D). unified-fab-studio/

Full brief: docs/agents/STREAM-N-design-viewport3d.md

Declare ONE slice before coding:
• **One** R3F/drei improvement: grid/lighting/materials, OrbitControls/Bounds tuning, clipping/measure/face-pick polish, OR
• **One** design-scoped CSS pass under `.design-3d*` / `.design-3d .viewport-3d` (avoid breaking assembly’s `.viewport-3d`), OR
• **One** `viewport3d-bounds.ts` fix + `viewport3d-bounds.test.ts` coverage.

NON-NEGOTIABLE:
• Own: src/renderer/design/Viewport3D.tsx, viewport3d-bounds.ts (+ its test), and src/renderer/src/styles.css **only** for design-3d-scoped rules (see brief).
• **Not** owned: Sketch2DCanvas, design-schema.ts, sketch-profile.ts, src/renderer/design/solver2d.ts, engines/occt, main/cad.
• **src/renderer/design/DesignWorkspace.tsx**: default **zero** diff; if unavoidable, **≤15 lines** and call out in Shipped: — avoid same batch as large Stream A DesignWorkspace work.
• src/renderer/src/App.tsx **≤25 lines** or **zero** (prefer zero).
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: kernel payload, IPC (Stream S), assembly viewport ownership (Stream C) except coordinated global CSS.

Overlap: safe with **C/D/E/F/G/I/J/K/L** when paths disjoint; coordinate **A** on `DesignWorkspace.tsx`; coordinate **H3** if both touch viewport3d-bounds production code.

Final line: Shipped: Viewport3D — <files> — <designer-visible outcome>.
```

---

### Aggressive — Stream F (resources only)

```text
AGGRESSIVE — Stream F (Resources). unified-fab-studio/

Full brief: docs/agents/STREAM-F-resources-only.md — inventory: resources/README.md, resources/machines/README.md, resources/posts/README.md

Declare ONE slice before editing:
• **One** new or improved machine JSON under resources/machines/ (honest meta + docs/MACHINES.md tone), OR
• **One** post template / header comment pass under resources/posts/ (update resources/posts/README.md if you add a template), OR
• **One** sample project README or slicer stub note under resources/slicer/ or resources/sample-*/.

NON-NEGOTIABLE:
• Own: resources/** only; optional docs/*.md that describe those paths.
• **Zero** src/* edits unless one objective broken path string (single line).
• G-code/slicer copy stays **unverified** — never promise safe output (see docs/MACHINES.md).
• If you only touch resources/** (no docs/), **no npm required**. If you edit docs/ with IPC/path claims, run npm test from unified-fab-studio/.

FORBIDDEN: schemas, preload/main, fusion-style-command-catalog, engines/* (use Stream I/J).

Overlap: narrow lanes **Stream K** (posts+machines only; brief [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md)), **Stream L** (slicer only) — pick F when work spans folders.

Final line: Shipped: F — Resources — <path> — <artifact>.
```

---

### Aggressive — Stream K (posts & machines JSON)

```text
AGGRESSIVE — Stream K (Posts & machines). unified-fab-studio/

Full brief: docs/agents/STREAM-K-posts-machines.md — inventory: resources/machines/README.md, resources/posts/README.md

Declare ONE slice before editing:
• **One** new or revised machine JSON under resources/machines/ + README row if ids change, OR
• **One** post template improvement (header comments: units, WCS, unverified output, dialect caveats) — one file or ≤3 .hbs with a consistent pattern, OR
• **meta** / honest limitation copy on existing machine JSON (no fake feed verification).

NON-NEGOTIABLE:
• Own: resources/posts/** and resources/machines/** only; optional docs/*.md that describe **only** those paths (not catalog/schemas).
• **Zero** src/** except one objective template-name/path fix in src/main/post-process.ts if a bundled template is unreachable — prefer fixing postTemplate in JSON; call out the file if you touch TS.
• G-code tone stays **unverified** — never promise safe machine output (docs/MACHINES.md).
• **npm test** from unified-fab-studio/ only if docs you edit assert IPC channels, preload APIs, or source paths covered by tests; pure resources/** ⇒ npm optional.

FORBIDDEN: resources/slicer/, resources/sample-*/, schemas, preload/main feature work, fusion-style-command-catalog.ts, engines/*.

Parallel: safe with G, H, I, J, L when filenames do not collide; use **K** instead of **F** to avoid touching samples or slicer stubs in the same sprint.

Final line: Shipped: Posts/Machines — <path or theme> — <integrator/machinist-visible outcome>.
```

---

### Aggressive — Stream L (slicer / Cura stubs)

```text
AGGRESSIVE — Stream L (Slicer / Cura). unified-fab-studio/

Full brief: docs/agents/STREAM-L-cura-slicer.md — inventory: resources/slicer/README.md

Declare ONE slice before editing:
• **One** new or revised `*.def.json` under resources/slicer/ + README row if ids or `inherits` chain changes, OR
• **One** README pass: `CURA_ENGINE_SEARCH_PATH`, Windows path examples, troubleshooting table, version/inherits notes, OR
• **Honest limitations** on an existing stub (bed geometry vs retail firmware, Cura definition mismatch warnings).

NON-NEGOTIABLE:
• Own: resources/slicer/** only; optional docs/*.md that describe **only** Cura paths, env vars, or resources/slicer/ files (same npm bar as Stream G for doc claims).
• Optional **resources/README.md** edits **only** for the existing slicer row / pointer — keep scope minimal.
• **Zero** src/** except one objective path/string fix in src/main/slicer.ts if a bundled definition filename is unreachable — prefer fixing JSON + docs first; call out the file if you touch TS.
• Slice output stays **unverified** for real printers until the operator checks temps, limits, and start/end G-code — align tone with docs/MACHINES.md.
• **npm test** from unified-fab-studio/ only if docs assert IPC, slicer.ts behavior, or paths covered by tests (e.g. slicer tests); pure resources/slicer/** ⇒ npm optional.
• **npm run build** not required for slicer-only resource work with no TS change and no doc IPC claims (coordinator rule 2 carve-out).

FORBIDDEN: resources/machines/, resources/posts/, resources/sample-*/, Zod schemas, fusion-style-command-catalog.ts, preload/main feature work, engines/cam, engines/occt.

Parallel: safe with G, H, I, J, K when filenames do not collide; use **L** instead of **F** when you are **not** touching samples, posts, or machines in the same sprint.

Final line: Shipped: L — slicer — <path or theme> — <operator/integrator-visible outcome>. (Equivalent: `Shipped: Slicer — …` per STREAM-L-cura-slicer.md.)
```

---

### Aggressive — Stream I (Python CAM)

```text
AGGRESSIVE — Stream I (Python CAM). unified-fab-studio/

Full brief: docs/agents/STREAM-I-python-cam.md

Declare ONE slice before editing:
• **Validation / errors:** clearer `error`/`detail` JSON, numeric bounds, or README exit-code table, OR
• **Smoke:** extend smoke_ocl_toolpath.py for a new failure mode (no pip/OCL required), OR
• **OCL experiment:** one isolated strategy tweak inside ocl_toolpath.py with docstring + README note.

NON-NEGOTIABLE:
• Own: engines/cam/** only (+ docs/agents/STREAM-I*.md if you add/refresh the brief).
• Read-only: src/main/cam-runner.ts contract — coordinate Stream D if JSON keys, toolpath JSON file shape, or stdout errors change.
• **No** engines/occt (Stream J), no resources/** (Stream F/K/L).

Verify: python engines/cam/smoke_ocl_toolpath.py from unified-fab-studio/; npm test && npm run build.

Final line: Shipped: CAM-Python — <file or theme> — <behavior for integrators>.
```

---

### Aggressive — Stream G (docs only)

```text
AGGRESSIVE — Stream G (Docs). unified-fab-studio/

Full brief: docs/agents/STREAM-G-docs-only.md

Declare ONE slice before editing:
• **Drift fix:** ≤10 lines across docs so PARITY_PHASES / VERIFICATION / README agree on status or IPC names (verify against preload + main or ipc-contract.test.ts), OR
• **Navigation:** agents/README + PARALLEL_PASTABLES cross-links, “read first” boxes, troubleshooting table rows (local dev, engines, CAM safety tone), OR
• **Onboarding:** README / AGENTS.md clarity only (workspace-root AGENTS.md only for workspace-wide pointers).

NON-NEGOTIABLE:
• Own: docs/**/*.md, README.md, AGENTS.md (app + optional parent workspace AGENTS.md), docs/agents/** — **zero** src/**, **zero** resources/** file edits, **zero** fusion-style-command-catalog.ts.
• If docs cite IPC channels or test-covered paths: npm test from unified-fab-studio/ (paste pass/fail).
• Never imply G-code is safe without user verification (MACHINES.md tone).

FORBIDDEN: schemas, preload/main, sample JSON/posts, new features in TS/Python.

Overlap: safe with F/H/I/J/K/L when you do not edit the same markdown file another chat owns; consume Stream T’s VERIFICATION_DRIFT.md as input.

Final line: Shipped: Docs — <files or theme> — <reader/coordinator outcome>.
```

---

### Aggressive — Stream H (tests only)

```text
AGGRESSIVE — Stream H (Tests). unified-fab-studio/

Full brief: docs/agents/STREAM-H-tests-only.md

Declare ONE island before coding (H1 shared, H2 main≠index, H3 renderer/design, H4 ipc-contract existing channels only):

NON-NEGOTIABLE:
• Touch **only** `src/**/*.test.ts` (+ **≤5 lines** production **export** if required for a pure helper — state the file in the PR).
• **Do not** edit `src/main/index.ts`, `src/preload/index.ts`, or add new IPC — **Stream S**.
• **Do not** change user-visible catalog rows — **Stream A–E** or docs **G**.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: feature implementation masked as tests; `resources/**`; `docs/**` (use Stream G).

Overlap: safe with **F/G/I/J/K/L/P** when you do not edit the same `*.test.ts` as another **H** chat; serialize **H2** with **P** on the same production `src/main/*.ts`.

Final line: Shipped: Tests — <H1|H2|H3|H4 + files> — <regression guarded>.
```

---

### Aggressive — Stream P (Electron main helpers)

```text
AGGRESSIVE — Stream P (Main helpers). unified-fab-studio/

Full brief: docs/agents/STREAM-P-electron-main-helpers.md

Declare ONE island before coding (P1 CAM/posts/slicer, P2 drawing/project/settings stores, P3 assembly mesh / STL / occt-import, P4 other main utils — not R-owned import registry):

NON-NEGOTIABLE:
• Own: src/main/**/*.ts **except** src/main/index.ts — **no** new ipcMain.handle (**Stream S**).
• **Avoid** Stream R files unless coordinated: mesh-import-registry.ts, tools-import.ts, unique-asset-filename.ts, engines/mesh/**.
• **≥1** test file under src/main/ extended or added for behavior you change.
• Coordinate **Stream B** before changing build-kernel-part / kernel JSON contracts.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: preload/index.ts; feature-wide manufacture UI/schema ownership (**Stream D**) unless you are only fixing a main helper they call.

Overlap: safe with **F/G/I/J/K/L** when paths differ; **not** parallel with **S** on the same IPC batch; serialize with **H2** on the same production file.

Final line: Shipped: Main — <P1|P2|P3|P4 + files> — <outcome>.
```

---

### Aggressive — Stream J (Python OCCT)

```text
AGGRESSIVE — Stream J (Python OCCT). unified-fab-studio/

Full brief: docs/agents/STREAM-J-python-occt.md

Declare ONE slice before coding:
• **One** script: clearer JSON errors, docstrings, edge-case handling in build_part.py OR step_to_stl.py, OR
• **One** engines/occt/README.md + matching GEOMETRY_KERNEL.md stdout/error row (behavior truth).

NON-NEGOTIABLE:
• Own: engines/occt/** only; optional docs/GEOMETRY_KERNEL.md in the Python sidecar / stdout section you changed.
• **Preserve** stdout contract: exactly **one** JSON object on the **last non-empty line** (see occt-import.ts runPythonJson).
• **Zero** src/** edits — coordinate **Stream B** for build-kernel-part.ts, schemas, or payload version bumps.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: sketch-profile / design-schema (Stream A+B); engines/cam (Stream I); preload/main (Stream S).

Overlap: safe with **I** (cam) on disjoint paths; rebase if **B** lands kernel schema/payload changes that your script must match.

Final line: Shipped: OCCT — <file or theme> — <designer/integrator-visible outcome>.
```

---

### Aggressive — Stream O (shared non-design)

```text
AGGRESSIVE — Stream O (shared non-design). unified-fab-studio/

Full brief: docs/agents/STREAM-O-shared-non-design.md

Declare ONE slice before coding:
• **One** schema hardening + tests (manufacture, assembly, project, CAM helpers, kernel messages, etc.), OR
• **One** new small pure module under src/shared/ with matching *.test.ts, OR
• **One** shared export cleanup **only** inside src/shared/ (no renderer/main churn).

NON-NEGOTIABLE:
• Own: src/shared/**/*.ts EXCEPT design-schema.ts and sketch-profile.ts (Stream A).
• **Do not** edit fusion-style-command-catalog.ts status/notes rows — Stream E (read-only imports OK).
• **≥1** test file new or extended; behavioral change ⇒ failing test first preferred.
• npm test && npm run build from unified-fab-studio/.

FORBIDDEN: engines/**, resources/**, IPC registration (Stream S), sketch canvas, wholesale App.tsx edits.

Coordinate: Stream R for mesh-import-formats.ts; Stream B for kernel payload / manifest semantics; Stream H1 if another chat owns the same shared file + test in this batch.

Overlap: safe with C/D/E/F/G/H/I/J/K/L on disjoint filenames; avoid same merge batch as Stream A on sketch exports.

Final line: Shipped: Shared — <theme + files> — <callers can rely on>.
```

---

### Aggressive — Stream R (Import / mesh / tool libraries)

```text
AGGRESSIVE — Stream R (Import & tool libraries). unified-fab-studio/

Full brief: docs/agents/STREAM-R-import-mesh-tools.md

Own: src/main/mesh-import-registry.ts, tools-import.ts, unique-asset-filename.ts, src/shared/mesh-import-formats.ts, engines/mesh/*, project-schema importHistory/report fields (import audit only).

Declare ONE slice: new format route, batch/error UX, tool parser edge case, VERIFICATION row, engines/mesh script contract.

NON-NEGOTIABLE:
• Any new IPC: **preload + main + ipc-contract** (coordinate Stream S if main is crowded).
• npm test && npm run build.
• docs/VERIFICATION.md if manual checklist changes.

FORBIDDEN: sketch-schema, unrelated CAM refactors.

Final line: Shipped: Import — <format/IPC> — <behavior>.
```

---

### Stream S — IPC integration (main + preload only)

```text
AGGRESSIVE — Stream S (IPC integration). unified-fab-studio/

You are the **only** chat this batch that freely edits src/main/index.ts + src/preload/index.ts.

Deliver: **additive** ipcMain.handle + contextBridge Api + renderer typing; delegate handler bodies to src/main/<module>.ts (keep handlers thin).

NON-NEGOTIABLE:
• Every ipcRenderer.invoke channel has ipcMain.handle — npm test includes ipc-contract.test.ts.
• After changes: npm test && npm run build.

FORBIDDEN: drive-by edits to renderer business logic in the same PR unless required for one invoke call site.

Final line: Shipped: IPC — <channel names> — <consumer>.
```

---

### Stream T — Verifier / drift hunter (aggressive)

For **gates + in-chat report only** (no **`VERIFICATION_DRIFT.md`**), use **Aggressive — Stream M** — [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md).

**Full brief (read first):** [`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md).

**Artifact (this chat owns it):** [`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md) — gates table (**test / build / typecheck**), alphabetical **IPC inventory**, **typecheck debt** table (file → summary), doc spot-checks, **handoffs** to E/A/H/P/G, append-only **resolution log**.

```text
AGGRESSIVE — Stream T (Verifier / drift file). unified-fab-studio/

Read: docs/agents/STREAM-T-verifier-drift.md and docs/agents/VERIFICATION_DRIFT.md (update in place).

Run from unified-fab-studio/: npm test && npm run build && npm run typecheck — paste pass/fail into VERIFICATION_DRIFT.md §1; if typecheck fails, summarize errors in §3 (do not drop rows until fixed).

Refresh VERIFICATION_DRIFT.md:
• §1 Gates table (test, build, typecheck) + optional Python/CAM notes.
• §2 IPC channel list — sync with src/preload/index.ts invokes (ipc-contract.test.ts must pass).
• §3 Typecheck / P0 code debt — file paths + one-line summary per failure cluster.
• §4 Doc vs PARITY_PHASES spot checks — bullets with suggested owner stream.
• §5 Handoff checklist + §6 resolution log append row (date + what changed).

Skim docs/VERIFICATION.md vs §2 for wrong channel names or missing rows.

Code fixes: **≤3** tiny P0 only, **≤40 lines** total (e.g. undefined callback, wrong doc-only string). No schema/kernel payload; no “fix all tsc” unless user explicitly widens scope.

FORBIDDEN: design-schema.ts, sketch-profile.ts, large refactors.

Parallel: **M** must not edit VERIFICATION_DRIFT.md this batch; **G** fixes other docs after T lands.

Final reply:
Shipped: Verifier — VERIFICATION_DRIFT.md — <one line>.
Handoffs: <Stream>: <item>; …
```

---

### Aggressive — Stream M (smoke + verification report)

```text
AGGRESSIVE — Stream M (Smoke / verify). unified-fab-studio/

Read first: docs/agents/STREAM-M-verifier-smoke.md.

Run from unified-fab-studio/: npm test && npm run build && npm run typecheck — paste outcome (no “should pass”).

Deliver in your final reply:
• **Gates:** pass/fail per command + note if python engines/cam/smoke_ocl_toolpath.py was run or skipped.
• **Drift / risk:** bullets from skimming docs/VERIFICATION.md, docs/PARITY_PHASES.md, docs/PARITY_REMAINING_ROADMAP.md vs repo reality; or “none noted”.
• **Handoffs:** which stream (S, T→G, H, …) should own each open item.

Repo edits: **≤1** theme — either **zero** file changes (report-only) OR **≤5** total doc lines across **≤2** files OR **one** tiny code/test fix (**≤40** lines, no schema/kernel payload). Do **not** create or replace docs/agents/VERIFICATION_DRIFT.md — that is **Stream T**.

FORBIDDEN: new ipcMain.handle/preload API; design-schema / sketch-profile; feature-sized work.

Parallel: safe with F/K/L/G/H/I/J/M when you avoid hot files unless your single fix is explicitly cold.

Final line: Shipped: Verify — <pass|fail> — <one-line outcome>.
```

---

### Micro-sprint templates (1–2 sessions)

Paste under any stream to narrow scope:

```text
MICRO-SPRINT (attach to Stream A/B/C/D/E):
End state in one session: **one** fusion-style-command-catalog row moves status with **honest** notes + **≥1** test + no new IPC.
If blocked, ship **docs-only** delta in Stream G instead — do not partial-commit schema without tests.
```

```text
MICRO-SPRINT (attach to Stream G):
End state in one session: **one** doc artifact — e.g. fix broken relative links in ≤3 files, add **VERIFICATION** troubleshooting row with ipc-contract-checked channel names, or align **PARITY_PHASES** “next” sentence with **PARITY_REMAINING_ROADMAP** § header. No src/**. npm test if IPC/path claims changed.
```

```text
MICRO-SPRINT (attach to Stream O):
End state in one session: **one** src/shared module (not design-schema / sketch-profile) with **≥2** new `it(...)` cases **or** one schema refinement with a regression test; **zero** renderer/main edits. npm test; add npm run build if using **Aggressive — Stream O**. Shipped: Shared — <file> — <invariant>.
```

```text
MICRO-SPRINT (Stream T → G, sequential):
Stream T produces or refreshes **docs/agents/VERIFICATION_DRIFT.md**. Stream G (same or next chat): apply **≤10** targeted fixes in **other** docs (not rewriting the drift file mid-flight); re-run **npm test** only if corrected lines reference IPC or test paths. Shipped: Docs — drift closure — <which contradictions were fixed>.
```

```text
MICRO-SPRINT (attach to Stream F):
End state in one session: **one** resource artifact under resources/** — e.g. new **machines/*.json** stub, **posts/*.hbs** header comment pass, **sample-*/README.md** clarification, or **slicer/** note. No src/**. No npm if resources-only; npm test if you touched docs/ with IPC/path claims.
```

```text
MICRO-SPRINT (attach to Stream K):
End state in one session: **one** artifact under **only** resources/posts/ and resources/machines/ — e.g. new **machines/*.json** + README row, or **posts/*.hbs** header/units/WCS comment pass. No slicer, no samples. No src/**. No npm if resources-only; npm test if docs/ with IPC/path claims.
```

```text
MICRO-SPRINT (attach to Stream L):
End state in one session: **one** artifact under **only** resources/slicer/ — e.g. new **\*.def.json** + row in **resources/slicer/README.md**, or **troubleshooting / CURA_ENGINE_SEARCH_PATH** table rows, or honest **inherits / Cura version** notes. No machines, posts, samples. No src/** (one-line **slicer.ts** fix only if JSON cannot name the file correctly). No npm if slicer-only; npm test if docs/ assert IPC, slicer behavior, or paths covered by **slicer** tests.
```

```text
MICRO-SPRINT (attach to Stream D):
Pick **one** manufacture op kind; improve **error string + hint** returned to UI; add **one** cam-*.test.ts case; update VERIFICATION.md one row.
```

```text
MICRO-SPRINT (attach to Stream E):
Pick **one** Utilities tab; improve **a11y** (label, aria-live, focus) + **copy**; **≤40 lines** production diff total across ≤3 files.
```

```text
MICRO-SPRINT (attach to Stream N):
End state in one session: **one** visible improvement in **`Viewport3D.tsx`** (lights/grid/controls/materials/clipping) **or** **one** `viewport3d-bounds.ts` fix with **`viewport3d-bounds.test.ts`** updated **or** **≤25 lines** of **`.design-3d*`-scoped** CSS (no global **`.viewport-3d`** unless you checked **`AssemblyViewport3D`** — **Stream C**). **Zero** `DesignWorkspace.tsx` unless **≤10 lines** and declared in **Shipped:**. **npm test** && **npm run build**. Shipped: Viewport3D — <slice> — <outcome>.
```

```text
MICRO-SPRINT (attach to Stream H):
Declare **one** island (H1–H4). End state: **≥3** new `it(...)` cases **or** **one** new `describe` block with **≥2** cases in a **single** `src/**/*.test.ts` file; **zero** production edits unless **≤5 lines** export for a pure helper (state file). No `main/index.ts` / preload. **npm test**; add **npm run build** if using **Aggressive — Stream H** or merging to release. If blocked by missing IPC, hand off **Stream S** — do not stub fake channels in **H4**.
```

```text
MICRO-SPRINT (attach to Stream R):
End state in one session: **one** import/tools slice — e.g. **one** new mesh extension wired through `mesh-import-formats.ts` + registry + `mesh_to_stl.py` (if needed) + **≥1** test; **or** **one** Fusion CSV / `.tools` edge case in `tools-import.ts` with tests; **or** **one** `importHistory` UX row in Utilities (coordinate **Stream Q** if the diff is broad). No new IPC unless **Stream S** batch. **npm test** && **npm run build**. Shipped: Import — <slice> — <outcome>.
```

```text
MICRO-SPRINT (attach to Stream S):
End state in one session: **one** new `ipcRenderer.invoke('…')` + matching `ipcMain.handle` (or one safe rename across both files) with handler body in **src/main/<module>.ts** (not a 200-line block in index.ts); preload `Api` updated; **npm test** + **npm run build**. No renderer feature work unless **≤15 lines** for a single `window.fab.*` call site. Shipped: IPC — <channel> — <who consumes>.
```

```text
MICRO-SPRINT (attach to Stream P):
Declare **one** island (P1–P4). End state: **one** focused improvement in **≤2** `src/main/*.ts` files (not `index.ts`) — clearer error string, extracted pure helper, or path/edge-case fix — plus **≥2** new `it(...)` cases **or** one new `describe` with **≥2** cases in the matching `*.test.ts`. No new IPC. **npm test** && **npm run build**. If you need a new channel, hand off **Stream S**.
```

---

## Coordinator (optional lead chat)

```text
You coordinate parallel work on Unified Fab Studio (unified-fab-studio/).

Read: docs/AGENT_PARALLEL_PLAN.md, docs/PARITY_PHASES.md, docs/FUSION_COMMAND_PARITY.md, docs/VERIFICATION.md.

Rules: Workflow-inspired CAD only; no Fusion IP clone. One owner for App.tsx, main/index.ts, preload/index.ts, design-schema.ts unless changes are tiny and additive.

Merge order: Stream A (sketch) before B (kernel) if sketch-profile or design-schema changed → B rebases → C, D, E if no file overlap.

Every feature stream: update docs/PARITY_PHASES.md + src/shared/fusion-style-command-catalog.ts when user-visible. npm test must pass (includes IPC contract test).
```

---

## Stream A — Phase 2 sketch

```text
You are Stream A: Phase 2 sketch for Unified Fab Studio (unified-fab-studio/).

Full brief: docs/agents/STREAM-A-phase2-sketch.md

Own: src/shared/design-schema.ts, src/shared/sketch-profile.ts, src/renderer/design/*, src/renderer/design/solver2d.ts. Do not change engines/occt/build_part.py without coordinating payload with Stream B. Minimize src/renderer/src/App.tsx.

**Status:** Phase **2** baseline is **Done** in docs/PARITY_PHASES.md (tools, trim/fillet/chamfer, offset, major constraints, linear dims). **Pick stretch:** splines, driving dimensions, arc–arc fillet polish, mirror/move/rotate/scale, catalog honesty — docs/PARITY_REMAINING_ROADMAP.md §Phase 2 + STRETCH_SCOPE.md.

npm test && npm run build from unified-fab-studio/. Update PARITY_PHASES + src/shared/fusion-style-command-catalog.ts when user-visible.
```

---

## Stream B — Phase 3–4 kernel

```text
You are Stream B: kernel / CadQuery for Unified Fab Studio (unified-fab-studio/).

Full brief: docs/agents/STREAM-B-phase3-solid-kernel.md (Phase 3 solid ops + Phase 4 loft/sheet; baseline shipped — slices are stretch, validation, samples, docs).

Own: engines/occt/*, src/main/cad/build-kernel-part.ts, kernel manifest / part-features schemas as needed. Rebase after Stream A if sketch-profile changed.

Phase 4 baseline (multi-loft + sheet tab UI) is shipped — see `docs/PARITY_PHASES.md`. Stream B stretch: plastic/bend/flat-pattern, loft rails/guides, extra kernel ops — pick one slice.

npm test && npm run build from unified-fab-studio/. Update docs/GEOMETRY_KERNEL.md, PARITY_PHASES, src/shared/fusion-style-command-catalog.ts.
```

---

## Stream C — Phase 5 assembly

```text
You are Stream C: assembly for Unified Fab Studio (unified-fab-studio/).

Full brief: docs/agents/STREAM-C-phase5-assembly.md

Own: src/shared/assembly-schema.ts, src/renderer/assembly/*. IPC in src/main/index.ts only if no other chat edits main — else schema/UI-only this sprint.

**Status:** Phase **5** baseline + listed stretch slices are **Done** in docs/PARITY_PHASES.md (viewport, explode/motion scrub, flat + hierarchical BOM exports, BOM thumb cache + lazy-load, parent-local joint preview axes, universal/cylindrical preview stubs, motion vs joint preview order note, insert-from-project, interference JSON save/download, summary roll-ups). **Pick stretch:** real kinematics / joint limits — docs/PARITY_REMAINING_ROADMAP.md §Phase 5. No design-schema.

npm test && npm run build from unified-fab-studio/. Update PARITY_PHASES + src/shared/fusion-style-command-catalog.ts when user-visible.
```

---

## Stream D — Phase 6 manufacture / CAM

```text
You are Stream D: manufacture / CAM for Unified Fab Studio (unified-fab-studio/).

Full brief: docs/agents/STREAM-D-phase6-manufacture.md

Phase 6 baseline is marked done in docs/PARITY_PHASES.md; stretch = true 2D ops, simulation, deeper slicer (docs/PARITY_REMAINING_ROADMAP.md §Phase 6).

Own: src/shared/manufacture-schema.ts, src/renderer/manufacture/*, src/main/cam-*, engines/cam/*. No design-schema / sketch solver.

**Status:** Phase **6** baseline **Done** (2D ops, OCL/fallback stack, error+hint, sim **stub** partial per phase row). **Pick stretch:** stock-removal simulation, deeper 2D/CAM UX, slicer integration, OCL hint polish — docs/PARITY_REMAINING_ROADMAP.md §Phase 6. New IPC → **Stream S** same batch.

npm test && npm run build from unified-fab-studio/. PARITY_PHASES + src/shared/fusion-style-command-catalog.ts when user-visible. G-code unverified per docs/MACHINES.md.
```

---

## Stream E — Phase 7 product / shell

```text
You are Stream E: product polish for Unified Fab Studio (unified-fab-studio/).

Full brief: docs/agents/STREAM-E-phase7-product.md

**Status:** Phase **7** baseline **Done** (palette, shortcuts, parameters I/O, drawing export shell, persistence, partial drawing manifest / measure / section per phase row). **Pick stretch:** true projected model views, kernel-accurate inspect, fuller drawing pipeline, i18n — docs/PARITY_REMAINING_ROADMAP.md §Phase 7 (many catalog rows already **partial**).

Prefer: src/renderer/shell/*, src/renderer/commands/*, src/shared/fusion-style-command-catalog.ts, src/renderer/src/styles.css. Thin src/renderer/src/App.tsx wrapper only (cap per coordinator).

Ideas: config presets, onboarding, palette/catalog copy, memo/perf in shell — coordinate **Stream Q** on Utilities-heavy UX.

npm test && npm run build from unified-fab-studio/. Update PARITY_PHASES when user-visible.
```

---

## Stream F — Resources only (`resources/`)

**Standalone brief:** [`STREAM-F-resources-only.md`](STREAM-F-resources-only.md) · **Tree index:** [`../../resources/README.md`](../../resources/README.md)

```text
You are Stream F: bundled data only for Unified Fab Studio (unified-fab-studio/resources/).

Read: docs/agents/STREAM-F-resources-only.md and resources/README.md.

Own: resources/machines/*.json, resources/posts/*.hbs, resources/slicer/*, resources/sample-*/** — plus optional docs/*.md that describe those paths.

Deliver (pick one per sprint): machine stub with honest meta; post template header warnings; sample README clarifying workflow; slicer definition notes / troubleshooting table rows.

Rules: no src/* except one-line path fix if broken; no IPC/schemas/catalog. Safety tone = docs/MACHINES.md (unverified G-code / slice).

npm test: required only if docs you edit assert IPC channels or source paths covered by tests; otherwise optional for resources-only diffs.

Parallel: safe with G, H, I, J, K, L when filenames do not collide. Prefer Stream K for posts+machines-only micro-sprints; Stream L for slicer-only.

Final line: Shipped: F — Resources — <path> — <artifact>.
```

---

## Stream G — Docs only

**Standalone brief:** [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md) · **Aggressive pasteable:** above — *Aggressive — Stream G (docs only)*

```text
You are Stream G: documentation only for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-G-docs-only.md first.

Own: docs/**/*.md, README.md, AGENTS.md (this repo), docs/agents/** — and the workspace-root AGENTS.md only when clarifying multi-folder workspace entry (no app code there).

Deliver (pick one per sprint): PARITY_PHASES vs VERIFICATION alignment; README / agents index navigation; troubleshooting or “read first” tables; IPC/channel documentation verified against src/preload/index.ts + src/main/index.ts or src/main/ipc-contract.test.ts.

Rules: **no** src/**, **no** resources/** (use Stream F), **no** fusion-style-command-catalog.ts or schema edits — describe catalog honestly, hand code changes to Streams A–E/S.

npm test from unified-fab-studio/ when docs assert IPC names, preload APIs, or source paths covered by tests; otherwise optional for pure prose/link fixes.

npm run build: optional for Stream G unless the batch is a full release gate (see Aggressive coordinator rule 6).

Parallel: safe with F, H, I, J, K, L if filenames do not collide; coordinate with T if consuming docs/agents/VERIFICATION_DRIFT.md.

Final line: Shipped: Docs — <theme> — <outcome>.
```

---

## Stream H — Tests only (pick one island)

**Standalone brief:** [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md) · **Aggressive block:** **Aggressive — Stream H** (above)

```text
You are Stream H: Vitest-only work in unified-fab-studio/.

Read: docs/agents/STREAM-H-tests-only.md — declare island H1 (shared), H2 (main helpers, not index.ts), H3 (src/renderer/design), or H4 (ipc-contract, existing channels only).

Deliver: new or extended cases in src/**/*.test.ts; production edits only for tiny exports needed by tests (call out file + line count).

Rules: no main/index.ts or preload; no new IPC (Stream S). Do not edit the same production files another feature stream owns this batch.

npm test (required). npm run build recommended before merge; required if using Aggressive — Stream H.

Final line: Shipped: Tests — <island + files> — <what regressions are caught>.
```

---

## Stream S — IPC integration (main + preload)

**Standalone brief:** [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) · **Aggressive block:** **Aggressive — Stream S** (above)

```text
You are Stream S: IPC wiring only for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-S-ipc-integration.md first.

Own: src/main/index.ts, src/preload/index.ts — plus src/main/**/*.ts modules you call from new handlers (keep registration file thin).

Deliver (pick one per batch): new or renamed invoke/handle pair(s); extended preload Api; thin delegation to existing main helpers.

Rules: you are the only chat this batch that freely edits main index + preload together. Feature streams (C, D, E, R, …) hand off registration here. Renderer edits only if required for one call site.

npm test (required — ipc-contract.test.ts). npm run build required before merge.

Parallel: serialize with any other work that must touch the same two files; safe beside F, G, H, I, J, K, L, M, P when you stay in main/preload (P avoids index.ts by design).

Final line: Shipped: IPC — <channels> — <consumer>.
```

---

## Stream P — Electron main helpers (not `index.ts`)

**Standalone brief:** [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) · **Aggressive block:** **Aggressive — Stream P** (above)

```text
You are Stream P: main-process implementation work in unified-fab-studio/ — not IPC registration.

Read: docs/agents/STREAM-P-electron-main-helpers.md — declare island P1 (CAM/posts/slicer), P2 (drawing/project/settings), P3 (assembly mesh / STL / occt-import), or P4 (other main utils; not Stream R import registry).

Deliver: refactors, clearer errors, small pure helpers, and tests in src/main/**/*.test.ts for code you change.

Rules: no src/main/index.ts or src/preload/index.ts; no new ipcMain.handle (Stream S). Defer mesh-import-registry, tools-import, unique-asset-filename to Stream R unless coordinated.

npm test + npm run build (required for Aggressive — Stream P).

Final line: Shipped: Main — <P1|P2|P3|P4 + files> — <outcome>.
```

---

## Stream I — Python CAM (`engines/cam/`)

**Standalone brief:** [`STREAM-I-python-cam.md`](STREAM-I-python-cam.md) · **Aggressive block:** **Aggressive — Stream I** (above)

```text
You are Stream I: Python OpenCAMLib CAM sidecar in unified-fab-studio/.

Read: docs/agents/STREAM-I-python-cam.md first.

Own: engines/cam/*.py and engines/cam/README.md.

Deliver (pick one per sprint): clearer _die / JSON errors, config validation, README exit-code table, smoke_ocl_toolpath coverage, or one isolated ocl_toolpath strategy tweak — preserve one-line stdout JSON and toolpathJson file contract (see ocl_toolpath.py docstring + src/main/cam-runner.ts tryOclToolpath).

Rules: no engines/occt (Stream J); no resources/** (F/K/L). If cam-runner.ts or IPC must change, coordinate Stream D and Stream S.

Verify: python engines/cam/smoke_ocl_toolpath.py; npm test && npm run build if using Aggressive — Stream I or your batch requires it.

Parallel: safe with J (disjoint folder); coordinate D when JSON keys or error codes affect fallbacks.

Final line: Shipped: CAM-Python — <file or theme> — <outcome>.
```

---

## Stream J — Python OCCT (`engines/occt/`)

**Standalone brief:** [`STREAM-J-python-occt.md`](STREAM-J-python-occt.md) · **Aggressive block:** **Aggressive — Stream J** (above)

```text
You are Stream J: Python OCCT / CadQuery sidecar in unified-fab-studio/.

Read: docs/agents/STREAM-J-python-occt.md first.

Own: engines/occt/*.py and engines/occt/README.md; optional docs/GEOMETRY_KERNEL.md updates only for Python stdout, CLI, or error codes you changed.

Deliver (pick one per sprint): clearer _emit_json errors, loft/boolean edge cases, step_to_stl filesystem/export failures, README manual test examples — without breaking the last-line JSON contract (see src/main/cad/occt-import.ts runPythonJson).

Rules: no src/** edits (Stream B owns build-kernel-part.ts and schemas). Do not change sketch payload shape without Stream A+B. engines/cam is Stream I.

npm test && npm run build before merge if using Aggressive — Stream J; otherwise match your batch’s bar.

Parallel: safe with Stream I (different folder); coordinate Stream B when kernel manifest or payload versioning moves.

Final line: Shipped: OCCT — <file or theme> — <outcome>.
```

---

## Stream K — Posts & machines JSON

**Standalone brief:** [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) · **Machines index:** [`../../resources/machines/README.md`](../../resources/machines/README.md) · **Aggressive block:** *Aggressive — Stream K* (above)

```text
You are Stream K: bundled posts and machine profiles only for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-K-posts-machines.md and resources/machines/README.md.

Own: resources/posts/*.hbs, resources/machines/*.json — plus optional docs/*.md that describe **only** those paths (same npm bar as Stream G for doc claims).

Deliver (pick one per sprint): new machine stub + README row; post header comment pass (units, WCS, unverified G-code); honest meta/dialect notes on JSON; docs cross-links that mention only posts/machines.

Rules: no resources/slicer/, no resources/sample-*/; no schemas, IPC, or command catalog. Prefer zero src/** edits; one-line post-process fix only if JSON cannot resolve the template name.

npm test: required only if docs assert IPC or test-covered paths; optional for resources-only diffs under posts/ and machines/.

Parallel: safe with G, H, I, J, L when filenames do not collide; prefer K over F when you are **not** touching samples or slicer.

Final line: Shipped: Posts/Machines — <theme> — <outcome>.
```

---

## Stream L — Cura / slicer resources

**Standalone brief:** [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) · **Slicer index:** [`../../resources/slicer/README.md`](../../resources/slicer/README.md) · **Aggressive block:** *Aggressive — Stream L* (above)

```text
You are Stream L: Cura / slicer bundled definitions only for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-L-cura-slicer.md and resources/slicer/README.md.

Own: resources/slicer/*.def.json, resources/slicer/README.md — plus optional docs/*.md that describe **only** Cura paths, env vars, or resources/slicer/ (same npm bar as Stream G for doc claims).

Deliver (pick one per sprint): new def stub + README row; troubleshooting / Windows path table rows; honest inherits or Cura-version mismatch notes; cross-links that mention slice paths only (e.g. VERIFICATION.md slice row).

Rules: no resources/machines/, resources/posts/, resources/sample-*/; no schemas, IPC, or fusion-style-command-catalog. Prefer **zero** src/**; one objective line in src/main/slicer.ts only if a bundled filename cannot be fixed in JSON — state the file in Shipped:.

npm test: required only if docs assert IPC channels, slicer.ts behavior, or source paths covered by tests; optional when edits stay under resources/slicer/ only.

Parallel: safe with F, G, H, I, J, K when filenames do not collide; prefer **L** over **F** when you are **not** touching samples, posts, or machines.

Final line: Shipped: L — slicer — <theme> — <outcome>. (Equivalent: `Shipped: Slicer — …` per STREAM-L-cura-slicer.md.)
```

---

## Stream R — Mesh import, tool libraries, `importHistory`

**Standalone brief:** [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) · **Mesh engine:** [`../../engines/mesh/README.md`](../../engines/mesh/README.md) · **Aggressive block:** *Aggressive — Stream R* (above)

```text
You are Stream R: unified mesh import, asset naming, tool library import, and project import audit for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-R-import-mesh-tools.md first.

Own: src/main/mesh-import-registry.ts (+ test), tools-import.ts (+ test), unique-asset-filename.ts (+ test), src/shared/mesh-import-formats.ts, engines/mesh/* — plus src/shared/project-schema.ts **only** for importHistory / importHistoryEntrySchema / roundTripLevel when the pipeline needs it.

Deliver (pick one per sprint): new import format route; clearer STEP/trimesh error surfacing; CSV or gzip tool parser robustness; importHistory warnings UX in Utilities; VERIFICATION.md import checklist row; mesh_to_stl.py JSON contract hardening.

Rules: STEP/CadQuery **internals** → **Stream B** + **J**; new **ipcMain.handle** wiring → **Stream S** if main/preload are busy; **tool-schema** field semantics for CAM → coordinate **Stream D**. Do not own sketch-schema or unrelated cam-local/toolpath work.

Verify: npm test && npm run build (Aggressive — Stream R). Optional: manual trimesh import per engines/mesh/README.md.

Parallel: safe with **I** (engines/cam), **J** (engines/occt) on disjoint paths; coordinate **B** on occt-import / STEP errors; coordinate **Q** on UtilitiesWorkspacePanels.tsx if both edit the same file.

Final line: Shipped: Import — <theme> — <outcome>.
```

---

## Stream M — Smoke gate & verification report

**Standalone brief:** [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) · **Aggressive block:** *Aggressive — Stream M* (above)

**vs Stream T:** **T** produces or refreshes **`docs/agents/VERIFICATION_DRIFT.md`** and chases aggressive drift closure; **M** runs the same gates, writes the **report in chat**, and may land **≤1** micro-fix — only **T** should own **VERIFICATION_DRIFT.md** in a parallel batch.

```text
You are Stream M: smoke + verification report for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-M-verifier-smoke.md.

Run: npm test, npm run build, npm run typecheck from unified-fab-studio/. If the batch touched engines/cam/, also run python engines/cam/smoke_ocl_toolpath.py (or state skipped).

Skim docs/VERIFICATION.md, docs/PARITY_PHASES.md, docs/PARITY_REMAINING_ROADMAP.md for obvious mismatches with code/tests; summarize in your reply (Gates / Drift / Handoffs). Large doc drift ⇒ recommend Stream T → Stream G — do not replace VERIFICATION_DRIFT.md unless you are the assigned Stream T chat.

Edits: **none**, OR **one** minimal theme (≤5 doc lines in ≤2 files, OR one tiny test/assertion/typo fix ≤40 lines). No IPC registration, no schema/kernel payload changes.

Avoid hot files other agents own: src/renderer/src/App.tsx, main/index.ts, preload/index.ts, design-schema.ts — unless your single fix is explicitly elsewhere.

Parallel: safe with F, K, G, H, I, J, L for report-only; coordinate with T if both touch verification drift artifacts.

Final line: Shipped: Verify — <pass|fail> — <outcome>.
```

---

## Stream N — Design 3D viewport only

**Standalone brief:** [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) · **Bounds helper tests:** [`../../src/renderer/design/viewport3d-bounds.test.ts`](../../src/renderer/design/viewport3d-bounds.test.ts) · **Aggressive block:** **Aggressive — Stream N** (above)

```text
You are Stream N: the design workspace 3D preview (extrude mesh) in unified-fab-studio/.

Read: docs/agents/STREAM-N-design-viewport3d.md first.

Own: src/renderer/design/Viewport3D.tsx, viewport3d-bounds.ts (+ viewport3d-bounds.test.ts when bounds change), and styles.css rules scoped to .design-3d / .design-3d--* (do not break assembly’s shared .viewport-3d without Stream C coordination).

Deliver (pick one per sprint): grid/lighting/material polish, OrbitControls or Bounds tuning, section clip or pick UX, performance (geometry stability, DPR), design-only layout CSS.

Rules: no Sketch2DCanvas, design-schema, sketch-profile, solver2d (Stream A); no kernel/occt/main cad (Stream B). Default zero diff in DesignWorkspace.tsx; ≤15 lines only if unavoidable — note in Shipped:. App.tsx ≤25 lines or skip.

Verify: npm test && npm run build (Aggressive — Stream N). Optional: npx vitest run src/renderer/design/viewport3d-bounds.test.ts.

Parallel: safe with C, D, E, F, G, I, J, K, L when filenames do not collide; coordinate A on DesignWorkspace; coordinate H3 if both edit viewport3d-bounds.ts.

Final line: Shipped: Viewport3D — <theme> — <outcome>.
```

---

## Stream O — Shared `src/shared/` (non-design)

**Standalone brief:** [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md) · **Aggressive block:** *Aggressive — Stream O* (above)

```text
You are Stream O: shared TypeScript in unified-fab-studio/src/shared/ — NOT design-schema.ts or sketch-profile.ts (Stream A).

Read: docs/agents/STREAM-O-shared-non-design.md. Declare one theme (O1–O5) or one file family before editing.

Own: src/shared/**/*.ts except design-schema.ts, sketch-profile.ts. Do not change fusion-style-command-catalog status/notes (Stream E). Prefer mesh-import-formats coordination with Stream R.

Deliver: Zod/schema tightening, pure helpers, new small modules with tests — ≥1 test file touched per slice.

Rules: no new IPC (Stream S); no engines/** or resources/**. Production edits stay under src/shared/ unless another stream owns the consumer.

npm test required; npm run build required if using Aggressive — Stream O or your batch is release-gated.

Parallel: safe with F, G, H, I, J, K, L when filenames do not collide; serialize with H1 or another O on the same shared module.

Final line: Shipped: Shared — <theme> — <outcome>.
```

---

## Stream S — (see full block above)

The canonical **Stream S** pasteable and **Aggressive — Stream S** are listed **after Stream H** in this file (heading: [Stream S — IPC integration](#stream-s--ipc-integration-main--preload)). Standalone brief: [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md).

---

## Stream P — (see full block above)

The canonical **Stream P** pasteable and **Aggressive — Stream P** are listed **after Stream H** in this file (heading: Stream P — Electron main helpers). Standalone brief: [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md).

---

## Stream Q — Renderer `utilities` workspace UI only

**Standalone brief:** [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) · **Aggressive pasteable:** *Aggressive — Stream Q (utilities UI)* (above)

```text
You improve Utilities workspace panels for Unified Fab Studio (unified-fab-studio/).

Read: docs/agents/STREAM-Q-utilities-ui.md first.

Own: src/renderer/utilities/*; optional src/renderer/shell/AppShell.tsx utility tab strip + scoped src/renderer/src/styles.css. Prefer extending UtilitiesWorkspacePanels.tsx over growing src/renderer/src/App.tsx.

Scope: Project, Settings, Slice, CAM, Tools, Commands, Shortcuts tabs — UX, copy, and a11y; confirmed bugfixes only for behavior (hand IPC/schema changes to Streams S / D / E).

Coordinate: at most ONE agent makes substantive App.tsx edits per sprint; prefer new or split files under utilities/.

npm test && npm run build before claiming done.

Final line: Shipped: Utilities — <tab> — <outcome>.
```
