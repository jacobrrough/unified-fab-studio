# Agent brief — Stream Q: Utilities workspace UI (renderer)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **Q** (Utilities UI). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Role:** Improve the **Utilities** workspace only — the tabbed area for **Project**, **Settings**, **Slice**, **CAM**, **Tools**, **Commands**, and **Shortcuts** — without changing IPC contracts, shared schemas, or other workspaces’ internals.

## Mission

Ship **clearer copy**, **layout**, and **accessibility** so users can open projects, configure paths, run slice/CAM helpers, manage tool libraries, and discover commands — with honest **unverified output** tone for G-code and slicer results (match [`../MACHINES.md`](../MACHINES.md)).

## Primary paths

| In scope | Notes |
|----------|--------|
| `src/renderer/utilities/**` | Main surface: `UtilitiesWorkspacePanels.tsx`, `DrawingManifestPanel.tsx`, related components |
| `src/renderer/shell/AppShell.tsx` | Utilities **tab strip** only (`utility-strip`, `UtilityTab` keyboard nav) when tab UX/a11y needs it |
| `src/renderer/src/styles.css` | Scoped rules for utilities panels (e.g. `.workspace-util-panel`, `.utility-strip`) |
| `src/renderer/commands/CommandCatalogPanel.tsx`, `KeyboardShortcutsPanel.tsx` | Only when the change is **Utilities → Commands / Shortcuts** presentation (prefer small diffs; coordinate if another stream owns the palette globally) |

## Hot file rule

**`src/renderer/src/App.tsx`** — at most **one** agent should make substantive edits per sprint. Prefer passing data through existing `UtilitiesWorkspacePanels` props. **≤25 lines** in `App.tsx` per batch unless you extracted a new module under `src/renderer/utilities/` first (see aggressive coordinator in [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md)).

## Hard rules

| Allowed | Forbidden |
|---------|-----------|
| Copy, headings, `aria-*`, focus order, fieldset/labels, loading/empty states | New `ipcMain.handle` / preload APIs — use **Stream S** |
| Refactors **inside** `utilities/*` and minimal `AppShell` tab strip | `design-schema`, sketch solver, kernel payload, `engines/*` |
| Bugfixes **confirmed** in Utilities (repro steps) | Manufacture tab internals, assembly mesh IPC — **Streams D / C** |
| Honest safety/disclaimer text per **MACHINES.md** | Implying G-code or toolpaths are safe without user verification |

## Canonical behavior (spot-check before claiming)

| Need | Where |
|------|--------|
| What the Utilities tabs render | `UtilitiesWorkspacePanels.tsx` |
| Tab list semantics | `AppShell.tsx` (`role="tablist"`, tab `id`s, `aria-controls` / `utility-workspace-panel`) |
| Commands catalog source of truth | `src/shared/fusion-style-command-catalog.ts` (coordinate **Stream E** if changing status rows) |

## Pasteables

- Standard prompt: [`PARALLEL_PASTABLES.md`](PARALLEL_PASTABLES.md) → **Stream Q — Renderer `utilities` workspace UI only**
- Merge-ready: same file → **Aggressive — Stream Q (utilities UI)**

## When to run `npm test` / `npm run build`

From **`unified-fab-studio/`**:

- **`npm test`** — always before claiming done for code changes.
- **`npm run build`** — required for **Aggressive — Stream Q** and before merge to main when your team uses the aggressive gate.

## Overlap with other streams

| Stream | Relationship |
|--------|----------------|
| **E** (product / shell) | **E** owns broad shell/command palette; **Q** owns Utilities panels and tab strip. Avoid two chats editing **`App.tsx`** in the same batch. |
| **D** | CAM/slice **logic** and manufacture UI stay **D**; **Q** may adjust Utilities tab copy and layout only. |
| **L** | Slicer **resources** under `resources/slicer/` — **L**; **Q** may link or describe paths in UI copy. |
| **G** | Docs-only; **Q** does not replace **G** for troubleshooting prose in `docs/`. |
| **R** | **Mesh import**, **tool library import**, and **`importHistory`** semantics — **R** owns main-process behavior and import-scoped Utilities rows; **Q** owns generic Utilities layout — coordinate if both touch `UtilitiesWorkspacePanels.tsx` in one batch ([`STREAM-R-import-mesh-tools.md`](STREAM-R-import-mesh-tools.md)). |

## Success criteria (one slice per chat)

One shipped artifact, for example: clearer **Settings** headings, **Slice/CAM** intro blocks, **Tools** import hints, **tablist**/`tabpanel` a11y fixes, or **Project** empty state — with **tests + build** green and a single **`Shipped:`** line in the agent reply.
