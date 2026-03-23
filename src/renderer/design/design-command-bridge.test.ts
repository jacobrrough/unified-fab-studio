import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchDesignCommand } from './design-command-bridge'

describe('design-command-bridge', () => {
  const listeners = new Map<string, Set<EventListener>>()

  beforeEach(() => {
    listeners.clear()
    const win = {
      addEventListener: (ev: string, fn: EventListener) => {
        let set = listeners.get(ev)
        if (!set) {
          set = new Set()
          listeners.set(ev, set)
        }
        set.add(fn)
      },
      removeEventListener: (ev: string, fn: EventListener) => {
        listeners.get(ev)?.delete(fn)
      },
      dispatchEvent: (e: Event) => {
        const set = listeners.get(e.type)
        if (!set) return false
        for (const fn of set) fn(e)
        return true
      }
    }
    vi.stubGlobal('window', win as unknown as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dispatches ufs-design-command with commandId detail', () => {
    const handler = vi.fn()
    window.addEventListener('ufs-design-command', handler as EventListener)
    dispatchDesignCommand('sk_line')
    expect(handler).toHaveBeenCalled()
    const ev = handler.mock.calls[0]![0] as CustomEvent<{ commandId: string }>
    expect(ev.detail.commandId).toBe('sk_line')
  })
})
