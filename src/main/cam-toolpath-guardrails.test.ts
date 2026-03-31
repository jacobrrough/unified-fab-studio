import { describe, expect, it } from 'vitest'
import {
  applyCamToolpathGuardrails,
  clampStepoverMm,
  clampToolDiameterMm,
  CAM_GUARDRAIL_FEED_MIN_MM_MIN
} from './cam-toolpath-guardrails'
import type { CamJobConfig } from './cam-runner'

function minimalJob(over: Partial<CamJobConfig>): CamJobConfig {
  return {
    stlPath: '/tmp/x.stl',
    outputGcodePath: '/tmp/x.gcode',
    machine: {
      id: 'm',
      name: 'M',
      kind: 'cnc',
      workAreaMm: { x: 100, y: 100, z: 50 },
      maxFeedMmMin: 5000,
      postTemplate: 'cnc_generic_mm.hbs',
      dialect: 'grbl'
    },
    resourcesRoot: '/r',
    appRoot: '/a',
    zPassMm: -1,
    stepoverMm: 2,
    feedMmMin: 1000,
    plungeMmMin: 400,
    safeZMm: 5,
    pythonPath: 'python',
    ...over
  }
}

describe('clampToolDiameterMm', () => {
  it('clamps huge values', () => {
    const r = clampToolDiameterMm(9000, 6)
    expect(r.value).toBe(500)
    expect(r.note).toBeDefined()
  })
})

describe('clampStepoverMm', () => {
  it('caps stepover below tool diameter', () => {
    const r = clampStepoverMm(10, 6)
    expect(r.value).toBeLessThanOrEqual(6 * 0.98 + 1e-6)
  })
  it('raises tiny stepover relative to tool', () => {
    const r = clampStepoverMm(0.001, 10)
    expect(r.value).toBeGreaterThanOrEqual(0.01)
  })
})

describe('applyCamToolpathGuardrails', () => {
  it('raises sub-minimum feed', () => {
    const { job, notes } = applyCamToolpathGuardrails(minimalJob({ feedMmMin: 0.1 }))
    expect(job.feedMmMin).toBe(CAM_GUARDRAIL_FEED_MIN_MM_MIN)
    expect(notes.some((n) => n.includes('feed'))).toBe(true)
  })

  it('preserves sane jobs without notes', () => {
    const { job, notes } = applyCamToolpathGuardrails(minimalJob({}))
    expect(job.stepoverMm).toBe(2)
    expect(job.toolDiameterMm ?? 6).toBeLessThan(100)
    expect(notes.length).toBe(0)
  })
})
