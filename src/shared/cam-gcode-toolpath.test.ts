import { describe, expect, it } from 'vitest'
import { extractToolpathSegmentsFromGcode } from './cam-gcode-toolpath'

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
