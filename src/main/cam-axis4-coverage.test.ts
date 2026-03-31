/**
 * Verify roughing covers the full machinable X range and all 360° angles,
 * not just where the mesh has hits.
 */
import { describe, expect, it } from 'vitest'
import { generateCylindricalMeshRasterLines } from './cam-axis4-cylindrical-raster'

type Tri = [readonly [number,number,number], readonly [number,number,number], readonly [number,number,number]]

function makeBox(xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number): Tri[] {
  const tris: Tri[] = []
  tris.push([[xMin,yMin,zMin],[xMax,yMin,zMin],[xMax,yMax,zMin]])
  tris.push([[xMin,yMin,zMin],[xMax,yMax,zMin],[xMin,yMax,zMin]])
  tris.push([[xMin,yMin,zMax],[xMax,yMax,zMax],[xMax,yMin,zMax]])
  tris.push([[xMin,yMin,zMax],[xMin,yMax,zMax],[xMax,yMax,zMax]])
  tris.push([[xMin,yMin,zMin],[xMin,yMax,zMin],[xMin,yMax,zMax]])
  tris.push([[xMin,yMin,zMin],[xMin,yMax,zMax],[xMin,yMin,zMax]])
  tris.push([[xMax,yMin,zMin],[xMax,yMax,zMax],[xMax,yMax,zMin]])
  tris.push([[xMax,yMin,zMin],[xMax,yMin,zMax],[xMax,yMax,zMax]])
  tris.push([[xMin,yMin,zMin],[xMax,yMin,zMax],[xMax,yMin,zMin]])
  tris.push([[xMin,yMin,zMin],[xMin,yMin,zMax],[xMax,yMin,zMax]])
  tris.push([[xMin,yMax,zMin],[xMax,yMax,zMin],[xMax,yMax,zMax]])
  tris.push([[xMin,yMax,zMin],[xMax,yMax,zMax],[xMin,yMax,zMax]])
  return tris
}

describe('4-axis roughing coverage', () => {
  it('roughing covers full machinable X range even where mesh is narrow', () => {
    // Small box (X=40..50) on a large machinable range (X=10..80)
    // Roughing should still cut the full X=10..80 range at every angle
    const tris = makeBox(40, 50, -5, 5, -5, 5)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 50, // diameter=50 → radius=25
      machXStartMm: 10,
      machXEndMm: 80,
      stepoverDeg: 30,
      stepXMm: 3,
      zDepthsMm: [-2, -4],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      toolDiameterMm: 3.175,
    })

    // Extract all X coordinates from G1 moves
    const g1x: number[] = []
    for (const l of lines) {
      if (l.startsWith('G1') || l.startsWith('G0 X')) {
        const m = l.match(/X([-\d.]+)/)
        if (m) g1x.push(parseFloat(m[1]!))
      }
    }

    const xMin = Math.min(...g1x)
    const xMax = Math.max(...g1x)
    console.log(`X coverage: ${xMin.toFixed(1)} to ${xMax.toFixed(1)} (machinable: 10..80)`)

    // Roughing should extend close to the full 10..80 range (minus/plus overcut)
    expect(xMin).toBeLessThan(12) // Should start near machXStart
    expect(xMax).toBeGreaterThan(78) // Should extend near machXEnd
  })

  it('roughing covers all 360° angles', () => {
    const tris = makeBox(10, 80, -8, 8, -8, 8)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: 50,
      machXStartMm: 10,
      machXEndMm: 80,
      stepoverDeg: 30,
      stepXMm: 3,
      zDepthsMm: [-2, -4],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      toolDiameterMm: 3.175,
    })

    // Extract all A angles from G0/G1 A moves
    const angles = new Set<string>()
    for (const l of lines) {
      const m = l.match(/^G[01] A([\d.]+)/)
      if (m) angles.add(m[1]!)
    }

    console.log(`Angles covered: ${angles.size} unique: ${[...angles].sort((a,b) => +a - +b).join(', ')}`)

    // With stepoverDeg=30 → 12 roughing angles; finishing may add more.
    // At minimum, all 12 roughing angles must be present.
    expect(angles.size).toBeGreaterThanOrEqual(12)
  })
})
