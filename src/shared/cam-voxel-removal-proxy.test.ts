import { describe, expect, it } from 'vitest'
import type { ToolpathSegment3 } from './cam-gcode-toolpath'
import { buildVoxelRemovalFromCuttingSegments } from './cam-voxel-removal-proxy'

describe('buildVoxelRemovalFromCuttingSegments', () => {
  it('returns null when no cutting feeds', () => {
    const segs: ToolpathSegment3[] = [{ kind: 'feed', x0: 0, y0: 0, z0: 1, x1: 1, y1: 0, z1: 1 }]
    expect(buildVoxelRemovalFromCuttingSegments(segs, { toolRadiusMm: 1 })).toBeNull()
  })

  it('carves along a shallow feed move', () => {
    const segs: ToolpathSegment3[] = [{ kind: 'feed', x0: 0, y0: 0, z0: 0, x1: 4, y1: 0, z1: -0.5 }]
    const v = buildVoxelRemovalFromCuttingSegments(segs, {
      toolRadiusMm: 0.8,
      maxCols: 24,
      maxRows: 24,
      maxLayers: 16,
      maxStamps: 5000
    })
    expect(v).not.toBeNull()
    if (!v) return
    expect(v.carvedVoxelCount).toBeGreaterThan(0)
    expect(v.approxRemovedVolumeMm3).toBeGreaterThan(0)
    expect(v.samplePositions.length % 3).toBe(0)
  })
})
