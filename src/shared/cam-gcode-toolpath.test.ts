import { describe, expect, it } from 'vitest'
import {
  apply4AxisRadialZToMillPreviewSegments,
  buildContiguousPathChains,
  buildToolpathLengthSampler,
  extractToolpathSegmentsFromGcode,
  resolve4AxisCylinderDiameterMm,
  totalToolpathLengthMm
} from './cam-gcode-toolpath'

describe('extractToolpathSegmentsFromGcode', () => {
  it('tracks modal XYZ on G0/G1', () => {
    const g = ['G0 Z5', 'G0 X1 Y2', 'G1 Z-1 F200', 'G1 X10'].join('\n')
    const s = extractToolpathSegmentsFromGcode(g)
    expect(s.length).toBe(4)
    expect(s[0]!.kind).toBe('rapid')
    expect(s[2]!.z1).toBe(-1)
    expect(s[3]!.x1).toBe(10)
    expect(s[3]!.y1).toBe(2)
    expect(s[3]!.z1).toBe(-1)
  })

  it('ignores comments-only and drill cycles', () => {
    const g = ['; comment', 'G81 X1 Y2 Z-3 R2', 'G0 X0 Y0'].join('\n')
    const s = extractToolpathSegmentsFromGcode(g)
    expect(s.length).toBe(1)
    expect(s[0]!.kind).toBe('rapid')
  })
})

describe('buildContiguousPathChains', () => {
  it('merges continuous feed moves into one chain', () => {
    const g = ['G0 Z5', 'G1 Z0 F200', 'G1 X1 Y0'].join('\n')
    const segs = extractToolpathSegmentsFromGcode(g)
    const chains = buildContiguousPathChains(segs)
    expect(chains.length).toBe(2)
    const feed = chains.find((c) => c.kind === 'feed')
    expect(feed?.points.length).toBe(3)
    expect(feed?.points[0]).toEqual({ x: 0, y: 0, z: 5 })
    expect(feed?.points[2]).toEqual({ x: 1, y: 0, z: 0 })
  })

  it('starts a new chain on kind change', () => {
    const g = ['G0 X0 Y0 Z5', 'G1 X1 Y0 Z0'].join('\n')
    const segs = extractToolpathSegmentsFromGcode(g)
    const chains = buildContiguousPathChains(segs)
    expect(chains.length).toBe(2)
  })
})

describe('buildToolpathLengthSampler', () => {
  it('interpolates along segment lengths', () => {
    const g = ['G0 X0 Y0 Z0', 'G1 X3 Y4 Z0 F200'].join('\n')
    const segs = extractToolpathSegmentsFromGcode(g)
    expect(totalToolpathLengthMm(segs)).toBeCloseTo(5, 5)
    const s = buildToolpathLengthSampler(segs)
    expect(s.totalMm).toBeCloseTo(5, 5)
    const mid = s.atUnit(0.5)
    expect(mid.x).toBeCloseTo(1.5, 5)
    expect(mid.y).toBeCloseTo(2, 5)
    expect(mid.z).toBeCloseTo(0, 5)
    const end = s.atUnit(1)
    expect(end.x).toBe(3)
    expect(end.y).toBe(4)
  })

  it('handles empty segments', () => {
    const s = buildToolpathLengthSampler([])
    expect(s.totalMm).toBe(0)
    expect(s.atUnit(0.5)).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('apply4AxisRadialZToMillPreviewSegments', () => {
  it('subtracts radius so cut_z = R + z_pass maps to z_pass (mill-style)', () => {
    const D = 50
    const R = D / 2
    const zPass = -1
    const cutZ = R + zPass
    const g = `G1 Z${cutZ.toFixed(3)} F300`
    const raw = extractToolpathSegmentsFromGcode(g)
    const adj = apply4AxisRadialZToMillPreviewSegments(raw, D)
    expect(adj.length).toBe(1)
    expect(adj[0]!.z1).toBeCloseTo(zPass, 5)
    expect(adj[0]!.z0).toBeCloseTo(-R, 5)
  })

  it('resolve4AxisCylinderDiameterMm reads params or defaults to 50', () => {
    expect(resolve4AxisCylinderDiameterMm(undefined)).toBe(50)
    expect(resolve4AxisCylinderDiameterMm({})).toBe(50)
    expect(resolve4AxisCylinderDiameterMm({ cylinderDiameterMm: 40 })).toBe(40)
    expect(resolve4AxisCylinderDiameterMm({ cylinderDiameterMm: -1 })).toBe(50)
  })
})
