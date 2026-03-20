# Keyboard shortcuts — Unified Fab Studio

Authoritative data for the **in-app** shortcut table lives in [`src/shared/app-keyboard-shortcuts.ts`](../src/shared/app-keyboard-shortcuts.ts). Update that file first, then adjust this doc if the narrative needs to change.

## Global

| Action | Windows / Linux | macOS | Notes |
|--------|-----------------|-------|--------|
| Toggle command palette | Ctrl+K | ⌘K | Search and run catalog entries |
| Open shortcuts reference | Ctrl+Shift+? | ⌘⇧? | Switches to **Utilities → Shortcuts**; ignored while focus is in a text field |

## Utilities workspace (tab strip)

When you switch **into Utilities** from Design, Assemble, or Manufacture, focus moves to the **selected** tab so you can use the keys below immediately.

When focus is on **Project / Settings / Slice / …** (only one tab is in the tab order at a time):

| Action | Keys |
|--------|------|
| Next / previous tab | ← / → or ↑ / ↓ |
| First / last tab | Home / End |

## Command palette (when open)

| Action | Keys |
|--------|------|
| Close | Esc |
| Move selection | ↑ / ↓ |
| Page through results | PgUp / PgDn |
| First / last result | Home / End |
| Run command | Enter |
| Cycle search, filters, result buttons | Tab (focus wraps inside the palette) |

## Design workspace

| Action | Keys | Notes |
|--------|------|--------|
| Cancel point-pick / constraint slot / 3D measure / section | Esc | Clears sketch constraint picks, linear dimension picks, **Measure** & **Section** under **3D preview** |

Further shortcuts should be added to `app-keyboard-shortcuts.ts` and surfaced in **Utilities → Shortcuts** so users discover them without reading the repo.
