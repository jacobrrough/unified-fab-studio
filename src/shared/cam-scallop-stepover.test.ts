import { describe, expect, it } from 'vitest'
import { resolve3dFinishStepoverMm, stepoverFromScallopMm } from './cam-scallop-stepover'

describe('stepoverFromScallopMm', () => {
  it('increases stepover for larger scallop (6mm tool)', () => {
    const a = stepoverFromScallopMm(6, 0.01, 'ball')
    const b = stepoverFromScallopMm(6, 0.05, 'ball')
    expect(b).toBeGreaterThan(a)
  })

  it('caps near tool diameter', () => {
    const e = stepoverFromScallopMm(6, 5, 'ball')
    expect(e).toBeLessThanOrEqual(6 * 0.95 + 1e-6)
  })
})

describe('resolve3dFinishStepoverMm', () => {
  it('prefers finishStepoverMm when positive', () => {
    const r = resolve3dFinishStepoverMm({
      toolDiameterMm: 6,
      baseStepoverMm: 2,
      operationParams: { finishStepoverMm: 0.4, finishScallopMm: 0.01 }
    })
    expect(r.stepoverMm).toBe(0.4)
    expect(r.source).toBe('finishStepoverMm')
  })

  it('uses scallop when finish stepover absent', () => {
    const r = resolve3dFinishStepoverMm({
      toolDiameterMm: 6,
      baseStepoverMm: 2,
      operationParams: { finishScallopMm: 0.02 }
    })
    expect(r.source).toBe('finishScallopMm')
    expect(r.stepoverMm).toBeGreaterThan(0)
    expect(r.stepoverMm).toBeLessThan(2)
  })

  it('falls back to base stepover', () => {
    const r = resolve3dFinishStepoverMm({
      toolDiameterMm: 6,
      baseStepoverMm: 1.2,
      operationParams: {}
    })
    expect(r.source).toBe('stepoverMm')
    expect(r.stepoverMm).toBe(1.2)
  })
})
