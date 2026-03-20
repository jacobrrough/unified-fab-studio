import { describe, expect, it } from 'vitest'
import type { ManufactureOperation } from './manufacture-schema'
import { CAM_CUT_DEFAULTS, resolveCamCutParams } from './cam-cut-params'

describe('resolveCamCutParams', () => {
  it('uses defaults without op or params', () => {
    expect(resolveCamCutParams(undefined)).toEqual({ ...CAM_CUT_DEFAULTS })
    const op: ManufactureOperation = { id: '1', kind: 'cnc_parallel', label: 'x' }
    expect(resolveCamCutParams(op)).toEqual({ ...CAM_CUT_DEFAULTS })
  })

  it('merges partial params', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_waterline',
      label: 'x',
      params: { feedMmMin: 800, stepoverMm: 1.5 }
    }
    const r = resolveCamCutParams(op)
    expect(r.feedMmMin).toBe(800)
    expect(r.stepoverMm).toBe(1.5)
    expect(r.zPassMm).toBe(CAM_CUT_DEFAULTS.zPassMm)
    expect(r.plungeMmMin).toBe(CAM_CUT_DEFAULTS.plungeMmMin)
    expect(r.safeZMm).toBe(CAM_CUT_DEFAULTS.safeZMm)
  })

  it('allows negative zPassMm (work plane / depth convention)', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { zPassMm: -2 }
    }
    expect(resolveCamCutParams(op).zPassMm).toBe(-2)
  })

  it('rejects non-positive stepover and falls back', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { stepoverMm: 0 }
    }
    expect(resolveCamCutParams(op).stepoverMm).toBe(CAM_CUT_DEFAULTS.stepoverMm)
  })

  it('accepts numeric strings from loose JSON', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { safeZMm: '15' }
    }
    expect(resolveCamCutParams(op).safeZMm).toBe(15)
  })

  it('rejects zPassMm zero', () => {
    const op: ManufactureOperation = {
      id: '1',
      kind: 'cnc_parallel',
      label: 'x',
      params: { zPassMm: 0 }
    }
    expect(resolveCamCutParams(op).zPassMm).toBe(CAM_CUT_DEFAULTS.zPassMm)
  })
})
