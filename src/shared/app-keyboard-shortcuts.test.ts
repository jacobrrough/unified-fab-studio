import { describe, expect, it } from 'vitest'
import {
  APP_KEYBOARD_SHORTCUT_GROUPS,
  commandPaletteShortcutLabel,
  isTypableKeyboardTarget,
  matchesCommandPaletteToggle,
  matchesKeyboardShortcutsReference
} from './app-keyboard-shortcuts'

describe('app-keyboard-shortcuts', () => {
  it('defines non-empty groups', () => {
    expect(APP_KEYBOARD_SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(3)
    for (const g of APP_KEYBOARD_SHORTCUT_GROUPS) {
      expect(g.rows.length).toBeGreaterThan(0)
    }
  })

  it('matchesCommandPaletteToggle', () => {
    expect(matchesCommandPaletteToggle({ ctrlKey: true, shiftKey: false, altKey: false, key: 'k' } as KeyboardEvent)).toBe(
      true
    )
    expect(matchesCommandPaletteToggle({ metaKey: true, shiftKey: false, altKey: false, key: 'K' } as KeyboardEvent)).toBe(
      true
    )
    expect(matchesCommandPaletteToggle({ ctrlKey: true, shiftKey: true, altKey: false, key: 'k' } as KeyboardEvent)).toBe(
      false
    )
    expect(matchesCommandPaletteToggle({ ctrlKey: true, shiftKey: false, altKey: false, key: 'j' } as KeyboardEvent)).toBe(
      false
    )
  })

  it('matchesKeyboardShortcutsReference', () => {
    expect(
      matchesKeyboardShortcutsReference({ ctrlKey: true, shiftKey: true, altKey: false, key: '?' } as KeyboardEvent)
    ).toBe(true)
    expect(
      matchesKeyboardShortcutsReference({ metaKey: true, shiftKey: true, altKey: false, key: '?' } as KeyboardEvent)
    ).toBe(true)
    expect(
      matchesKeyboardShortcutsReference({ ctrlKey: true, shiftKey: false, altKey: false, key: '?' } as KeyboardEvent)
    ).toBe(false)
  })

  it('isTypableKeyboardTarget rejects non-elements', () => {
    expect(isTypableKeyboardTarget(null)).toBe(false)
    expect(isTypableKeyboardTarget({} as EventTarget)).toBe(false)
  })

  it('commandPaletteShortcutLabel matches platform copy', () => {
    const s = commandPaletteShortcutLabel()
    expect(s === 'Ctrl+K' || s === '⌘K').toBe(true)
  })
})
