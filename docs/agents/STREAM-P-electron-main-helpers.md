# Agent brief — Stream P: Electron main helpers (not `index.ts`)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **P** (main helpers, not `index.ts`). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Related:** [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md) — **R** owns **`mesh-import-registry`**, **`tools-import`**, **`unique-asset-filename`**, **`engines/mesh`**; [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md) — **S** owns **`main/index.ts`** + **`preload`**.

**Role:** Improve **main-process implementation** under `src/main/**` while **IPC registration stays elsewhere** — deeper refactors, clearer errors, small pure-helper extractions, and **tests that live next to the code you touch**.

## Mission

Ship **maintainable main-process logic** so that:

- **Thin `index.ts`** — handlers stay small; heavy work lives in modules this stream owns.
- **Parallel safety** — you declare **one island (P1–P4)** per chat and avoid hot-file fights with **Stream S**, **Stream R**, and **Stream H2**.
- **Regression coverage** — extend or add `src/main/**/*.test.ts` for behavior you change (same PR).

## Allowed paths

| Primary | Notes |
|---------|--------|
| `src/main/**/*.ts` | **Excluding** `src/main/index.ts` |
| `src/main/**/*.test.ts` | Co-located tests for modules in your island |

**Forbidden as ownership** (other streams):

| Path / topic | Owner |
|--------------|--------|
| `src/main/index.ts` | **Stream S** (or serialized integration agent) |
| `src/preload/index.ts` | **Stream S** |
| `src/main/mesh-import-registry.ts`, `tools-import.ts`, `unique-asset-filename.ts`, `engines/mesh/*` | **Stream R** — do not refactor here unless you **coordinate R** |
| `src/main/cad/build-kernel-part.ts` and kernel payload contracts | **Stream B** — coordinate before changing stdout/JSON shape |
| `src/shared/design-schema.ts`, `sketch-profile.ts` | **Stream A** / **O** |

## Hard rules

| Do | Do not |
|----|--------|
| Refactor **internals** of helpers; improve error messages and logging tone | Add **`ipcMain.handle`** / new `invoke` channels — **Stream S** + **preload** + **`ipc-contract.test.ts`** in one batch |
| **Export** a small pure function if it improves testability (prefer same file first) | Drive-by edits across **multiple** islands in one chat |
| Run **`npm test`** and **`npm run build`** from **`unified-fab-studio/`** before “done” (aggressive pasteables always require both) | Imply G-code or toolpaths are **safe** for real machines — keep **MACHINES.md** tone |

- **New IPC:** stop and hand off **Stream S**; you may still add **unit tests** that call pure helpers **without** registering handlers.
- **Overlap with Stream H:** **H2** often adds tests for the same folders; avoid two chats editing the **same** `src/main/*.ts` **and** the **same** `*.test.ts` simultaneously — serialize or split “prod (P)” vs “tests-only (H)”.

## Islands (pick **one** per chat)

Declare **P1 | P2 | P3 | P4** in your first message. Stay inside that island for **production** edits.

| Island | Production scope (indicative) | Example tests already nearby |
|--------|--------------------------------|-------------------------------|
| **P1 — CAM, posts, slicer** | `cam-local.ts`, `cam-runner.ts`, `cam-operation-policy.ts`, `post-process.ts`, `slicer.ts`, `machines.ts` | `cam-local.test.ts`, `post-process.test.ts`, `cam-runner.test.ts`, `slicer.test.ts` |
| **P2 — Drawing & project IO** | `drawing-export-*.ts`, `drawing-export-service.ts`, `drawing-file-store.ts`, `project-store.ts`, `settings-store.ts` | `drawing-export-*.test.ts`, `drawing-file-store.test.ts`, `drawing-export-service.test.ts` |
| **P3 — Assembly mesh, STL, OCCT import** | `assembly-mesh-interference.ts`, `stl.ts`, `cad/occt-import.ts` | `assembly-mesh-interference.test.ts`, `stl.test.ts` |
| **P4 — Shared main utilities** | `paths.ts` and other small `src/main/*.ts` not owned by **R** or **P1–P3** above | Add or extend `*.test.ts` next to the module |

If your slice touches **two** islands, pick the **primary** island and keep the secondary file to **≤10 lines** (e.g. import path fix) or split chats.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **S** | S owns `main/index.ts` + `preload`; P never registers IPC. |
| **D** | D owns manufacture **UI/schema** and often **`cam-*` “feature”** direction; P implements/refactors **main** helpers — coordinate if `cam-runner` JSON contract changes. |
| **R** | R owns import registry / tool libraries; P **defers** those files. |
| **H** | H2 tests main helpers; P edits production — avoid parallel edits on the same pair of `.ts` / `.test.ts` without agreement. |
| **K / L / F** | Bundled JSON under `resources/` — if P needs a **one-line** path fix in `post-process.ts` or `slicer.ts`, say so in **Shipped:**; prefer fixing JSON in **K/L/F** first. |

## Success criteria (one slice per chat)

- **One theme:** e.g. “cam-local path normalization”, “post-process clearer template miss error”, “drawing export edge case”.
- **≥1** test file touched **or** meaningful extension of existing cases in your island.
- **`npm test`** green; **`npm run build`** green (required for **Aggressive — Stream P**).

## Final reply format

End with a single line:

`Shipped: Main — <P1|P2|P3|P4 + key file(s)> — <integrator or machinist-visible outcome>.`

---

## Focused Vitest runs

From **`unified-fab-studio/`** (optional while editing one island):

```bash
npx vitest run src/main/cam-local.test.ts
npx vitest run src/main/post-process.test.ts
npx vitest run src/main/drawing-export-service.test.ts
npx vitest run src/main/assembly-mesh-interference.test.ts
```

Use **`npx vitest run`** (no watch) before claiming the full suite is green.

## See also

- IPC registration owner: [`STREAM-S-ipc-integration.md`](STREAM-S-ipc-integration.md).
- Pasteables: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — **Stream P**, **Aggressive — Stream P**, **MICRO-SPRINT (Stream P)**.
- IPC ground truth: [`../../src/main/ipc-contract.test.ts`](../../src/main/ipc-contract.test.ts), [`../../src/main/index.ts`](../../src/main/index.ts), [`../../src/preload/index.ts`](../../src/preload/index.ts).
- Safety tone: [`../MACHINES.md`](../MACHINES.md).
