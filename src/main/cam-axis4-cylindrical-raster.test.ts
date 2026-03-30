import { describe, expect, it } from 'vitest'
import { generateCylindricalMeshRasterLines } from './cam-axis4-cylindrical-raster'

describe('cam-axis4-cylindrical-raster', () => {
  // Small helper to build a triangle ring around X-axis at a given radius
  function makeRingTriangles(xMin: number, xMax: number, radius: number, segments: number = 12) {
    const tris: Array<readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]> = []
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2
      const y0 = Math.cos(a0) * radius
      const z0 = Math.sin(a0) * radius
      const y1 = Math.cos(a1) * radius
      const z1 = Math.sin(a1) * radius
      // Two triangles forming a quad strip
      tris.push([[xMin, y0, z0], [xMax, y0, z0], [xMin, y1, z1]])
      tris.push([[xMax, y0, z0], [xMax, y1, z1], [xMin, y1, z1]])
    }
    return tris
  }

  it('uses stock radius as depth reference when mesh is recessed inside cylinder OD', () => {
    const t50: [readonly [number, number, number], readonly [number, number, number], readonly [
      number,
      number,
      number
    ]][] = [
      [
        [45, 8, -2],
        [55, 8, 2],
        [50, 7.5, 0]
      ],
      [
        [45, 8, -2],
        [55, 8, -2],
        [55, 8, 2]
      ]
    ]
    const lines = generateCylindricalMeshRasterLines({
      triangles: t50,
      cylinderRadiusMm: 30,
      machXStartMm: 45,
      machXEndMm: 55,
      stepoverDeg: 45,
      stepXMm: 2,
      zDepthsMm: [-1],
      feedMmMin: 400,
      plungeMmMin: 200,
      safeZMm: 5,
      maxCells: 10000
    })
    const g1z = lines.filter((l) => /^G1\s+Z/i.test(l)).map((l) => {
      const m = l.match(/^G1\s+Z([\d.-]+)/i)
      return m ? parseFloat(m[1]!) : NaN
    })
    expect(g1z.length).toBeGreaterThan(0)
    expect(Math.max(...g1z)).toBeGreaterThan(12)
  })

  it('generates continuous passes (multiple G1 X moves per angle, not just plunge-retract)', () => {
    const tris = makeRingTriangles(10, 90, 8, 16)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 30,
      machXStartMm: 10,
      machXEndMm: 90,
      stepoverDeg: 30,
      stepXMm: 5,
      zDepthsMm: [-2],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      maxCells: 20000,
      toolDiameterMm: 3.175
    })
    // Count how many G1 X moves occur between consecutive G0 Z (retract) lines
    let maxG1xBetweenRetracts = 0
    let currentG1xCount = 0
    for (const l of lines) {
      if (/^G1\s+X/i.test(l)) {
        currentG1xCount++
      } else if (/^G0\s+Z/i.test(l)) {
        maxG1xBetweenRetracts = Math.max(maxG1xBetweenRetracts, currentG1xCount)
        currentG1xCount = 0
      }
    }
    // Continuous passes should have multiple G1 X moves between retracts
    expect(maxG1xBetweenRetracts).toBeGreaterThan(3)
  })

  it('extends cuts past material edges (overcut)', () => {
    const tris = makeRingTriangles(20, 80, 10, 16)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 30,
      machXStartMm: 20,
      machXEndMm: 80,
      stepoverDeg: 30,
      stepXMm: 2,
      zDepthsMm: [-2],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      maxCells: 30000,
      toolDiameterMm: 6,
      overcutMm: 6
    })
    // Extract all X positions from G0 X and G1 X commands
    const xPositions: number[] = []
    for (const l of lines) {
      const m = l.match(/^G[01]\s+X([\d.-]+)/i)
      if (m) xPositions.push(parseFloat(m[1]!))
    }
    expect(xPositions.length).toBeGreaterThan(0)
    const minX = Math.min(...xPositions)
    const maxX = Math.max(...xPositions)
    // Tool should extend past the mesh boundaries (20..80) by approximately overcutMm
    expect(minX).toBeLessThan(20)
    expect(maxX).toBeGreaterThan(80)
  })

  it('generates roughing layers that step down radially', () => {
    const tris = makeRingTriangles(10, 90, 8, 16)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 30,
      machXStartMm: 10,
      machXEndMm: 90,
      stepoverDeg: 30,
      stepXMm: 5,
      zDepthsMm: [-2, -4, -6],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      maxCells: 20000,
      toolDiameterMm: 3.175
    })
    // Should have roughing comments at different depth levels
    const roughingComments = lines.filter((l) => l.includes('Roughing:') || l.includes('Finishing'))
    expect(roughingComments.length).toBeGreaterThanOrEqual(2)

    // Extract all G1 Z values — should span multiple depth levels
    const g1zValues: number[] = []
    for (const l of lines) {
      const m = l.match(/^G1\s+.*Z([\d.-]+)/i)
      if (m) g1zValues.push(parseFloat(m[1]!))
    }
    expect(g1zValues.length).toBeGreaterThan(0)
    const minZ = Math.min(...g1zValues)
    const maxZ = Math.max(...g1zValues)
    // Should have a range of cut depths (not all at same level)
    expect(maxZ - minZ).toBeGreaterThan(1)
  })

  it('generates finishing pass at finer resolution', () => {
    const tris = makeRingTriangles(10, 90, 10, 16)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 30,
      machXStartMm: 10,
      machXEndMm: 90,
      stepoverDeg: 20,
      stepXMm: 3,
      zDepthsMm: [-2, -4],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      maxCells: 30000,
      toolDiameterMm: 3.175,
      enableFinishPass: true
    })
    const finishComments = lines.filter((l) => l.includes('Finishing pass') || l.includes('Finish '))
    expect(finishComments.length).toBeGreaterThan(0)
  })
})
