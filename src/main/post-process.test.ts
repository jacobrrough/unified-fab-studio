import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MachineProfile } from '../shared/machine-schema'
import { renderPost } from './post-process'

const machine: MachineProfile = {
  id: 'test-mill',
  name: 'Test mill',
  kind: 'cnc',
  workAreaMm: { x: 200, y: 200, z: 100 },
  maxFeedMmMin: 5000,
  postTemplate: 'cnc_generic_mm.hbs',
  dialect: 'grbl'
}

describe('renderPost', () => {
  it('injects G54–G59 when workCoordinateIndex is set', async () => {
    const resourcesRoot = join(process.cwd(), 'resources')
    const g = await renderPost(resourcesRoot, machine, ['G0 X1 Y1'], { workCoordinateIndex: 2 })
    expect(g).toContain('G55')
    expect(g).toMatch(/Active work offset/)
  })

  it('omits WCS line when index absent', async () => {
    const resourcesRoot = join(process.cwd(), 'resources')
    const g = await renderPost(resourcesRoot, machine, ['G0 X1 Y1'])
    expect(g).not.toContain('Active work offset')
  })
})
