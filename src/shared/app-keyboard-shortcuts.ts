/**
 * App-level keyboard shortcuts (shell / palette / cross-workspace).
 * Keep in sync with `docs/KEYBOARD_SHORTCUTS.md` narrative; this file is the source for the in-app table.
 */

export type AppShortcutGroup = {
  id: string
  title: string
  rows: { action: string; keysWin: string; keysMac: string; context?: string }[]
}

export const APP_KEYBOARD_SHORTCUT_GROUPS: AppShortcutGroup[] = [
  {
    id: 'global',
    title: 'Global',
    rows: [
      {
        action: 'Command palette — search / run catalog entries',
        keysWin: 'Ctrl+K',
        keysMac: '⌘K',
        context: 'Toggle open/closed'
      },
      {
        action: 'Keyboard shortcuts (this reference)',
        keysWin: 'Ctrl+Shift+?',
        keysMac: '⌘⇧?',
        context: 'Opens shortcuts dialog; ignored while focus is in a text field'
      }
    ]
  },
  {
    id: 'palette',
    title: 'While command palette is open',
    rows: [
      { action: 'Close palette', keysWin: 'Esc', keysMac: 'Esc' },
      { action: 'Move selection', keysWin: '↑ / ↓', keysMac: '↑ / ↓' },
      { action: 'Page through results', keysWin: 'PgUp / PgDn', keysMac: 'PgUp / PgDn' },
      { action: 'Jump to first / last result', keysWin: 'Home / End', keysMac: 'Home / End' },
      { action: 'Run highlighted command', keysWin: 'Enter', keysMac: 'Return' },
      {
        action: 'Move focus between search, filters, and results',
        keysWin: 'Tab',
        keysMac: 'Tab',
        context: 'Focus wraps inside the palette'
      }
    ]
  },
  {
    id: 'file_tabs',
    title: 'File workspace (tab strip)',
    rows: [
      {
        action: 'Next / previous tab',
        keysWin: '← / → or ↑ / ↓',
        keysMac: '← / → or ↑ / ↓',
        context: 'When a File tab is focused (Project, Settings)'
      },
      {
        action: 'First / last tab',
        keysWin: 'Home / End',
        keysMac: 'Home / End',
        context: 'File tab strip'
      }
    ]
  },
  {
    id: 'manufacture_tabs',
    title: 'Manufacture workspace (tab strip)',
    rows: [
      {
        action: 'Next / previous tab',
        keysWin: '← / → or ↑ / ↓',
        keysMac: '← / → or ↑ / ↓',
        context: 'When a Manufacture tab is focused (Plan, Slice, CAM, Tools)'
      },
      {
        action: 'First / last tab',
        keysWin: 'Home / End',
        keysMac: 'Home / End',
        context: 'Manufacture tab strip'
      }
    ]
  },
  {
    id: 'design',
    title: 'Design workspace',
    rows: [
      {
        action: 'Cancel constraint / pick point mode',
        keysWin: 'Esc',
        keysMac: 'Esc',
        context: 'After clicking a point/segment slot in the ribbon'
      },
      {
        action: 'Clear 3D Measure / Section picks',
        keysWin: 'Esc',
        keysMac: 'Esc',
        context: 'When Measure or Section is active under 3D preview'
      }
    ]
  }
]

export function isTypableKeyboardTarget(el: EventTarget | null): boolean {
  if (el == null || typeof HTMLElement === 'undefined') return false
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Heuristic for showing ⌘ vs Ctrl in UI copy (renderer / Electron). */
export function isLikelyApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const p = navigator.platform ?? ''
  const ua = navigator.userAgent ?? ''
  return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X/i.test(ua)
}

/** User-visible palette shortcut label (matches `APP_KEYBOARD_SHORTCUT_GROUPS` global rows). */
export function commandPaletteShortcutLabel(): 'Ctrl+K' | '⌘K' {
  return isLikelyApplePlatform() ? '⌘K' : 'Ctrl+K'
}

/** Toggle command palette (Ctrl+K / ⌘K). */
export function matchesCommandPaletteToggle(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'
}

/** Open keyboard shortcuts reference (Ctrl+Shift+? / ⌘⇧?). */
export function matchesKeyboardShortcutsReference(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key === '?'
}
