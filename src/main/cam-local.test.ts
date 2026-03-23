import { describe, expect, it } from 'vitest'
import {
  computeNegativeZDepthPasses,
  generateContour2dLines,
  generateDrill2dLines,
  generateMeshHeightRasterLines,
  generateOrthoBoundsRasterLines,
  generateParallelFinishLines,
  generatePocket2dLines,
  heightAtXyFromTriangles,
  minRampRunForMaxAngleMm
} from './cam-local'

describe('computeNegativeZDepthPasses', () => {
  it('returns single level for non-negative Z', () => {
    expect(computeNegativeZDepthPasses(3, 2)).toEqual([3])
    expect(computeNegativeZDepthPasses(0, 2)).toEqual([0])
  })

  it('steps into negative Z ending at target', () => {
    expect(computeNegativeZDepthPasses(-6, 2)).toEqual([-2, -4, -6])
    expect(computeNegativeZDepthPasses(-5, 2)).toEqual([-2, -4, -5])
  })
})

describe('generateParallelFinishLines', () => {
  it('emits zigzag G0/G1 moves within bounds', () => {
    const lines = generateParallelFinishLines({
      bounds: {
        min: [0, 0, 0],
        max: [10, 10, 5],
        triangleCount: 2
      },
      zPassMm: 4,
      stepoverMm: 5,
      feedMmMin: 1000,
      plungeMmMin: 300,
      safeZMm: 8
    })
    expect(lines.some((l) => l.startsWith('G1'))).toBe(true)
    expect(lines.join('\n')).toContain('Y0.000')
    expect(lines.join('\n')).toContain('Z8.000')
  })
})

describe('heightAtXyFromTriangles', () => {
  it('returns plane Z for horizontal triangle', () => {
    const t: [[number, number, number], [number, number, number], [number, number, number]] = [
      [0, 0, 3],
      [10, 0, 3],
      [0, 10, 3]
    ]
    expect(heightAtXyFromTriangles([t], 5, 5)).toBeCloseTo(3, 5)
  })
})

describe('generateMeshHeightRasterLines', () => {
  it('emits XY cutting moves on a flat slab', () => {
    const tri: [[number, number, number], [number, number, number], [number, number, number]] = [
      [0, 0, 1],
      [10, 0, 1],
      [0, 10, 1]
    ]
    const lines = generateMeshHeightRasterLines({
      triangles: [tri],
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10,
      stepoverMm: 5,
      sampleStepMm: 5,
      feedMmMin: 800,
      plungeMmMin: 200,
      safeZMm: 5
    })
    expect(lines.some((l) => /^G1 X[\d.]+ Y[\d.]+ Z[\d.]+ F/.test(l))).toBe(true)
  })
})

describe('generateOrthoBoundsRasterLines', () => {
  it('steps in X and sweeps Y', () => {
    const lines = generateOrthoBoundsRasterLines({
      bounds: { min: [0, 0, 0], max: [4, 4, 2], triangleCount: 0 },
      zPassMm: -1,
      stepoverMm: 4,
      feedMmMin: 500,
      plungeMmMin: 100,
      safeZMm: 3
    })
    expect(lines.join('\n')).toMatch(/X0\.000 Y4\.000/)
    expect(lines.join('\n')).toMatch(/X4\.000/)
  })
})

describe('2D toolpath generators', () => {
  it('emits closed contour from ring points', () => {
    const lines = generateContour2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8]
      ],
      zPassMm: -1.5,
      feedMmMin: 700,
      plungeMmMin: 250,
      safeZMm: 6
    })
    expect(lines.join('\n')).toMatch(/G1 X10\.000 Y8\.000 F700/)
    expect(lines.join('\n')).toMatch(/G1 X0\.000 Y0\.000 F700/)
  })

  it('supports contour side and lead-in/out segments', () => {
    const lines = generateContour2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8]
      ],
      zPassMm: -1,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      contourSide: 'conventional',
      leadInMm: 2,
      leadOutMm: 1
    })
    // Entry shifted before first point by lead-in.
    expect(lines.join('\n')).toMatch(/G0 X-2\.000 Y8\.000/)
    // Side reversal: first feed move after entering point goes toward last vertex.
    expect(lines.join('\n')).toMatch(/G1 X0\.000 Y8\.000 F600/)
    // Lead-out extends past start along first segment direction.
    expect(lines.join('\n')).toMatch(/G1 X1\.000 Y8\.000 F600/)
  })

  it('computes min ramp run for max angle vs Z drop', () => {
    expect(minRampRunForMaxAngleMm(7, 45)).toBeCloseTo(7, 5)
    expect(minRampRunForMaxAngleMm(0, 45)).toBe(0)
  })

  it('clamps ramp angle guardrails at edge values', () => {
    const runAtOneDeg = minRampRunForMaxAngleMm(7, 1)
    const runAtEightyNineDeg = minRampRunForMaxAngleMm(7, 89)
    expect(runAtOneDeg).toBeGreaterThan(300)
    expect(runAtEightyNineDeg).toBeLessThan(1)
    expect(minRampRunForMaxAngleMm(7, 0)).toBeCloseTo(runAtOneDeg, 6)
  })

  it('emits pocket raster passes from contour bounds', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [12, 0],
        [12, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -2,
      feedMmMin: 900,
      plungeMmMin: 300,
      safeZMm: 5
    })
    expect(lines.join('\n')).toMatch(/X12\.000 Y3\.000/)
    expect(lines.join('\n')).toMatch(/Z-2\.000 F300/)
  })

  it('clips pocket passes to contour interior (not full bbox width)', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [8, 0],
        [8, 8],
        [4, 4],
        [0, 8]
      ],
      stepoverMm: 4,
      zPassMm: -1.5,
      feedMmMin: 500,
      plungeMmMin: 200,
      safeZMm: 5
    })
    const g1Cuts = lines.filter((l) => /^G1 X/.test(l))
    // y=4 row should be clipped to x in [0,4] for this concave ring.
    expect(g1Cuts.some((l) => /X4\.000 Y4\.000/.test(l))).toBe(true)
    expect(g1Cuts.some((l) => /X8\.000 Y4\.000/.test(l))).toBe(false)
  })

  it('applies true geometric wall stock on a convex pocket (corner clearance)', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -1,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      wallStockMm: 1
    })
    const cutRows = lines.filter((l) => /^G1 X/.test(l))
    // At y=0, true inset leaves only a tangent point at x=1 (no finite span).
    expect(cutRows.some((l) => / Y0\.000 /.test(l))).toBe(false)
    // Interior row remains and is clipped to true offset limits.
    expect(cutRows.some((l) => /X9\.000 Y3\.000 F600/.test(l))).toBe(true)
  })

  it('applies true geometric wall stock on concave pocket re-entrant notch', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 8],
        [7, 8],
        [5, 6],
        [3, 8],
        [0, 8]
      ],
      stepoverMm: 1,
      zPassMm: -1,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      wallStockMm: 1
    })
    const text = lines.join('\n')
    // At y=7, true inset follows the 45-degree notch walls and lands at non-axis values.
    // Naive endpoint shrink would produce integer endpoints (x=2 and x=8 for this row).
    expect(text).toMatch(/G1 X2\.586 Y7\.000 F600/)
    expect(text).toMatch(/G0 X7\.414 Y7\.000/)
    expect(text).not.toMatch(/G1 X2\.000 Y7\.000 F600/)
    expect(text).not.toMatch(/G0 X8\.000 Y7\.000/)
  })

  it('supports multi-depth pocketing via zStepMm', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -6,
      zStepMm: 2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5
    })
    const text = lines.join('\n')
    expect(text).toMatch(/G1 Z-2\.000 F200/)
    expect(text).toMatch(/G1 Z-4\.000 F200/)
    expect(text).toMatch(/G1 Z-6\.000 F200/)
  })

  it('can finish contour at each depth when enabled', () => {
    const { lines } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -4,
      zStepMm: 2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      finishEachDepth: true
    })
    const text = lines.join('\n')
    // Expect contour-style close move at both depth levels.
    expect((text.match(/G1 X0\.000 Y0\.000 F600/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('supports pocket ramp entry mode and lengthens run to respect max ramp angle', () => {
    const { lines, hints } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      entryMode: 'ramp',
      rampMm: 1.5,
      rampMaxAngleDeg: 45
    })
    const text = lines.join('\n')
    // |safeZ - z| = 7 mm → 45° needs ≥7 mm horizontal run; rampMm 1.5 is extended to 7 mm.
    expect(text).toMatch(/G1 X7\.000 Y0\.000 Z-2\.000 F200/)
    expect(text).not.toMatch(/G1 Z-2\.000 F200/)
    expect(hints.some((h) => /lengthened/i.test(h))).toBe(true)
  })

  it('allows short ramp when rampMaxAngleDeg is relaxed', () => {
    const { lines, hints } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [10, 0],
        [10, 6],
        [0, 6]
      ],
      stepoverMm: 3,
      zPassMm: -2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      entryMode: 'ramp',
      rampMm: 1.5,
      rampMaxAngleDeg: 89
    })
    const text = lines.join('\n')
    expect(text).toMatch(/G1 X1\.500 Y0\.000 Z-2\.000 F200/)
    expect(hints.length).toBe(0)
  })

  it('warns when segment span cannot satisfy max ramp angle', () => {
    const { lines, hints } = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [1, 0],
        [1, 10],
        [0, 10]
      ],
      stepoverMm: 2,
      zPassMm: -2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      entryMode: 'ramp',
      rampMm: 2,
      rampMaxAngleDeg: 45
    })
    expect(lines.join('\n')).toMatch(/G1 X1\.000 Y0\.000 Z-2\.000 F200/)
    expect(hints.some((h) => /shorter than the horizontal run needed/i.test(h))).toBe(true)
  })

  it('treats invalid rampMaxAngleDeg as default (45 deg) and still emits robust hints', () => {
    const base = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [1, 0],
        [1, 10],
        [0, 10]
      ],
      stepoverMm: 2,
      zPassMm: -2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      entryMode: 'ramp',
      rampMm: 2,
      rampMaxAngleDeg: 45
    })
    const invalid = generatePocket2dLines({
      contourPoints: [
        [0, 0],
        [1, 0],
        [1, 10],
        [0, 10]
      ],
      stepoverMm: 2,
      zPassMm: -2,
      feedMmMin: 600,
      plungeMmMin: 200,
      safeZMm: 5,
      entryMode: 'ramp',
      rampMm: 2,
      rampMaxAngleDeg: Number.NaN
    })
    expect(invalid.lines).toEqual(base.lines)
    expect(invalid.hints.join(' ')).toContain('rampMaxAngleDeg (45')
  })

  it('emits drill canned cycles for each point', () => {
    const lines = generateDrill2dLines({
      drillPoints: [
        [5, 5],
        [10, 5]
      ],
      zPassMm: -4,
      feedMmMin: 180,
      safeZMm: 7,
      retractMm: 2
    })
    expect(lines.join('\n')).toMatch(/G81 X5\.000 Y5\.000 Z-4\.000 R2\.000 F180/)
    expect(lines.filter((l) => l === 'G80').length).toBe(1)
  })

  it('supports expanded drill moves (grbl-safe fallback)', () => {
    const lines = generateDrill2dLines({
      drillPoints: [[2, 3]],
      zPassMm: -2,
      feedMmMin: 120,
      safeZMm: 5,
      cycleMode: 'expanded'
    })
    expect(lines.join('\n')).toMatch(/G1 Z-2\.000 F120/)
    expect(lines.some((l) => l.startsWith('G81') || l.startsWith('G82') || l.startsWith('G83') || l === 'G80')).toBe(false)
  })

  it('supports G82 dwell cycle', () => {
    const lines = generateDrill2dLines({
      drillPoints: [[3, 2]],
      zPassMm: -5,
      feedMmMin: 150,
      safeZMm: 8,
      retractMm: 2,
      cycleMode: 'g82',
      dwellMs: 250
    })
    expect(lines.join('\n')).toMatch(/G82 X3\.000 Y2\.000 Z-5\.000 R2\.000 P250 F150/)
    expect(lines).toContain('G80')
  })

  it('supports G83 peck cycle', () => {
    const lines = generateDrill2dLines({
      drillPoints: [[1, 1]],
      zPassMm: -6,
      feedMmMin: 160,
      safeZMm: 8,
      retractMm: 1.5,
      cycleMode: 'g83',
      peckMm: 1
    })
    expect(lines.join('\n')).toMatch(/G83 X1\.000 Y1\.000 Z-6\.000 R1\.500 Q1\.000 F160/)
    expect(lines).toContain('G80')
  })
})
