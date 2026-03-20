# Agent brief — Stream O: Shared code (`src/shared/`, non-design)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **O** (shared non-design Zod/helpers). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Grow **cross-layer contracts** — Zod schemas, pure helpers, and shared types used by main, preload, and renderer — **without** owning sketch design core or product shell copy.

## Mission

Ship **shared** code so that:

- **IPC and UI agree** on parse/validate boundaries (manufacture, assembly, project, CAM params, kernel messages).
- **Parallel agents stay mergeable** — you work in **one theme** per chat and avoid the same `*.ts` as another **O** or **H1** agent in the same batch.
- **Sketch/kernel boundaries stay respected** — no silent payload bumps without the owning stream.

## Allowed paths

| Primary | Notes |
|---------|--------|
| `src/shared/**/*.ts` | Production modules + co-located `*.test.ts` |
| **Exclude (not Stream O)** | `design-schema.ts`, `sketch-profile.ts` → **Stream A** |

**Prefer** editing existing modules (e.g. `manufacture-schema.ts`, `cam-cut-params.ts`, `assembly-schema.ts`) over scattering one-off types in renderer or main.

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| New or stricter Zod schemas, refinements, `.strict()`, branded ids | **Any** edit to `design-schema.ts` or `sketch-profile.ts` |
| Pure functions exported for main/renderer reuse | New **`ipcMain.handle`** / preload API — **Stream S** |
| New `*.test.ts` next to the shared module you change | **`fusion-style-command-catalog.ts`** **status/notes** rows — **Stream E** (importing types/constants read-only is OK) |
| **≤15 lines** of import/type fixes in **one** consumer file if a shared export rename is unavoidable — state the file in **Shipped:** | Drive-by edits under `src/renderer/**` or `src/main/**` — use **C/D/E/P** for feature work; **O** stays in `src/shared/` |

- **`npm test`** from **`unified-fab-studio/`** must pass before you claim done.
- For **Aggressive — Stream O**, also run **`npm run build`**.

## Themes (pick **one** per chat)

Use this table to **declare ownership** in your first message. Stay inside the theme’s **shared** files for production edits.

| Theme | Typical modules | Example tests |
|-------|-----------------|---------------|
| **O1 — Project & tools** | `project-schema.ts`, `project-tool-machine-kernel-schema.test.ts`, `tool-schema.ts` | co-located `*.test.ts` |
| **O2 — Manufacture & CAM** | `manufacture-schema.ts`, `manufacture-cam-gate.ts`, `cam-cut-params.ts`, `cam-tool-resolve.ts`, `cam-2d-derive.ts`, `cam-simulation-preview.ts` | `manufacture-schema.test.ts`, `cam-*.test.ts` |
| **O3 — Assembly** | `assembly-schema.ts`, `assembly-viewport-math.ts` | `assembly-schema.test.ts`, `assembly-viewport-math.test.ts` |
| **O4 — Kernel messages & features** | `kernel-manifest-schema.ts`, `part-features-schema.ts`, `kernel-build-messages.ts`, `kernel-op-summary.ts` | matching `*.test.ts` |
| **O5 — Cross-cutting small modules** | `drawing-sheet-schema.ts`, `file-parse-errors.ts`, `app-keyboard-shortcuts.ts`, `machine-schema.ts` | matching `*.test.ts` |

**Do not** treat **`mesh-import-formats.ts`** as a free-for-all — **Stream R** owns import/mesh registry integration; coordinate or hand off if the change is import-format routing rather than a generic shared type.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **A** | A owns sketch schema; **O** must not touch `design-schema` / `sketch-profile`. |
| **B** | Kernel payload / manifest version bumps: align with **B** before changing `kernel-manifest-schema` or `part-features-schema` semantics. |
| **C / D** | May consume your schema changes; keep defaults backward-compatible or document migration in code comments **only if** the owning stream already tracks it. |
| **E** | E owns catalog honesty; **O** does not retarget command rows. |
| **H1** | H1 tests `src/shared` too — **serialize** if two chats touch the same production **and** test file. |
| **R** | R owns `mesh-import-formats.ts` and import IPC paths — prefer **R** for format tables tied to registry behavior. |
| **S** | No new IPC from **O**; add channels only via **S**. |

## Success criteria (one slice per chat)

- **One shipped theme**: e.g. “manufacture op params reject invalid depth”, “cam-tool-resolve falls back with explicit reason”, “assembly transform parse error surfaces zod path”.
- **≥1** test file created or extended with cases that fail on `main` before your fix.
- **`npm test` green**; for **Aggressive — Stream O**, **`npm run build` green** too.

## Final reply format

End with a single line:

`Shipped: Shared — <theme + file(s)> — <what callers can rely on now>.`

---

## Focused Vitest runs

From **`unified-fab-studio/`** (optional speed loop while editing one module):

```bash
npx vitest run src/shared/manufacture-schema.test.ts
npx vitest run src/shared/cam-cut-params.test.ts
npx vitest run src/shared/assembly-schema.test.ts
npx vitest run src/shared/kernel-manifest-schema.test.ts
```

## See also

- Pasteables menu: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) — **Stream O**, **Aggressive — Stream O**, **MICRO-SPRINT (Stream O)**.
- **`mesh-import-formats.ts`** and import/registry behavior → coordinate **Stream R** — [`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md).
- Sketch JSON / solver payloads → **Stream A** — [`STREAM-A-phase2-sketch.md`](STREAM-A-phase2-sketch.md).
- Tests-only coverage of shared modules → **Stream H** island **H1** — [`STREAM-H-tests-only.md`](STREAM-H-tests-only.md).
- Parallel plan: [`../AGENT_PARALLEL_PLAN.md`](../AGENT_PARALLEL_PLAN.md).
