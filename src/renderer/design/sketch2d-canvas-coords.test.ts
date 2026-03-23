import { describe, expect, it } from 'vitest'
import { distSqPointSegment, niceStepMm, screenToWorld, snap } from './sketch2d-canvas-coords'

describe('sketch2d-canvas-coords', () => {
  it('screenToWorld centers viewport', () => {
    const [wx, wy] = screenToWorld(100, 100, 200, 200, 2, 0, 0)
    expect(wx).toBeCloseTo(0, 5)
    expect(wy).toBeCloseTo(0, 5)
  })

  it('snap rounds to grid', () => {
    expect(snap(1.4, 1)).toBe(1)
    expect(snap(1.6, 1)).toBe(2)
  })

  it('niceStepMm picks readable step', () => {
    expect(niceStepMm(7)).toBe(10)
    expect(niceStepMm(0.15)).toBe(0.2)
  })

  it('distSqPointSegment is zero on segment', () => {
    expect(distSqPointSegment(5, 0, 0, 0, 10, 0)).toBe(0)
  })
})
