import { describe, expect, it } from 'vitest'
import type { ToolpathSegment3 } from './cam-gcode-toolpath'
import {
  compareToolpathToMachineEnvelope,
  computeToolpathBoundsFromSegments,
  formatMachineEnvelopeHintForPostedGcode,
  formatRotaryRadialHintForPostedGcode,
  maxRadialExtentYZFromSegments
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

describe('formatMachineEnvelopeHintForPostedGcode', () => {
  it('returns empty when within work volume', () => {
    const g = `G0 X0 Y0 Z5\nG1 X10 Y10 Z5 F1000`
    expect(formatMachineEnvelopeHintForPostedGcode(g, { x: 100, y: 100, z: 50 })).toBe('')
  })

  it('appends hint when X exceeds workAreaMm', () => {
    const g = `G0 X0 Y0 Z5\nG1 X150 Y10 Z5 F1000`
    const h = formatMachineEnvelopeHintForPostedGcode(g, { x: 100, y: 80, z: 50 })
    expect(h).toContain('Machine work volume warning')
    expect(h).toContain('X')
    expect(h).toContain('MACHINES')
  })
})

describe('rotary radial YZ hints', () => {
  it('maxRadialExtentYZFromSegments uses hypot on endpoints', () => {
    const segs = [{ kind: 'feed' as const, x0: 0, y0: 30, z0: 40, x1: 0, y1: 30, z1: 40 }]
    expect(maxRadialExtentYZFromSegments(segs)).toBeCloseTo(50, 5)
  })

  it('formatRotaryRadialHintForPostedGcode warns when YZ exceeds nominal radius', () => {
    const g = `G1 X0 Y30 Z40 F1000`
    const h = formatRotaryRadialHintForPostedGcode(g, 80)
    expect(h).toContain('Rotary radial')
    expect(h).toContain('MACHINES')
  })
})
