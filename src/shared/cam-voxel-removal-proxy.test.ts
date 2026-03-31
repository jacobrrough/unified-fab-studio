import { describe, expect, it } from 'vitest'
import type { ToolpathSegment3 } from './cam-gcode-toolpath'
import {
  buildVoxelRemovalFromCuttingSegments,
  VOXEL_SIM_QUALITY_PRESETS
} from './cam-voxel-removal-proxy'

describe('VOXEL_SIM_QUALITY_PRESETS', () => {
  it('defines fast, balanced, and detailed budgets', () => {
    expect(VOXEL_SIM_QUALITY_PRESETS.fast.maxStamps).toBeLessThan(VOXEL_SIM_QUALITY_PRESETS.detailed.maxStamps!)
    expect(VOXEL_SIM_QUALITY_PRESETS.balanced.maxCols).toBeGreaterThan(0)
    const { fast, balanced, detailed } = VOXEL_SIM_QUALITY_PRESETS
    expect(fast.maxCols).toBeLessThanOrEqual(balanced.maxCols!)
    expect(balanced.maxCols).toBeLessThanOrEqual(detailed.maxCols!)
    expect(fast.maxLayers).toBeLessThanOrEqual(balanced.maxLayers!)
    expect(balanced.maxLayers).toBeLessThanOrEqual(detailed.maxLayers!)
  })
})

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

  it('extends nominal stock downward when stockBottomZ is set', () => {
    const segs: ToolpathSegment3[] = [{ kind: 'feed', x0: 0, y0: 0, z0: 0, x1: 4, y1: 0, z1: -0.5 }]
    const shallow = buildVoxelRemovalFromCuttingSegments(segs, {
      toolRadiusMm: 0.8,
      maxCols: 24,
      maxRows: 24,
      maxLayers: 24,
      maxStamps: 8000,
      stockTopZ: 0
    })
    const deep = buildVoxelRemovalFromCuttingSegments(segs, {
      toolRadiusMm: 0.8,
      maxCols: 24,
      maxRows: 24,
      maxLayers: 24,
      maxStamps: 8000,
      stockTopZ: 0,
      stockBottomZ: -40
    })
    expect(shallow).not.toBeNull()
    expect(deep).not.toBeNull()
    if (!shallow || !deep) return
    expect(deep.zBottom).toBeLessThan(shallow.zBottom - 1)
    expect(deep.layers).toBeGreaterThanOrEqual(shallow.layers)
  })

  it('expands XY bounds when stockRectXYMm is set', () => {
    const segs: ToolpathSegment3[] = [{ kind: 'feed', x0: 2, y0: 2, z0: 0, x1: 3, y1: 2, z1: -0.5 }]
    const narrow = buildVoxelRemovalFromCuttingSegments(segs, {
      toolRadiusMm: 0.5,
      maxCols: 20,
      maxRows: 20,
      maxLayers: 16,
      maxStamps: 4000,
      stockTopZ: 0,
      stockRectXYMm: { minX: 0, maxX: 50, minY: 0, maxY: 40 }
    })
    const noRect = buildVoxelRemovalFromCuttingSegments(segs, {
      toolRadiusMm: 0.5,
      maxCols: 20,
      maxRows: 20,
      maxLayers: 16,
      maxStamps: 4000,
      stockTopZ: 0
    })
    expect(narrow).not.toBeNull()
    expect(noRect).not.toBeNull()
    if (!narrow || !noRect) return
    expect(narrow.cols * narrow.rows).toBeGreaterThanOrEqual(noRect.cols * noRect.rows)
  })
})
