# Keyboard shortcuts — Unified Fab Studio

Authoritative data for the **in-app** shortcut table lives in [`src/shared/app-keyboard-shortcuts.ts`](../src/shared/app-keyboard-shortcuts.ts). Update that file first, then adjust this doc if the narrative needs to change.

## Global

| Action | Windows / Linux | macOS | Notes |
|--------|-----------------|-------|--------|
| Toggle command palette | Ctrl+K | ⌘K | Search and run catalog entries |
| Open shortcuts reference | Ctrl+Shift+? | ⌘⇧? | Opens a **shortcuts** dialog; ignored while focus is in a text field |

## File workspace (tab strip)

When you switch **into File** from Design, Assemble, or Manufacture, focus moves to the **selected** tab so you can use the keys below immediately.

When focus is on **Project** or **Settings** (only one tab is in the tab order at a time):

| Action | Keys |
|--------|------|
| Next / previous tab | ← / → or ↑ / ↓ |
| First / last tab | Home / End |

## Manufacture workspace (tab strip)

**Plan**, **Slice**, **CAM**, and **Tools** share the same arrow / Home / End behavior as File.

## Command palette (when open)

Same rows as **While command palette is open** in [`app-keyboard-shortcuts.ts`](../src/shared/app-keyboard-shortcuts.ts) (also listed in the shortcuts dialog).

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
| Cancel point-pick / constraint slot | Esc | After clicking a point/segment slot in the ribbon |
| Clear **Measure** / **Section** (3D preview) | Esc | When Measure or Section is active under **3D preview** |

Further shortcuts should be added to `app-keyboard-shortcuts.ts` and surfaced in the **shortcuts dialog** (Ctrl+Shift+? / ⌘⇧?) so users discover them without reading the repo.
