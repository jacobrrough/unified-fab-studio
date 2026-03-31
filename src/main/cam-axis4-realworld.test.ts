/**
 * Tests for 4-axis engine with REALISTIC model positions.
 *
 * Real models from CAD are NOT centered on the X-axis. They typically sit on
 * a ground plane (Y>0 or Z>0), offset from the rotation axis. The engine
 * auto-centers the mesh (translates Y-Z bbox center to origin) and computes
 * mesh-aware depth levels from stock OD to the mesh surface.
 */
import { describe, expect, it } from 'vitest'
import { generateCylindricalMeshRasterLines } from './cam-axis4-cylindrical-raster'

type Tri = [readonly [number,number,number], readonly [number,number,number], readonly [number,number,number]]

function makeBox(xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number): Tri[] {
  const tris: Tri[] = []
  // 6 faces, 2 triangles each
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

describe('4-axis real-world model positions', () => {
  it('CENTERED model: gets mesh hits, variable Z depths', () => {
    // Model centered on rotation axis (Y≈0, Z≈0)
    const tris = makeBox(10, 80, -8, 8, -8, 8)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris, cylinderRadiusMm: 50, machXStartMm: 10, machXEndMm: 80,
      stepoverDeg: 15, stepXMm: 3, zDepthsMm: [-2, -4],
      feedMmMin: 800, plungeMmMin: 300, safeZMm: 10, toolDiameterMm: 3.175,
    })
    const g1 = lines.filter(l => l.startsWith('G1'))
    const g1z = lines.filter(l => /^G1\s+.*Z[\d.]/i.test(l)).map(l => {
      const m = l.match(/Z([\d.]+)/); return m ? parseFloat(m[1]!) : NaN
    }).filter(n => !isNaN(n))
    console.log(`CENTERED: G1=${g1.length}, Z values: min=${Math.min(...g1z).toFixed(2)} max=${Math.max(...g1z).toFixed(2)}`)
    expect(g1.length).toBeGreaterThan(10)
    // Z values should VARY (not all the same — proves mesh is used)
    const uniqueZ = new Set(g1z.map(z => z.toFixed(2)))
    console.log(`  Unique Z values: ${uniqueZ.size}`)
    expect(uniqueZ.size).toBeGreaterThan(2)
  })

  it('OFF-CENTER model (Y=10..30, Z=5..25): auto-centered, gets hits', () => {
    // Model NOT centered on X-axis — typical CAD position
    // Auto-centering translates Y-Z bounding box center to origin before ray-casting
    const tris = makeBox(10, 80, 10, 30, 5, 25)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris, cylinderRadiusMm: 50, machXStartMm: 10, machXEndMm: 80,
      stepoverDeg: 15, stepXMm: 3, zDepthsMm: [-2, -4],
      feedMmMin: 800, plungeMmMin: 300, safeZMm: 10, toolDiameterMm: 3.175,
    })
    const g1 = lines.filter(l => l.startsWith('G1'))
    console.log(`OFF-CENTER: G1=${g1.length} (auto-centered — gets mesh hits)`)
    expect(g1.length).toBeGreaterThan(100)
  })

  it('GROUND-PLANE model (Y=0..20, Z=0..15): auto-centered, variable depths', () => {
    // Model sitting on ground plane — auto-centered to rotation axis
    const tris = makeBox(10, 80, 0, 20, 0, 15)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris, cylinderRadiusMm: 50, machXStartMm: 10, machXEndMm: 80,
      stepoverDeg: 15, stepXMm: 3, zDepthsMm: [-2, -4],
      feedMmMin: 800, plungeMmMin: 300, safeZMm: 10, toolDiameterMm: 3.175,
    })
    const g1 = lines.filter(l => l.startsWith('G1'))
    const g1z = lines.filter(l => /^G1\s+.*Z[\d.]/i.test(l)).map(l => {
      const m = l.match(/Z([\d.]+)/); return m ? parseFloat(m[1]!) : NaN
    }).filter(n => !isNaN(n))
    const uniqueZ = new Set(g1z.map(z => z.toFixed(2)))
    console.log(`GROUND-PLANE: G1=${g1.length}, unique Z=${uniqueZ.size}`)
    expect(g1.length).toBeGreaterThan(100)
    expect(uniqueZ.size).toBeGreaterThan(2)
  })

  it('roughing produces multiple depth levels', () => {
    const tris = makeBox(10, 80, -8, 8, -8, 8) // centered
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris, cylinderRadiusMm: 50, machXStartMm: 10, machXEndMm: 80,
      stepoverDeg: 15, stepXMm: 3, zDepthsMm: [-2, -4, -6],
      feedMmMin: 800, plungeMmMin: 300, safeZMm: 10, toolDiameterMm: 3.175,
      enableFinishPass: false,
    })
    const roughComments = lines.filter(l => l.includes('Roughing:'))
    console.log(`Roughing comments: ${roughComments.length}`)
    roughComments.forEach(c => console.log(`  ${c}`))
    expect(roughComments.length).toBeGreaterThanOrEqual(2)
  })

  it('finishing with single depth follows mesh surface', () => {
    const tris = makeBox(10, 80, -8, 8, -8, 8)
    const lines = generateCylindricalMeshRasterLines({
      triangles: tris, cylinderRadiusMm: 50, machXStartMm: 10, machXEndMm: 80,
      stepoverDeg: 10, stepXMm: 2, zDepthsMm: [-6],
      feedMmMin: 800, plungeMmMin: 300, safeZMm: 10, toolDiameterMm: 3.175,
      enableFinishPass: true,
    })
    const g1 = lines.filter(l => l.startsWith('G1'))
    console.log(`Finish single depth: G1=${g1.length}`)
    // enableFinishPass=true overrides allDepths.length check — single depth finishing works
    expect(g1.length).toBeGreaterThan(100)
  })

  /**
   * Simulates the FULL production pipeline:
   *   1. stlTransformForCam with center_origin places mesh at (xCenter, 55, 0)
   *   2. cam-runner shifts X by +halfStockLen to convert viewer→machine coords
   *   3. heightmap engine auto-centers Y-Z and ray-casts
   *
   * This test creates a tapered cylinder with VARYING radius to verify the
   * heightmap engine actually produces contouring (Z values that follow the shape),
   * not just constant-depth cylindrical cuts.
   */
  it('FULL PIPELINE SIMULATION: cam-aligned mesh at Y=55, X shifted by halfStockLen, produces contouring', () => {
    const stockLen = 100
    const stockDia = 25
    const halfStockLen = stockLen / 2

    // Create a tapered cylinder: radius varies from 8mm at xMin to 4mm at xMax
    // This simulates a model that was:
    //   1. Centered at origin by center_origin
    //   2. Scaled uniformly
    //   3. Translated to (xCenter=0, 55, 0) by stlTransformForCam
    //   4. X-shifted by +halfStockLen by cam-runner
    const xMin = -20 + halfStockLen  // 30 in machine space
    const xMax = 20 + halfStockLen   // 70 in machine space
    const yCenter = 55  // CARVERA_AXIS_Y (will be auto-centered by engine)
    const segments = 16
    const xSteps = 8

    const tris: Tri[] = []
    for (let xi = 0; xi < xSteps; xi++) {
      const x0 = xMin + (xi / xSteps) * (xMax - xMin)
      const x1 = xMin + ((xi + 1) / xSteps) * (xMax - xMin)
      // Taper: radius decreases linearly from 8 to 4
      const r0 = 8 - 4 * (xi / xSteps)
      const r1 = 8 - 4 * ((xi + 1) / xSteps)

      for (let si = 0; si < segments; si++) {
        const a0 = (si / segments) * Math.PI * 2
        const a1 = ((si + 1) / segments) * Math.PI * 2

        const y00 = yCenter + Math.cos(a0) * r0
        const z00 = Math.sin(a0) * r0
        const y01 = yCenter + Math.cos(a1) * r0
        const z01 = Math.sin(a1) * r0
        const y10 = yCenter + Math.cos(a0) * r1
        const z10 = Math.sin(a0) * r1
        const y11 = yCenter + Math.cos(a1) * r1
        const z11 = Math.sin(a1) * r1

        tris.push([[x0, y00, z00], [x1, y10, z10], [x0, y01, z01]])
        tris.push([[x1, y10, z10], [x1, y11, z11], [x0, y01, z01]])
      }
    }

    // Machine-space grid range (as cam-runner would compute)
    const machXStart = 30  // matches shifted mesh xMin
    const machXEnd = 70    // matches shifted mesh xMax

    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: stockDia,  // engine divides by 2 → stockR = 12.5
      machXStartMm: machXStart,
      machXEndMm: machXEnd,
      stepoverDeg: 15,
      stepXMm: 2,
      zDepthsMm: [-2, -4, -6],
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      toolDiameterMm: 3.175,
      enableFinishPass: true
    })

    // Parse diagnostics from the G-code comments
    const hmLine = lines.find(l => l.includes('Heightmap:'))
    console.log(`Pipeline sim: ${hmLine}`)

    const centerLine = lines.find(l => l.includes('Auto-centered'))
    console.log(`Pipeline sim: ${centerLine}`)

    // 1. Verify significant heightmap hits (not 0%)
    const hmMatch = hmLine?.match(/(\d+)\/(\d+) cells hit \(([\d.]+)%\)/)
    expect(hmMatch).toBeTruthy()
    const hitCount = parseInt(hmMatch![1]!)
    const hitPct = parseFloat(hmMatch![3]!)
    console.log(`  Hit count: ${hitCount}, Hit %: ${hitPct.toFixed(1)}%`)
    expect(hitPct).toBeGreaterThan(10) // Must have meaningful mesh coverage

    // 2. Verify G-code has cutting moves
    const g1x = lines.filter(l => /^G1\s+X[\d.-]/i.test(l))
    console.log(`  G1 X moves: ${g1x.length}`)
    expect(g1x.length).toBeGreaterThan(20)

    // 3. Verify G-code Z values VARY (contouring, not constant depth)
    const allZValues: number[] = []
    for (const l of lines) {
      const m = l.match(/^G1\s+.*Z([\d.]+)/i)
      if (m) allZValues.push(parseFloat(m[1]!))
    }
    const uniqueZ = new Set(allZValues.map(z => z.toFixed(1)))
    console.log(`  Z values: ${allZValues.length} total, ${uniqueZ.size} unique (to 0.1mm)`)
    console.log(`  Z range: ${Math.min(...allZValues).toFixed(2)} to ${Math.max(...allZValues).toFixed(2)}`)
    expect(uniqueZ.size).toBeGreaterThan(5) // Z must vary significantly

    // 4. Verify G-code X values are in machine space (not viewer space)
    const allXValues: number[] = []
    for (const l of lines) {
      const m = l.match(/^G[01]\s+X([\d.-]+)/i)
      if (m) allXValues.push(parseFloat(m[1]!))
    }
    const xMin_gcode = Math.min(...allXValues)
    const xMax_gcode = Math.max(...allXValues)
    console.log(`  X range in G-code: ${xMin_gcode.toFixed(1)} to ${xMax_gcode.toFixed(1)}`)
    // X values should be near the machine-space mesh range [30, 70]
    expect(xMin_gcode).toBeGreaterThan(20)
    expect(xMax_gcode).toBeLessThan(80)

    // 5. Verify finishing pass exists
    const finishLines = lines.filter(l => l.includes('Finishing pass') || l.includes('Finish '))
    console.log(`  Finishing lines: ${finishLines.length}`)
    expect(finishLines.length).toBeGreaterThan(0)

    // 6. Verify minimal retractions (G0 Z moves should be ≤ 2: start + end)
    const g0z = lines.filter(l => /^G0\s+Z/i.test(l))
    console.log(`  G0 Z (retract) moves: ${g0z.length}`)
    expect(g0z.length).toBeLessThanOrEqual(2)
  })

  it('G-code Z values at different X positions follow tapered mesh shape', () => {
    const stockLen = 100
    const stockDia = 25
    const halfStockLen = stockLen / 2

    // Simple tapered cylinder: radius 10 at X=30(machine), radius 5 at X=70(machine)
    const xMin = -20 + halfStockLen  // 30
    const xMax = 20 + halfStockLen   // 70
    const yCenter = 55
    const segments = 24

    const tris: Tri[] = []
    // Just 2 X slices: wide end and narrow end
    const r0 = 10  // wide end
    const r1 = 5   // narrow end
    for (let si = 0; si < segments; si++) {
      const a0 = (si / segments) * Math.PI * 2
      const a1 = ((si + 1) / segments) * Math.PI * 2
      const y00 = yCenter + Math.cos(a0) * r0, z00 = Math.sin(a0) * r0
      const y01 = yCenter + Math.cos(a1) * r0, z01 = Math.sin(a1) * r0
      const y10 = yCenter + Math.cos(a0) * r1, z10 = Math.sin(a0) * r1
      const y11 = yCenter + Math.cos(a1) * r1, z11 = Math.sin(a1) * r1
      tris.push([[xMin, y00, z00], [xMax, y10, z10], [xMin, y01, z01]])
      tris.push([[xMax, y10, z10], [xMax, y11, z11], [xMin, y01, z01]])
    }

    const lines = generateCylindricalMeshRasterLines({
      triangles: tris,
      cylinderRadiusMm: stockDia,
      machXStartMm: 30,
      machXEndMm: 70,
      stepoverDeg: 30,
      stepXMm: 2,
      zDepthsMm: [-8],  // deep enough to reach mesh at both ends
      feedMmMin: 800,
      plungeMmMin: 300,
      safeZMm: 10,
      toolDiameterMm: 3.175,
      enableFinishPass: true,
      finishStepoverDeg: 30,
    })

    // Extract finishing pass Z values grouped by X position
    const finishMoves: Array<{ x: number; z: number }> = []
    let inFinish = false
    for (const l of lines) {
      if (l.includes('Finish ')) inFinish = true
      if (!inFinish) continue
      const m = l.match(/^G1\s+X([\d.-]+)\s+Z([\d.]+)/i)
      if (m) {
        finishMoves.push({ x: parseFloat(m[1]!), z: parseFloat(m[2]!) })
      }
    }

    console.log(`Taper test: ${finishMoves.length} finish moves with X+Z`)
    if (finishMoves.length > 0) {
      // Group by X region: near xMin (machine X~30) vs near xMax (machine X~70)
      const nearWide = finishMoves.filter(m => m.x < 50)
      const nearNarrow = finishMoves.filter(m => m.x > 50)
      if (nearWide.length > 0 && nearNarrow.length > 0) {
        const avgZWide = nearWide.reduce((s, m) => s + m.z, 0) / nearWide.length
        const avgZNarrow = nearNarrow.reduce((s, m) => s + m.z, 0) / nearNarrow.length
        console.log(`  Wide end (X<50) avg Z: ${avgZWide.toFixed(2)} (mesh R≈10, expect Z≈10)`)
        console.log(`  Narrow end (X>50) avg Z: ${avgZNarrow.toFixed(2)} (mesh R≈5, expect Z≈5)`)
        // The wide end should have LARGER Z (further from axis = larger radius)
        // The narrow end should have SMALLER Z (closer to axis = smaller radius)
        expect(avgZWide).toBeGreaterThan(avgZNarrow)
      }
    }
    expect(finishMoves.length).toBeGreaterThan(5)
  })
})
