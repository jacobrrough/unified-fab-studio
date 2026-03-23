import { describe, expect, it } from 'vitest'
import type { ManufactureOperation } from './manufacture-schema'
import {
  CAM_CUT_DEFAULTS,
  resolveCamCutParams,
  resolveManufactureSetupForCam,
  resolvePencilStepoverMm
} from './cam-cut-params'

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

  it('applies same cut fields for OCL 3D kinds (adaptive / raster)', () => {
    const adaptive: ManufactureOperation = {
      id: '1',
      kind: 'cnc_adaptive',
      label: 'a',
      params: { zPassMm: -0.4, safeZMm: 12 }
    }
    const ra = resolveCamCutParams(adaptive)
    expect(ra.zPassMm).toBe(-0.4)
    expect(ra.safeZMm).toBe(12)
    const raster: ManufactureOperation = {
      id: '2',
      kind: 'cnc_raster',
      label: 'r',
      params: { zPassMm: 0.25 }
    }
    expect(resolveCamCutParams(raster).zPassMm).toBe(0.25)
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

describe('resolvePencilStepoverMm', () => {
  it('uses default factor 0.22 and clamps to tool diameter', () => {
    expect(resolvePencilStepoverMm({ baseStepoverMm: 2, toolDiameterMm: 6, operationParams: {} })).toBeCloseTo(0.44, 5)
    expect(resolvePencilStepoverMm({ baseStepoverMm: 100, toolDiameterMm: 6, operationParams: {} })).toBeCloseTo(2.94, 5)
  })

  it('respects pencilStepoverMm when set', () => {
    expect(
      resolvePencilStepoverMm({
        baseStepoverMm: 2,
        toolDiameterMm: 6,
        operationParams: { pencilStepoverMm: 0.3 }
      })
    ).toBe(0.3)
  })

  it('respects pencilStepoverFactor', () => {
    expect(
      resolvePencilStepoverMm({
        baseStepoverMm: 2,
        toolDiameterMm: 10,
        operationParams: { pencilStepoverFactor: 0.5 }
      })
    ).toBe(1)
  })
})

describe('resolveManufactureSetupForCam', () => {
  it('prefers setup matching CNC machine id', () => {
    const mfg = {
      setups: [
        { id: 'a', label: 'S1', machineId: 'm1' },
        { id: 'b', label: 'S2', machineId: 'm2' }
      ]
    }
    expect(resolveManufactureSetupForCam(mfg, 'm2')?.id).toBe('b')
  })

  it('falls back to first setup when no machine match', () => {
    const mfg = {
      setups: [
        { id: 'a', label: 'S1', machineId: 'm1' },
        { id: 'b', label: 'S2', machineId: 'm2' }
      ]
    }
    expect(resolveManufactureSetupForCam(mfg, 'unknown')?.id).toBe('a')
    expect(resolveManufactureSetupForCam(mfg, undefined)?.id).toBe('a')
  })
})
