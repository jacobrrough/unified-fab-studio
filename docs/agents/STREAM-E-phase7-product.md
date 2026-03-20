# Agent brief — Stream E: Phase 7 (Product polish)

## Parity queue

**This stream’s done vs next:** [`ALL_STREAMS_AGENT_PLANS.md`](ALL_STREAMS_AGENT_PLANS.md) — *Stream status & todos* → row **E** (product / shell). Canonical phases: [`PARITY_PHASES.md`](../PARITY_PHASES.md).

**Status:** Phase **7 baseline** is **complete** ([`PARITY_PHASES.md`](../PARITY_PHASES.md)); use this brief for **stretch** UX (drawing pipeline, inspect tools, i18n) or shell maintenance.

## Mission
Improve **discoverability and UX**: command palette, keyboard shortcuts, drawing export stubs, parameter UI at app level, saved layout — **without** owning core geometry math.

## Hard rules
- Prefer **`src/renderer/shell/*`**, **`src/renderer/commands/*`**, **`src/shared/fusion-style-command-catalog.ts`**, **`styles.css`**.
- Add **new components** instead of monolithic **`App.tsx`** refactors; export a single wrapper from `App.tsx` if needed.
- Do **not** implement heavy CAD kernels here; **link** catalog entries to existing ribbons or show “use Design workspace”.
- Run **`npm test`** + **`npx electron-vite build`**.

## Suggested order
1. Global command palette (search `FUSION_STYLE_COMMAND_CATALOG`, filter by `implemented`).
2. Optional: localStorage for panel widths / workspace memory (align with product rules if this app adopts them).
3. Docs: keep **`docs/PARITY_PHASES.md`** accurate; if catalog or UI claims change **kernel / CAM / assembly** behavior, cross-check **[`../VERIFICATION.md`](../VERIFICATION.md)**.

## Recent slices (examples)
- **Drawing manifest** — `src/renderer/utilities/DrawingManifestPanel.tsx`: per-slot **editable** view-placeholder labels, fieldset grouping, **`aria-live`** announcements on add/remove/clear; shared helper **`replaceViewPlaceholderLabel`** in `drawing-sheet-schema.ts` + Vitest.
- **Palette empty state** — `CommandPalette.tsx` + `styles.css`: copy that nudges users to widen filters when search returns nothing.
- **Commands tab** — `CommandCatalogPanel.tsx`: same idea when **filters** yield zero rows; stable **`useId`** on search + stats paragraph (`aria-describedby`); styles in `styles.css`.
- **Shell a11y** — `WorkspaceBar`: **`aria-current="page"`** on active workspace; `ShellStatusFooter`: landmark label, **`aria-live="polite"`** status region, dismiss **`aria-label`**; `KeyboardShortcutsPanel`: **`<caption class="sr-only">`** on each shortcut table; `AppShell`: Properties toggle **`aria-expanded`**; `styles.css`: **`.app-status-live`** flex alignment (replaces direct `.app-status-text` flex when hint + status both show).
- **Palette paging** — `CommandPalette`: **Page Up / Page Down** jump ~8 rows; footer hint text updated; **`DrawingExportRibbon`**: **`aria-busy`** while export buttons are disabled (in progress).
- **Utilities tabs** — `AppShell`: **Arrow / Home / End** on the tab strip with **roving `tabIndex`** (only the selected tab is in sequential focus order); **auto-focus** selected tab when switching **into** Utilities from another workspace.
- **Commands reset** — `CommandCatalogPanel`: **Reset filters** button in the empty state (clears search + dropdowns, optional status toast).
- **Landmarks / outline** — `AppShell`: primary canvas is **`<main id="app-main">`** with **`aria-label="Workspace"`**; `ShellResizeHandle`: **`aria-orientation="vertical"`**; `PropertiesPanel`: section titles are **`<h2 className="properties-head">`**; `BrowserPanel`: **empty / loading** lines use **`role="status"`** ( **`aria-live="polite"`** on “Loading…”).

## Success criteria (pick a slice per PR)
- One **user-visible** polish feature (palette, shortcut, or persisted UI state) with no regression in existing tabs.

## Parallel note
Safe alongside **A, C, D**. If **`AppShell`** changes, notify other streams touching shell props.

**Stream N** may edit **`styles.css`** for **`.design-3d*`** / design viewport layout — coordinate if **E** is doing a broad **`styles.css`** theme pass on the same sections in one batch.
