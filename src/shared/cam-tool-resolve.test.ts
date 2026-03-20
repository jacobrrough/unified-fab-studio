import { describe, expect, it } from 'vitest'
import type { ManufactureOperation } from './manufacture-schema'
import type { ToolLibraryFile } from './tool-schema'
import { resolveCamToolDiameterMm } from './cam-tool-resolve'

const lib: ToolLibraryFile = {
  version: 1,
  tools: [
    { id: 'a', name: 'Probe', type: 'other', diameterMm: 6 },
    { id: 'b', name: 'EM 3', type: 'endmill', diameterMm: 3.175 },
    { id: 'c', name: 'Ball 6', type: 'ball', diameterMm: 6 }
  ]
}

describe('resolveCamToolDiameterMm', () => {
  it('uses explicit toolDiameterMm', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_waterline',
      label: 'x',
      params: { toolDiameterMm: 8 }
    }
    expect(resolveCamToolDiameterMm({ operation: op, tools: lib })).toBe(8)
  })

  it('resolves toolId from library', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { toolId: 'b' }
    }
    expect(resolveCamToolDiameterMm({ operation: op, tools: lib })).toBe(3.175)
  })

  it('prefers toolDiameterMm over toolId', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { toolId: 'b', toolDiameterMm: 10 }
    }
    expect(resolveCamToolDiameterMm({ operation: op, tools: lib })).toBe(10)
  })

  it('falls back to first tool by type priority (endmill before other)', () => {
    const op: ManufactureOperation = { id: '1', kind: 'cnc_parallel', label: 'x' }
    expect(resolveCamToolDiameterMm({ operation: op, tools: lib })).toBe(3.175)
  })

  it('returns undefined without library or params', () => {
    const op: ManufactureOperation = { id: '1', kind: 'cnc_parallel', label: 'x' }
    expect(resolveCamToolDiameterMm({ operation: op, tools: null })).toBeUndefined()
  })
})
