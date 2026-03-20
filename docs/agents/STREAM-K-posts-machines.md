# Agent brief — Stream K: Posts & machine profiles only

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **K** (posts + machines JSON). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve **Handlebars post templates** and **machine profile JSON** under `resources/` — the narrow lane inside Stream **F** when you want **zero** overlap with `resources/sample-*`, `resources/slicer/`, or other bundled trees.

## Mission

Ship bundled **posts** and **machines** so machinists and integrators get:

- **Machine profiles** (`resources/machines/*.json`) — honest envelopes, `postTemplate` wiring, `dialect` alignment, optional **`meta`** hints (model notes, “verify feeds with OEM” language). Schema and units: **[`resources/machines/README.md`](../../resources/machines/README.md)** and **[`docs/MACHINES.md`](../MACHINES.md)**.
- **Post templates** (`resources/posts/*.hbs`) — header comments that state **unverified output**, units, WCS, tool-change assumptions, and dry-run expectations (match tone of existing `cnc_generic_mm.hbs`). New templates: add a row or note in **[`resources/posts/README.md`](../../resources/posts/README.md)** when that file lists bundled posts.

Optional: short **`docs/*.md`** updates that **only** describe paths under `resources/posts/` or `resources/machines/` (keep in sync with **[`resources/README.md`](../../resources/README.md)**).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| `resources/posts/**`, `resources/machines/**` | `resources/slicer/**`, `resources/sample-*/**`, any other `resources/` subtree |
| `docs/**/*.md` that document posts/machines paths only | `fusion-style-command-catalog.ts`, Zod schemas, IPC/preload/main feature work |
| JSON / Handlebars / Markdown | New `ipcMain.handle`, preload API, or `engines/*` |

- **G-code is never guaranteed safe** — comments and `meta` must not promise collision-checked or machine-verified output; point readers to **`docs/MACHINES.md`**.
- Prefer **additive** files (new machine stub, new post variant) over renaming **`id`** or template filenames; if you rename, **grep** the repo for the old value first (including `project.json` samples and docs).
- **TypeScript:** avoid `src/**`. Exception: **one** objective fix in **`src/main/post-process.ts`** (e.g. wrong default template name) if a bundled resource is unreachable — state the line in your **Shipped:** note; prefer fixing the JSON `postTemplate` field instead.

## Overlap with other streams

| Stream | When to use |
|--------|----------------|
| **F** | You also touch **samples**, **slicer**, or multiple `resources/` folders in one sprint. |
| **K** | **Only** posts + machines — minimizes merge conflicts with slicer or sample work. |
| **L** | **Only** `resources/slicer/` + Cura-related docs. |
| **D** | CAM TypeScript, `manufacture-schema`, `cam-*` — hand off if the fix requires code, not templates. |

Parallel with **G**, **H**, **I**, **J**, **L** when **filenames** do not collide; do not edit the same **`docs/*.md`** file another chat owns in the same batch.

## Verification

- **No `npm test` required** if you change **only** `resources/posts/*` and `resources/machines/*` (and optional `resources/machines/README.md` / `resources/README.md` if those files already describe machines — keep edits scoped).
- Run **`npm test`** from `unified-fab-studio/` if **`docs/`** edits assert **IPC channels**, **source paths**, or **filenames** covered by tests (same bar as Stream **G**).

## Success criteria (pick one slice per chat)

- One **shipped artifact**, for example:
  - New **`resources/machines/*.json`** stub + one row in **`resources/machines/README.md`**;
  - **Header comment pass** on one post template or a consistent pattern across **≤3** `.hbs` files;
  - **`meta` / notes** hardened on an existing machine JSON (honest limitations, dialect caveats);
  - **`docs/MACHINES.md`** or **`resources/README.md`** cross-link fix **only** where it clarifies posts or bundled machines.

## Micro-sprint examples

- Add a **“generic benchtop mm”** machine JSON that reuses an existing post; document `postTemplate` choice in README.
- Add **spindle / coolant guard** language to post headers where the dialect might emit M-codes not universal on Grbl.
- Align **`dialect`** field in JSON with comments in the post template it references.

## Final reply format

End with a single line:

`Shipped: Posts/Machines — <file(s) or theme> — <what a machinist or integrator gains>.`
