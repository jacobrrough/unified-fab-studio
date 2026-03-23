import { describe, expect, it } from 'vitest'
import { buildHeightFieldFromCuttingSegments } from './cam-heightfield-2d5'
import type { ToolpathSegment3 } from './cam-gcode-toolpath'

describe('buildHeightFieldFromCuttingSegments', () => {
  it('lowers top Z under a simple feed line', () => {
    const segments: ToolpathSegment3[] = [
      { kind: 'rapid', x0: 0, y0: 0, z0: 5, x1: 0, y1: 0, z1: 5 },
      { kind: 'feed', x0: 0, y0: 0, z0: 5, x1: 0, y1: 0, z1: -2 },
      { kind: 'feed', x0: 0, y0: 0, z0: -2, x1: 10, y1: 0, z1: -2 }
    ]
    const h = buildHeightFieldFromCuttingSegments(segments, { toolRadiusMm: 1, maxCols: 32, maxRows: 16 })
    expect(h).not.toBeNull()
    if (!h) return
    expect(h.topZ.some((z) => z <= -2 + 1e-3)).toBe(true)
    expect(h.topZ.some((z) => z >= h.stockTopZ - 1e-3)).toBe(true)
  })

  it('returns null when no cutting feeds', () => {
    const segments: ToolpathSegment3[] = [{ kind: 'rapid', x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 5 }]
    expect(buildHeightFieldFromCuttingSegments(segments, { toolRadiusMm: 1 })).toBeNull()
  })
})
