import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyDrawingFile } from '../shared/drawing-sheet-schema'
import { loadDrawingFile, saveDrawingFile } from './drawing-file-store'

describe('drawing-file-store', () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('returns empty when file missing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ufs-drawing-'))
    const f = await loadDrawingFile(dir)
    expect(f).toEqual(emptyDrawingFile())
  })

  it('round-trips drawing.json', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ufs-drawing-'))
    const file = {
      version: 1 as const,
      sheets: [{ id: 's1', name: 'Sheet A', scale: '1:1' }]
    }
    await saveDrawingFile(dir, file)
    const again = await loadDrawingFile(dir)
    expect(again).toEqual(file)
    const raw = await readFile(join(dir, 'drawing', 'drawing.json'), 'utf-8')
    expect(raw).toContain('Sheet A')
  })
})
