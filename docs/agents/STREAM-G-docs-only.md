# Agent brief — Stream G: Docs only (Markdown)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **G** (docs-only lane). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve **accuracy, navigation, and parallel-work ergonomics** for humans and agents — **without** changing application source (`src/**`), schemas, IPC wiring, or bundled resources under `resources/` (that is **Stream F**).

## Mission

Ship **Markdown** (and minimal supporting text in repo roots) so readers can:

- **Find the truth fast** — status and next steps match [`../PARITY_PHASES.md`](../PARITY_PHASES.md) and honest rows in `src/shared/fusion-style-command-catalog.ts` (document *how to read* the catalog; do not edit the TS file in this stream).
- **Verify behavior** — manual checklists in [`../VERIFICATION.md`](../VERIFICATION.md) stay aligned with what the app actually does; add rows or fix drift in prose, not by changing code.
- **Run parallel agents safely** — [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md), [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md), and [`README.md`](README.md) stay consistent (stream ownership, hot files, when to run `npm test`).
- **Onboard and unstick** — README / troubleshooting tables / short checklists where people get stuck (local dev, Python optional engines, CAM safety tone per [`../MACHINES.md`](../MACHINES.md)).

## Allowed paths

| Always in scope | In scope when workspace root is parent folder |
|-----------------|-----------------------------------------------|
| `unified-fab-studio/docs/**/*.md` | Top-level **`AGENTS.md`** (workspace guide) — only for **workspace-wide** pointers (e.g. app root, Stream G link), not app internals |
| `unified-fab-studio/README.md` | |
| `unified-fab-studio/AGENTS.md` | |
| `unified-fab-studio/docs/agents/**/*.md` (including this file) | |

**Optional:** `unified-fab-studio/.cursor/rules/*.mdc` or root `.cursor/` docs **only** if the user explicitly asked for Cursor-rule copy updates in the same docs pass (default: stay under `docs/`, `README`, `AGENTS`).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| Reword, restructure, cross-link, add tables/checklists | **`src/**`** edits (including “tiny” TS fixes — hand off to the owning stream) |
| Fix broken **relative** links between docs | **`resources/**`** data files (machines, posts, samples — **Stream F** / **K** / **L**) |
| Add “see also” to `engines/` or `src/main/` **as documentation only** | New or changed **`ipcMain.handle` / preload API** — **Stream S** |
| Quote channel names / file paths **as documented fact** after spot-checking | Changing **Zod schemas** or **command catalog TypeScript** |

- **IPC names:** If you document `invoke` channels, grep **`src/preload/index.ts`** + **`src/main/index.ts`** or read [`../../src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts) so names match reality.
- **Safety tone:** G-code / toolpaths stay **unverified** until the user validates posts and machine — match [`../MACHINES.md`](../MACHINES.md); never promise safe output in docs.
- Prefer **short** sections and links to canonical files over duplicating long specs (especially kernel/CAM internals — point to `GEOMETRY_KERNEL.md`, `VERIFICATION.md`).

## Canonical sources (do not guess)

| Need | Where |
|------|--------|
| Strings the renderer may `invoke` | [`src/preload/index.ts`](../../src/preload/index.ts) (exposed API) |
| Matching `ipcMain.handle` names | [`src/main/index.ts`](../../src/main/index.ts) |
| Contract sanity | [`src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts) |
| Phase “done vs next” | [`PARITY_PHASES.md`](../PARITY_PHASES.md) + [`PARITY_REMAINING_ROADMAP.md`](../PARITY_REMAINING_ROADMAP.md) |

## Pasteables (copy into a chat)

- Compact per-stream block: [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) → **Stream G — Docs only**  
- Standard prompt: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → section **Stream G — Docs only**  
- Merge-ready: same file → **Aggressive — Stream G (docs only)**  
- After **Stream T** drift output: **MICRO-SPRINT (Stream T → G, sequential)** in the **Micro-sprint templates** section of [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md)

## When to run `npm test`

From **`unified-fab-studio/`**:

| Situation | Run `npm test`? |
|-----------|-----------------|
| Typos / wording only; no paths, IPC, or filenames | Optional |
| Doc asserts **IPC channel** names, **preload** API, or **specific source files** covered by tests | **Yes** |
| You added or changed links to test file paths | **Recommended** |

`npm run build` is **not** required for pure Markdown unless you were asked to validate a release gate; **Stream M** and **Stream T** run the full **`npm test` / `npm run build` / `npm run typecheck`** bar when closing a batch (**M** reports in-chat; **T** may author **`VERIFICATION_DRIFT.md`**).

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **F** | F may touch `docs/` *about* `resources/`; **G** owns narrative in `docs/` that is not resource-file edits. Avoid editing the same `docs/*.md` file in the same batch without splitting sections. |
| **K** / **L** | Narrow lanes may update **`resources/posts/README.md`**, **`resources/machines/README.md`**, **`resources/slicer/README.md`**, or slice-only **`docs/`** lines; **G** may edit the same *topics* in other files — **serialize** if two chats target the **same** markdown path. |
| **H** | H adds tests ([`STREAM-H-tests-only.md`](STREAM-H-tests-only.md)); **G** does not. If docs promised a test path, **G** may fix the doc line to match an existing test file. |
| **T** (Aggressive verifier) | T may create **`docs/agents/VERIFICATION_DRIFT.md`**; **G** may consume that list and fix **≤10** doc lines or merge drift fixes in one pass. |
| **M** (Smoke / verify) | M may fix **≤5** verified doc lines in **≤2** files as its single micro-theme; larger drift ⇒ **G** after **T**’s drift list. Do not let **M** and **T** both rewrite **`VERIFICATION_DRIFT.md`** in one batch. |
| **S** | If docs need a **new** channel, stop: document the gap and assign **S**; **G** ships “pending integration” wording rather than inventing API names. |

## Success criteria (pick one slice per chat)

- One **shipped artifact**: e.g. expanded troubleshooting row, corrected IPC list in a doc, new “read first” links on `README`, aligned **PARITY_PHASES** vs **VERIFICATION** wording, or cleaner **agents/README** index — with **no** `src/**` diff.

## Doc archetypes (examples)

| Goal | Where to edit | Keep in mind |
|------|----------------|--------------|
| “What ships next” honesty | [`PARITY_PHASES.md`](../PARITY_PHASES.md) + pointer to roadmap § | One row per phase; link stretch to `PARITY_REMAINING_ROADMAP.md`, not a novel spec |
| Manual QA steps | [`VERIFICATION.md`](../VERIFICATION.md) | Steps must match current UI labels and IPC names (verify before asserting) |
| Local dev / IPC errors | [`../../README.md`](../../README.md) §Troubleshooting | Symptom → fix; link to preload/main only when telling humans what to sync |
| Parallel agent prompts | [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md), [`README.md`](README.md) | Hot files and merge order stay consistent with [`AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md); **Stream L** slicer prompts live in [`STREAM-L-cura-slicer.md`](STREAM-L-cura-slicer.md) + pastables (do not invent resource paths) |

## Closing checklist (before `Shipped:`)

- [ ] No accidental edits under `src/**`, `resources/**`, or `fusion-style-command-catalog.ts`.
- [ ] Relative Markdown links clicked or path-checked from the file’s directory.
- [ ] If you named an **`invoke`** channel or a **test file path**: confirmed against preload, main, or [`ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts); **`npm test`** run from `unified-fab-studio/`.
- [ ] G-code / CAM language matches [`MACHINES.md`](../MACHINES.md) (unverified until user checks machine/post).

## Final reply format

End with a single line:

`Shipped: Docs — <file(s) or theme> — <what readers or coordinators gain>.`
