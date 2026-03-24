import { describe, expect, it } from 'vitest'
import { evaluateManufactureReadiness } from './manufacture-readiness'
import type { ManufactureFile } from './manufacture-schema'
import type { ProjectFile } from './project-schema'

function mkProject(): ProjectFile {
  return {
    version: 1,
    name: 'T',
    updatedAt: new Date().toISOString(),
    activeMachineId: 'm1',
    meshes: ['assets/a.stl'],
    importHistory: []
  }
}

function mkMfg(kind: 'cnc_parallel' | 'fdm_slice'): ManufactureFile {
  return {
    version: 1,
    setups: [],
    operations: [{ id: 'o1', label: 'Op', kind, suppressed: false }]
  }
}

describe('evaluateManufactureReadiness', () => {
  it('reports slice/cam readiness when requirements are met', () => {
    const r = evaluateManufactureReadiness({
      project: mkProject(),
      settings: { recentProjectPaths: [], theme: 'dark', curaEnginePath: 'cura.exe' },
      machines: [
        {
          id: 'm1',
          name: 'CNC',
          kind: 'cnc',
          workAreaMm: { x: 1, y: 1, z: 1 },
          maxFeedMmMin: 1,
          postTemplate: 'a',
          dialect: 'grbl'
        }
      ],
      manufacture: mkMfg('cnc_parallel')
    })
    expect(r.canSlice).toBe(true)
    expect(r.canCam).toBe(true)
  })

  it('blocks cam when first operation is non-cnc', () => {
    const r = evaluateManufactureReadiness({
      project: mkProject(),
      settings: { recentProjectPaths: [], theme: 'dark', curaEnginePath: 'cura.exe' },
      machines: [
        {
          id: 'm1',
          name: 'CNC',
          kind: 'cnc',
          workAreaMm: { x: 1, y: 1, z: 1 },
          maxFeedMmMin: 1,
          postTemplate: 'a',
          dialect: 'grbl'
        }
      ],
      manufacture: mkMfg('fdm_slice')
    })
    expect(r.canCam).toBe(false)
    expect(r.issues.some((i) => i.id === 'cam_non_cnc_first_op')).toBe(true)
  })
})
