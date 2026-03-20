import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Channels used by preload `ipcRenderer.invoke(...)`. */
function extractPreloadInvokeChannels(src: string): Set<string> {
  const set = new Set<string>()
  const re = /ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    set.add(m[1]!)
  }
  return set
}

/** Channels registered in main `ipcMain.handle(...)`. */
function extractMainHandleChannels(src: string): Set<string> {
  const set = new Set<string>()
  const re = /ipcMain\.handle\s*\(\s*[\s\n\r]*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    set.add(m[1]!)
  }
  return set
}

describe('IPC contract (preload → main)', () => {
  it('every preload invoke has a matching ipcMain.handle channel', () => {
    const root = process.cwd()
    const preloadSrc = readFileSync(join(root, 'src/preload/index.ts'), 'utf-8')
    const mainSrc = readFileSync(join(root, 'src/main/index.ts'), 'utf-8')
    const fromPreload = extractPreloadInvokeChannels(preloadSrc)
    const fromMain = extractMainHandleChannels(mainSrc)
    const missing = [...fromPreload].filter((ch) => !fromMain.has(ch))
    expect(missing, `Missing ipcMain.handle for: ${missing.join(', ')}`).toEqual([])
  })
})
