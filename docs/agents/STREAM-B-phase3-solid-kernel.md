# Agent brief — Stream B: Phase 3–4 (Solid / surface kernel)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **B** (kernel phases 3–4). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

## Mission
Extend the **CadQuery / OCCT** path (`build_part.py`) and the TypeScript bridge so saved projects can reproduce **more solid and surface workflows** with honest limits: clear JSON errors, schema + sample coverage, and docs that match behavior.

**Phase 3** — post-extrude **`kernelOps`** / **`postSolidOps`**: fillets, chamfers, shell, patterns, booleans, mirror, holes, sweeps/pipes (partial surrogates), etc.  
**Phase 4** — **loft** (multi-profile union chain), **sheet tab** (`sheet_tab_union`), sketch placement via **`sketchPlane`**.

Baseline for both is **already shipped** — see [`../PARITY_PHASES.md`](../PARITY_PHASES.md) and [`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md). Stream B work is **incremental slices** (one op, one error class, one sample, or one doc/schema fix).

## Hard rules
- Primary: **`engines/occt/build_part.py`**, **`src/main/cad/build-kernel-part.ts`**, **`src/shared/kernel-manifest-schema.ts`**, **`src/shared/part-features-schema.ts`** (and **`sketch-profile.ts`** only when merging `kernelOps` / payload — coordinate with Stream A if **`KernelBuildPayload`** or profile extraction changes). **Python-only** work under **`engines/occt/*.py`** with **no `src/**` edits** may run as **Stream J** ([`STREAM-J-python-occt.md`](STREAM-J-python-occt.md)); stay on **Stream B** when TypeScript, schemas, or payload versioning moves.
- **Rebase after Stream A** if `sketch-profile` / **`design-schema`** kernel-facing shapes changed.
- Do **not** own sketch canvas, assembly tab, or manufacture/CAM — hand off to streams **A / C / D**.
- Python must emit **exactly one JSON object on the last stdout line** (success or failure); no debug prints on stdout.
- **IPC changes** (new `invoke` channels): use **Stream S** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) or edit **`main/index.ts` + `preload/index.ts` + `ipc-contract.test.ts`** in the same batch.

## Suggested order (per slice)
1. Declare **one** deliverable: new **`postSolidOp` kind**, stricter **validation** + error codes, **sample** under **`resources/sample-kernel-solid-ops/`** or **`resources/sample-kernel-*/`**, or manifest/schema field.
2. Implement in **`build_part.py`** (validate early in `_validate_post_solid_ops` / `_validate_kernel_payload`, then apply in `_apply_post_solid_ops`).
3. Mirror in **Zod** (`part-features-schema.ts`) and **`attachKernelPostOpsToPayload`** / **`kernelPayloadVersionForOps`** in **`sketch-profile.ts`** if the op bumps payload version.
4. **Tests:** extend **`part-features-schema.test.ts`**, **`sketch-profile.test.ts`**, **`sample-kernel-solid-ops-examples.test.ts`** (auto-parses every `part/*.example.json`), or **`kernel-placement-parity.test.ts`** when relevant.
5. Update **[`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md)** in the section you touched (concise).

## Success criteria (pick a slice per PR)
- **One** reproducible behavior from disk (sample + schema + Python) **or** one **actionable** failure path (structured `error` / `detail`).
- **`npm test`** and **`npm run build`** from **`unified-fab-studio/`**.
- User-visible catalog rows: update **`src/shared/fusion-style-command-catalog.ts`** and **[`../PARITY_PHASES.md`](../PARITY_PHASES.md)** (or **[`../PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md)**) when the change affects what users can do in the app.

## Stretch ideas (do not boil the ocean)
From **[`../PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md)** §Phase 3–4 stretch: orientation-follow sweeps/pipes, true thicken/offset, helical thread, loft rails/guides, sheet metal **bends / flat pattern**, plastic rule features. Pick **one** vertical slice per agent.

## Context files
- **[`../GEOMETRY_KERNEL.md`](../GEOMETRY_KERNEL.md)** — op catalog, JSON contract, file map.
- **[`../VERIFICATION.md`](../VERIFICATION.md)** — Geometry kernel checklist after builds.
- Samples: **[`../../resources/sample-kernel-solid-ops/README.md`](../../resources/sample-kernel-solid-ops/README.md)**.

## Blockers
- Wait for **Stream A** merge if Phase 2 changes **`KernelBuildPayloadV1`** or profile format without your coordinated bump.

## Overlap with Stream R

**Unified mesh import** routes **STEP** through [`src/main/cad/occt-import.ts`](../../src/main/cad/occt-import.ts) (`importStepToProjectStl`). **Stream R** owns the **registry** and user-facing import pipeline; **B** / **J** own **CadQuery** behavior and **`step_to_stl.py`** errors. Coordinate if STEP failure codes or tessellation semantics change.
