# Coordinator-led parallel agents (Unified Fab Studio)

**App root:** `unified-fab-studio/` — agents run `npm test` / `npm run build` (and `npm run typecheck` when Stream **M** applies) from there.

This page is the **canonical guide** for an optional **lead (Coordinator) chat**: assign streams, block bad pairings, define **merge order**, and collect **Shipped:** one-liners plus gate evidence. Copy-paste prompts still live in [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) and [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md).

---

## Choose a coordinator pasteable (batch bar)

| Variant | Where | Use when |
|--------|--------|----------|
| **Short Coordinator** | [ALL_STREAMS_AGENT_PLANS.md](ALL_STREAMS_AGENT_PLANS.md) — § Coordinator (optional lead chat) | Quick lead chat: core hot-file rules, IPC contract, merge order summary, parity honesty |
| **Aggressive Coordinator** | [PARALLEL_PASTABLES.md](PARALLEL_PASTABLES.md) — § Aggressive coordinator (lead chat) | Merge-ready batches: explicit per-stream **npm test** / **npm run build** / **typecheck** rules, App.tsx caps, H/O/P/M/N/Q/S carve-outs |

The Aggressive block is a **strict superset** of the short block for gates and stream-specific rules.

---

## Pre-read for the Coordinator

- [`docs/AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md) — dependency waves, stream ownership, hot files, practical multi-chat setup
- [`docs/PARITY_PHASES.md`](../PARITY_PHASES.md) — phase truth
- [`docs/PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) — backlog / exit criteria
- [`docs/VERIFICATION.md`](../VERIFICATION.md) — regression / QA checklists
- [`docs/agents/PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — **conflict quick reference** + **Aggressive** stream blocks

Stream one-pagers: [`docs/agents/README.md`](README.md) and the quick index in [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md).

---

## Stream map (assign chats)

| Letter | Focus | Full brief |
|--------|--------|------------|
| **A** | Sketch v2, solver, design UI | [`STREAM-A-phase2-sketch.md`](STREAM-A-phase2-sketch.md) |
| **B** | CadQuery kernel | [`STREAM-B-phase3-solid-kernel.md`](STREAM-B-phase3-solid-kernel.md) |
| **C** | Assembly | [`STREAM-C-phase5-assembly.md`](STREAM-C-phase5-assembly.md) |
| **D** | Manufacture / CAM | [`STREAM-D-phase6-manufacture.md`](STREAM-D-phase6-manufacture.md) |
| **E** | Shell / product polish | [`STREAM-E-phase7-product.md`](STREAM-E-phase7-product.md) |
| **S** | `src/main/index.ts` + `src/preload/index.ts` IPC only | [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) |
| **F** | All `resources/**` | [`STREAM-F-resources-only.md`](STREAM-F-resources-only.md) |
| **K** | `resources/posts/`, `resources/machines/` | [`STREAM-K-posts-machines.md`](STREAM-K-posts-machines.md) |
| **L** | `resources/slicer/` | [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) |
| **G** | Docs-only | [`STREAM-G-docs-only.md`](STREAM-G-docs-only.md) |
| **H** | Vitest islands H1–H4 | [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md) |
| **I** | `engines/cam/*.py` | [`STREAM-I-python-cam.md`](STREAM-I-python-cam.md) |
| **J** | `engines/occt/*.py` | [`STREAM-J-python-occt.md`](STREAM-J-python-occt.md) |
| **M** | Smoke + in-chat verification report | [`STREAM-M-verifier-smoke.md`](STREAM-M-verifier-smoke.md) |
| **N** | Design `Viewport3D` | [`STREAM-N-design-viewport3d.md`](STREAM-N-design-viewport3d.md) |
| **O** | `src/shared/*` except design sketch | [`STREAM-O-shared-non-design.md`](STREAM-O-shared-non-design.md) |
| **P** | `src/main/*` except `index.ts` | [`STREAM-P-electron-main-helpers.md`](STREAM-P-electron-main-helpers.md) |
| **Q** | Utilities workspace UI | [`STREAM-Q-utilities-ui.md`](STREAM-Q-utilities-ui.md) |
| **R** | Import / mesh / tools | [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) |
| **T** | Owns [`VERIFICATION_DRIFT.md`](VERIFICATION_DRIFT.md) | [`STREAM-T-verifier-drift.md`](STREAM-T-verifier-drift.md) |

**Dependency note:** sketch schema work (**A**) should land before kernel work (**B**) when `design-schema` / `sketch-profile` / payload change. See the phase diagram in [`AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).

---

## Conflict checks before you spawn chats

Use the **Conflict quick reference** table at the top of [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) as the go / no-go list. High-friction pairs to internalize:

- **C + D** if both need `main/index.ts` without a **Stream S** plan
- **A + B** if both touch `sketch-profile` / kernel payload without coordination
- Multiple chats adding `ipcMain.handle` without a single **S** owner
- **N + A** on heavy `DesignWorkspace.tsx` churn
- **Q + E** if both need large `App.tsx` edits — keep **Q** in `utilities/*` or serialize
- **O + H1** or two **O** chats on the same `src/shared/*.ts` (and its `*.test.ts`)
- **R + O** on `mesh-import-formats.ts` — **R** leads; coordinate
- **M + T** both editing `docs/agents/VERIFICATION_DRIFT.md` — **T** owns that file

**Hot files** (serialize or single owner): `src/renderer/src/App.tsx`, `src/renderer/shell/AppShell.tsx` (utilities tab strip / shell chrome), `src/main/index.ts`, `src/preload/index.ts`, `src/shared/design-schema.ts` — see [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) and [`AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).

---

## Merge order (write it down per batch)

1. **S first** if the batch adds or changes IPC (`main/index.ts` + `preload`).
2. **A before B** if `sketch-profile`, `design-schema`, or sketch payload changed in that batch.
3. **C / D / E / R** and other lanes: **any order** if `git diff --name-only` is **disjoint** and IPC rules are satisfied.

Example: `S → A → B → (C, D, E in parallel) → …`

---

## Hard rules summary

1. **One IPC writer per batch** — at most one parallel chat freely edits `src/main/index.ts` and `src/preload/index.ts`; use **Stream S** or serialize. Every preload `invoke` must have `ipcMain.handle`; `npm test` runs [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts).
2. **App.tsx** — ≤25 lines changed per non-S chat unless extracted to a new module first (Aggressive coordinator rule).
3. **M vs T** — do not assign **M** and **T** to rewrite `docs/agents/VERIFICATION_DRIFT.md` in the same batch.
4. **User-visible honesty** — reject work with no `npm test` (and no build where required); update [`src/shared/fusion-style-command-catalog.ts`](../../src/shared/fusion-style-command-catalog.ts) and [`docs/PARITY_PHASES.md`](../PARITY_PHASES.md) (or roadmap) honestly when behavior is user-visible.

---

## Gate matrix (before accepting “Shipped”)

| Stream / type | Minimum gates (Aggressive coordinator) |
|---------------|----------------------------------------|
| **S** (IPC) | `npm test` + `npm run build` always |
| **M** | `npm test` + `npm run build` + `npm run typecheck`; final reply includes **Gates / Drift / Handoffs** |
| **H** (Aggressive) | `npm test` + `npm run build`; one H1–H4 island per chat |
| **O, P, Q** (Aggressive) | `npm test` + `npm run build` |
| **G** | `npm run build` not required unless full release gate; `npm test` when docs assert IPC paths/channels covered by tests |
| **F / K / L** (resources-only aggressive) | Follow the Aggressive block text — often `npm test` only unless docs claim IPC paths |

Aggressive mode: do not accept “should pass” — require **pasted** command output. Reject replies that end with “next steps” only; require a **Shipped:** one-liner + file list per stream.

**Coordinator closing line** (after collecting child chats):

`Shipped: Coordinator — <batch id> — <merge notes; open risks>`

---

## Operating procedure (each batch)

1. **Name the batch** (e.g. `batch-2025-03-20-cam-ui`).
2. **List intended file/area diffs** and assign **one stream per chat** (paste from [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) or **Aggressive — Stream X** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md)).
3. **Pre-check** the conflict table; adjust (serialize **S**, narrow **App.tsx**, split **O**/**H1**).
4. **Document merge order** (section above).
5. **Collect** from each chat: **Shipped:** line, gate output, touched files.
6. Emit the **Coordinator Shipped** line and archive gate outputs for the next batch.

---

## Practical default (from AGENT_PARALLEL_PLAN)

Favor **C + D + E** while **A** is heavy; run **B** after **A** when sketch schema is moving. The Coordinator **instantiates** that pattern per batch and adds **S** and **F–T** lanes when needed.
