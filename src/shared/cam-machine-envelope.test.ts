import { describe, expect, it } from 'vitest'
import type { ToolpathSegment3 } from './cam-gcode-toolpath'
import {
  compareToolpathToMachineEnvelope,
  computeToolpathBoundsFromSegments
} from './cam-machine-envelope'

const box = { x: 100, y: 80, z: 50 }

describe('computeToolpathBoundsFromSegments', () => {
  it('returns null for empty segments', () => {
    expect(computeToolpathBoundsFromSegments([])).toBeNull()
  })

  it('bounds all endpoints', () => {
    const segs: ToolpathSegment3[] = [
      { kind: 'rapid', x0: 0, y0: 0, z0: 0, x1: 10, y1: 5, z1: -2 },
      { kind: 'feed', x0: 10, y0: 5, z0: -2, x1: 10, y1: 5, z1: -5 }
    ]
    expect(computeToolpathBoundsFromSegments(segs)).toEqual({
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 5,
      minZ: -5,
      maxZ: 0
    })
  })
})

describe('compareToolpathToMachineEnvelope', () => {
  it('is within when path stays in box', () => {
    const segs: ToolpathSegment3[] = [
      { kind: 'rapid', x0: 0, y0: 0, z0: 10, x1: 50, y1: 40, z1: 10 }
    ]
    const r = compareToolpathToMachineEnvelope(segs, box)
    expect(r.withinEnvelope).toBe(true)
    expect(r.violations).toHaveLength(0)
    expect(r.bounds?.maxX).toBe(50)
  })

  it('flags X above max', () => {
    const segs: ToolpathSegment3[] = [
      { kind: 'rapid', x0: 0, y0: 0, z0: 0, x1: 120, y1: 10, z1: 10 }
    ]
    const r = compareToolpathToMachineEnvelope(segs, box)
    expect(r.withinEnvelope).toBe(false)
    expect(r.violations.some((v) => v.axis === 'x' && v.kind === 'above_max')).toBe(true)
    expect(r.violations.find((v) => v.axis === 'x' && v.kind === 'above_max')?.excessMm).toBeCloseTo(20)
  })

  it('flags negative Y', () => {
    const segs: ToolpathSegment3[] = [
      { kind: 'rapid', x0: 10, y0: 0, z0: 5, x1: 10, y1: -3, z1: 5 }
    ]
    const r = compareToolpathToMachineEnvelope(segs, box)
    expect(r.withinEnvelope).toBe(false)
    expect(r.violations.some((v) => v.axis === 'y' && v.kind === 'below_min')).toBe(true)
  })
})
