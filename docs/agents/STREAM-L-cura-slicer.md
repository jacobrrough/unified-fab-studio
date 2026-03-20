# Agent brief — Stream L: Cura / slicer resources only

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **L** (Cura / `resources/slicer/`). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Merge-ready pasteable:** **Aggressive — Stream L** in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) (coordinator `Shipped:` line, npm carve-outs). **Short pasteable:** same file → section *Stream L — Cura / slicer resources*.

**Role:** Improve **`resources/slicer/`** and **Cura-related documentation** — the narrow lane inside Stream **F** when you want **zero** overlap with `resources/sample-*`, `resources/machines/`, or `resources/posts/` in the same chat.

## Mission

Ship **slicer definition stubs** and **operator docs** so users can run **Utilities → Slice** with CuraEngine:

- **Definition JSON** (`resources/slicer/*.def.json`) — valid `inherits`, honest machine geometry notes, link to parent definitions path expectations.
- **Folder README** — **[`resources/slicer/README.md`](../../resources/slicer/README.md)**: `CURA_ENGINE_SEARCH_PATH`, Windows path examples, troubleshooting table, safety pointer to **`docs/MACHINES.md`**.

Optional: **`docs/*.md`** updates that **only** describe Cura paths, env vars, or `resources/slicer/` files (keep in sync with **[`resources/README.md`](../../resources/README.md)**).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| `resources/slicer/**` | `resources/machines/`, `resources/posts/`, `resources/sample-*/**` |
| `docs/**/*.md` that describe slicer/Cura only | `fusion-style-command-catalog.ts`, Zod schemas, IPC unless you are fixing a **documented** channel name |
| JSON / Markdown under slicer | `engines/cam/*`, `engines/occt/*` |

- **Slice output is not verified** for any printer until temperatures, limits, and start/end G-code are checked — align tone with **`docs/MACHINES.md`**.
- Prefer **additive** stubs (new `.def.json` + README row) over renaming files the app references; if you rename, **grep** for the old basename (`slicer.ts`, docs, `project.json` samples).

**TypeScript:** avoid `src/**`. Exception: **one** objective path or string fix in **`src/main/slicer.ts`** if a bundled definition filename is wrong — prefer fixing docs and JSON first; state the file in **Shipped:** if you touch TS.

## Overlap with other streams

| Stream | When to use |
|--------|-------------|
| **F** | You also touch **samples**, **posts**, **machines**, or multiple `resources/` trees in one sprint. |
| **L** | **Only** `resources/slicer/` + Cura-focused docs. |
| **D** | Manufacture / `cam:run` / cam-runner — hand off if slice IPC or `slicer.ts` behavior needs a feature change. |
| **G** | Large doc-only refactors across the repo — use **G** if you are not touching `resources/slicer/` at all. |

Parallel with **F**, **G**, **H**, **I**, **J**, **K**, **M** when **filenames** do not collide; do not edit the same **`docs/*.md`** file another chat owns in the same batch without splitting ownership.

## Pasteables (copy into a chat)

- Standard prompt: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → section **Stream L — Cura / slicer resources**  
- Merge-ready: same file → **Aggressive — Stream L (slicer / Cura stubs)**  
- Narrow micro-sprint: same file → **Micro-sprint templates** → *MICRO-SPRINT (attach to Stream L)*

## Verification

- **No `npm test` required** if you change **only** `resources/slicer/*` (and optional `resources/README.md` **slicer row** if it already exists — keep edits scoped).
- Run **`npm test`** if **`docs/`** edits assert **IPC**, **`src/main/slicer.ts`** behavior, or paths covered by **`slicer.test.ts`**.

## Success criteria (pick one slice per chat)

- One **shipped artifact**, for example:
  - New **`*.def.json`** stub + row in **`resources/slicer/README.md`**;
  - **Troubleshooting** or **Windows path** table rows;
  - **Honest limitations** note (inherits chain, version mismatch with Cura install);
  - **Cross-link** fix between README and **`docs/VERIFICATION.md`** only where it cites slice/Cura.

## Micro-sprint examples

- Add a **printer-family** `.def.json` that inherits an existing bundled parent; document the chain and any overridden keys in **`resources/slicer/README.md`**.
- Add a **“definition not found”** troubleshooting row that maps `CURA_ENGINE_SEARCH_PATH` to this repo’s `resources/slicer/` layout (Windows + POSIX one-liners).
- Tighten **bed / mesh** honesty in stub metadata or README where retail firmware differs from the generic envelope.

## Final reply format

End with a single line. Coordinators often use:

`Shipped: L — slicer — <artifact> — <outcome>.`

The brief’s alternate form is equivalent:

`Shipped: Slicer — <file(s) or theme> — <what an operator or integrator gains>.`
