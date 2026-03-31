/**
 * 4-Axis Cylindrical Heightmap CAM Engine
 *
 * Generates proper rotary toolpaths using a cylindrical heightmap approach:
 *   1. Auto-center the mesh on the rotation axis (Y-Z centroid → origin)
 *   2. Build a cylindrical heightmap by ray-casting the mesh from stock OD inward
 *   3. Apply tool-radius compensation (min-envelope over tool footprint)
 *   4. Auto-compute radial depth levels from stock OD to mesh surface
 *   5. Generate continuous zigzag passes at each radial depth level (waterline roughing)
 *   6. Extend passes past material edges for clean cuts (overcut)
 *   7. Finishing passes follow the compensated surface with fine stepover
 *
 * Coordinate system (matches GRBL 4-axis convention):
 *   X = axial position along rotation axis
 *   Z = radial distance from rotation center (tool approach axis)
 *   A = rotation angle (degrees), 0–360
 *
 * References:
 *   - BlenderCAM/FabexCNC parallel-around-rotary strategy
 *   - pngcam heightmap-to-toolpath with tool-radius compensation
 *   - BobCAD-CAM rotary waterline roughing
 *   - ENCY CAM rotary adaptive roughing
 */
import type { Vec3 } from './stl'

type Triangle = readonly [Vec3, Vec3, Vec3]

// ─── Ray–triangle intersection (Möller–Trumbore) ───────────────────────────

const EPS = 1e-7

function rayIntersectTriangle(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  v0: Vec3, v1: Vec3, v2: Vec3
): number | null {
  const [x0, y0, z0] = v0
  const [x1, y1, z1] = v1
  const [x2, y2, z2] = v2
  const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0
  const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0
  const px = dy * e2z - dz * e2y
  const py = dz * e2x - dx * e2z
  const pz = dx * e2y - dy * e2x
  const det = e1x * px + e1y * py + e1z * pz
  if (Math.abs(det) < EPS) return null
  const invDet = 1 / det
  const tx = ox - x0, ty = oy - y0, tz = oz - z0
  const u = (tx * px + ty * py + tz * pz) * invDet
  if (u < -EPS || u > 1 + EPS) return null
  const qx = ty * e1z - tz * e1y
  const qy = tz * e1x - tx * e1z
  const qz = tx * e1y - ty * e1x
  const v = (dx * qx + dy * qy + dz * qz) * invDet
  if (v < -EPS || u + v > 1 + EPS) return null
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet
  return t > EPS ? t : null
}

// ─── Spatial acceleration: slice triangles by X bucket ──────────────────────

type XBuckets = { buckets: Triangle[][]; xMin: number; bucketWidth: number; count: number }

function buildXBuckets(triangles: Triangle[], xMin: number, xMax: number, numBuckets: number): XBuckets {
  const span = Math.max(1e-6, xMax - xMin)
  const w = span / numBuckets
  const buckets: Triangle[][] = Array.from({ length: numBuckets }, () => [])
  for (const tri of triangles) {
    const txMin = Math.min(tri[0][0], tri[1][0], tri[2][0])
    const txMax = Math.max(tri[0][0], tri[1][0], tri[2][0])
    const i0 = Math.max(0, Math.min(numBuckets - 1, Math.floor((txMin - xMin) / w)))
    const i1 = Math.max(0, Math.min(numBuckets - 1, Math.floor((txMax - xMin) / w)))
    for (let i = i0; i <= i1; i++) buckets[i]!.push(tri)
  }
  return { buckets, xMin, bucketWidth: w, count: numBuckets }
}

function queryBucket(xb: XBuckets, x: number): Triangle[] {
  const i = Math.max(0, Math.min(xb.count - 1, Math.floor((x - xb.xMin) / xb.bucketWidth)))
  return xb.buckets[i]!
}

// ─── Auto-center triangles on rotation axis ────────────────────────────────

/**
 * Compute Y-Z bounding box center and translate all triangles so the mesh
 * is centered on the rotation axis (Y=0, Z=0). Returns the centered
 * triangles and the offset applied.
 *
 * Real STL models are almost never centered on the X-axis. They sit on a
 * ground plane, are offset by CAD origin, etc. Without centering, the
 * cylindrical ray-casting misses most of the mesh.
 */
function centerTrianglesOnRotationAxis(
  triangles: Triangle[]
): { centered: Triangle[]; offsetY: number; offsetZ: number; meshRadialMax: number } {
  if (triangles.length === 0) {
    return { centered: [], offsetY: 0, offsetZ: 0, meshRadialMax: 0 }
  }

  let yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity
  for (const [v0, v1, v2] of triangles) {
    for (const [, y, z] of [v0, v1, v2]) {
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
      if (z < zMin) zMin = z
      if (z > zMax) zMax = z
    }
  }

  const offsetY = (yMin + yMax) / 2
  const offsetZ = (zMin + zMax) / 2

  const centered: Triangle[] = []
  let meshRadialMax = 0
  for (const [v0, v1, v2] of triangles) {
    const a: Vec3 = [v0[0], v0[1] - offsetY, v0[2] - offsetZ]
    const b: Vec3 = [v1[0], v1[1] - offsetY, v1[2] - offsetZ]
    const c: Vec3 = [v2[0], v2[1] - offsetY, v2[2] - offsetZ]
    centered.push([a, b, c])
    // Track maximum radial extent
    for (const [, y, z] of [a, b, c]) {
      const r = Math.hypot(y, z)
      if (r > meshRadialMax) meshRadialMax = r
    }
  }

  return { centered, offsetY, offsetZ, meshRadialMax }
}

// ─── Cylindrical heightmap ──────────────────────────────────────────────────

/**
 * A cylindrical heightmap stores the radial distance from the X-axis to the
 * part surface at each (axial X, angular A) grid cell.
 *
 * `NO_HIT` means no mesh was found at that position (air / outside part).
 */
const NO_HIT = -1

type CylindricalHeightmap = {
  /** Radial distance to part surface. NO_HIT = no mesh. [ix * na + ia] */
  radii: Float32Array
  /** Number of X steps */
  nx: number
  /** Number of angular steps */
  na: number
  /** X value at index 0 */
  xStart: number
  /** X step size */
  dx: number
  /** Angular step in degrees */
  daDeg: number
}

function buildCylindricalHeightmap(
  triangles: Triangle[],
  stockRadius: number,
  xStart: number,
  xEnd: number,
  nx: number,
  na: number
): CylindricalHeightmap {
  const radii = new Float32Array(nx * na).fill(NO_HIT)
  const spanX = xEnd - xStart
  const dx = spanX / Math.max(1, nx - 1)
  const daDeg = 360 / na
  const castR = stockRadius + 30 // start ray well outside stock

  // Build spatial acceleration
  const numBuckets = Math.max(1, Math.min(nx, 200))
  const xb = buildXBuckets(triangles, xStart - dx, xEnd + dx, numBuckets)

  for (let ix = 0; ix < nx; ix++) {
    const x = xStart + ix * dx
    const localTris = queryBucket(xb, x)
    if (localTris.length === 0) continue

    for (let ia = 0; ia < na; ia++) {
      const aDeg = ia * daDeg
      const aRad = (aDeg * Math.PI) / 180
      const uy = Math.cos(aRad)
      const uz = Math.sin(aRad)

      // Ray from outside stock, pointing inward toward X-axis
      const oy = uy * castR
      const oz = uz * castR
      const dy = -uy
      const dz = -uz

      // Cast ray through all triangles in this X bucket
      let bestT: number | null = null
      for (const [v0, v1, v2] of localTris) {
        const t = rayIntersectTriangle(x, oy, oz, 0, dy, dz, v0, v1, v2)
        if (t != null && (bestT == null || t < bestT)) bestT = t
      }
      if (bestT == null) continue

      // Compute radial distance of hit point from X-axis
      const hy = oy + bestT * dy
      const hz = oz + bestT * dz
      const rHit = Math.hypot(hy, hz)

      // Sanity: ignore hits outside stock or at the axis
      if (rHit < 0.01 || rHit > stockRadius + 5) continue

      radii[ix * na + ia] = rHit
    }
  }

  return { radii, nx, na, xStart, dx, daDeg }
}

function hmGet(hm: CylindricalHeightmap, ix: number, ia: number): number {
  if (ix < 0 || ix >= hm.nx || ia < 0 || ia >= hm.na) return NO_HIT
  return hm.radii[ix * hm.na + ia]!
}

// ─── Tool radius compensation ───────────────────────────────────────────────

/**
 * Apply tool radius compensation to the heightmap.
 * For each cell, find the MAXIMUM radial distance within the tool footprint.
 * This prevents the tool center from gouging into adjacent higher features.
 */
function applyToolRadiusCompensation(
  hm: CylindricalHeightmap,
  toolRadius: number,
  stockRadius: number
): Float32Array {
  const compensated = new Float32Array(hm.nx * hm.na).fill(NO_HIT)
  const kernelIx = Math.max(1, Math.ceil(toolRadius / Math.max(0.01, hm.dx)))
  const angularSpanDeg = (toolRadius / Math.max(0.01, stockRadius)) * (180 / Math.PI)
  const kernelIa = Math.max(1, Math.ceil(angularSpanDeg / hm.daDeg))

  for (let ix = 0; ix < hm.nx; ix++) {
    for (let ia = 0; ia < hm.na; ia++) {
      let maxR = NO_HIT
      let hasAnyHit = false

      for (let dix = -kernelIx; dix <= kernelIx; dix++) {
        const nix = ix + dix
        if (nix < 0 || nix >= hm.nx) continue

        for (let dia = -kernelIa; dia <= kernelIa; dia++) {
          let nia = ia + dia
          if (nia < 0) nia += hm.na
          if (nia >= hm.na) nia -= hm.na

          const distX = dix * hm.dx
          const distA = dia * hm.daDeg * (Math.PI / 180) * stockRadius
          const dist = Math.hypot(distX, distA)
          if (dist > toolRadius) continue

          const r = hmGet(hm, nix, nia)
          if (r !== NO_HIT) {
            hasAnyHit = true
            if (r > maxR) maxR = r
          }
        }
      }

      if (hasAnyHit) {
        compensated[ix * hm.na + ia] = maxR
      }
    }
  }

  return compensated
}

// ─── Edge detection and overcut extension ───────────────────────────────────

function computePerAngleXExtents(
  hm: CylindricalHeightmap,
  overcutCells: number
): Array<[number, number]> {
  const extents: Array<[number, number]> = []
  for (let ia = 0; ia < hm.na; ia++) {
    let first = -1
    let last = -1
    for (let ix = 0; ix < hm.nx; ix++) {
      if (hmGet(hm, ix, ia) !== NO_HIT) {
        if (first === -1) first = ix
        last = ix
      }
    }
    if (first === -1) {
      extents.push([-1, -1])
    } else {
      const extStart = Math.max(0, first - overcutCells)
      const extEnd = Math.min(hm.nx - 1, last + overcutCells)
      extents.push([extStart, extEnd])
    }
  }

  // Fill gaps from neighboring angles
  for (let ia = 0; ia < hm.na; ia++) {
    if (extents[ia]![0] !== -1) continue
    const prev = (ia - 1 + hm.na) % hm.na
    const next = (ia + 1) % hm.na
    if (extents[prev]![0] !== -1 && extents[next]![0] !== -1) {
      extents[ia] = [
        Math.min(extents[prev]![0], extents[next]![0]),
        Math.max(extents[prev]![1], extents[next]![1])
      ]
    } else if (extents[prev]![0] !== -1) {
      extents[ia] = [...extents[prev]!]
    } else if (extents[next]![0] !== -1) {
      extents[ia] = [...extents[next]!]
    }
  }

  return extents
}

// ─── Auto-compute depth levels from mesh ────────────────────────────────────

/**
 * Compute radial depth levels that go from stock OD all the way down to the
 * mesh surface. This ensures the toolpath actually reaches the model, not
 * just skimming the top few mm of stock.
 *
 * @param meshRadialMax Maximum radial extent of the centered mesh
 * @param stockRadius Stock cylinder radius
 * @param zStepMm Step-down per layer (mm radial)
 * @param userZPassMm User-requested total depth (negative = from stock surface)
 * @returns Array of negative depth values (relative to stock surface)
 */
function computeMeshAwareDepths(
  meshRadialMax: number,
  stockRadius: number,
  zStepMm: number,
  userZPassMm: number
): number[] {
  // How deep we need to go: from stock OD to the mesh surface
  // Plus a small margin to ensure we reach the model
  const meshDepth = -(stockRadius - Math.max(0.5, meshRadialMax - 0.5))

  // Use the deeper of: user-requested depth, or depth to reach mesh
  const targetDepth = Math.min(userZPassMm, meshDepth)

  // If target depth is too shallow (near zero), use at least -1
  if (targetDepth >= -0.1) return [-1]

  // Step down from stock surface to target depth
  const step = Math.max(0.25, Math.min(Math.abs(targetDepth) / 2, zStepMm > 0 ? zStepMm : 2))
  const depths: number[] = []
  let d = -step
  while (d > targetDepth + 1e-6) {
    depths.push(d)
    d -= step
  }
  depths.push(targetDepth)
  return depths
}

// ─── Toolpath generation ────────────────────────────────────────────────────

export type CylindricalRasterParams = {
  triangles: Triangle[]
  cylinderRadiusMm: number
  machXStartMm: number
  machXEndMm: number
  /** Angular step in degrees. */
  stepoverDeg: number
  /** Approximate step along X (mm). */
  stepXMm: number
  /** Depth levels relative to stock surface (negative values). Used as fallback if mesh centering fails. */
  zDepthsMm: number[]
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
  /** Optional extra radial stock left on mesh hits (mm). */
  finishAllowanceMm?: number
  /** Hard cap on grid cells (x steps × a steps). */
  maxCells?: number
  /** Tool diameter in mm (default 3.175). */
  toolDiameterMm?: number
  /** Overcut distance past material edges in mm (default: tool diameter). */
  overcutMm?: number
  /** Generate a finishing pass (default: auto based on depth count). */
  enableFinishPass?: boolean
  /** Finishing pass angular stepover in degrees (default: stepoverDeg / 2). */
  finishStepoverDeg?: number
}

/**
 * Generate 4-axis cylindrical toolpath using heightmap-based approach.
 *
 * Algorithm:
 * 1. Auto-center the mesh on the rotation axis
 * 2. Compute depth levels from stock OD to mesh surface
 * 3. Build cylindrical heightmap by ray-casting mesh
 * 4. Apply tool-radius compensation
 * 5. For each radial depth level (roughing):
 *    a. For each angular position, generate continuous X-axis passes
 *    b. Extend past material edges by overcut distance
 *    c. Cut at the deeper of (current depth level) or (compensated surface)
 *    d. Skip air regions where no material exists
 * 6. Finishing pass: follow the compensated surface at fine stepover
 */
export function generateCylindricalMeshRasterLines(p: CylindricalRasterParams): string[] {
  const stockR = Math.max(1e-6, p.cylinderRadiusMm / 2)
  const clearZ = stockR + p.safeZMm
  const toolD = p.toolDiameterMm ?? 3.175
  const toolR = toolD / 2
  const overcutMm = p.overcutMm ?? toolD
  const stepA = Math.max(0.5, Math.min(90, p.stepoverDeg))

  // Step 0: Auto-center the mesh on the rotation axis
  const { centered, offsetY, offsetZ, meshRadialMax } = centerTrianglesOnRotationAxis(p.triangles)

  // Extend machinable range by overcut on each side
  const extXStart = p.machXStartMm - overcutMm
  const extXEnd = p.machXEndMm + overcutMm
  const extSpanX = extXEnd - extXStart

  const targetStepX = Math.max(0.1, p.stepXMm)
  let nx = Math.max(2, Math.ceil(extSpanX / targetStepX) + 1)
  let na = Math.max(4, Math.ceil(360 / stepA))
  const maxCells = Math.max(100, Math.min(200_000, p.maxCells ?? 50_000))
  while (nx * na > maxCells && nx > 2) nx--
  while (nx * na > maxCells && na > 4) na--

  const allowance = Math.max(0, p.finishAllowanceMm ?? 0)

  const lines: string[] = []
  const actualStepADeg = 360 / na
  const actualDx = extSpanX / Math.max(1, nx - 1)

  // Step 1: Compute mesh-aware depth levels
  // Default zStepMm from the spacing of provided depths, or auto
  const providedStep = p.zDepthsMm.length >= 2
    ? Math.abs(p.zDepthsMm[0]! - p.zDepthsMm[1]!)
    : 0
  const userZPass = Math.min(...p.zDepthsMm) // deepest requested depth
  const zStepMm = providedStep > 0.1 ? providedStep : 2

  // If mesh is inside stock, auto-compute depths to reach it
  let allDepths: number[]
  if (meshRadialMax > 0.1 && meshRadialMax < stockR - 0.1) {
    allDepths = computeMeshAwareDepths(meshRadialMax, stockR, zStepMm, userZPass)
  } else {
    // Fallback: use provided depths
    allDepths = [...p.zDepthsMm].sort((a, b) => b - a)
  }

  lines.push(
    `; 4-axis cylindrical MESH raster — R=${stockR.toFixed(1)}mm (Ø${(stockR * 2).toFixed(1)}), ` +
    `X=[${p.machXStartMm.toFixed(2)}..${p.machXEndMm.toFixed(2)}] +overcut ${overcutMm.toFixed(1)}mm, ` +
    `A step≈${actualStepADeg.toFixed(2)}° (grid ${nx}×${na}), Z levels=${allDepths.length}, ` +
    `tool Ø${toolD.toFixed(2)}mm`
  )
  lines.push(
    `; Auto-centered mesh: offset Y=${offsetY.toFixed(2)} Z=${offsetZ.toFixed(2)}, ` +
    `mesh max radius=${meshRadialMax.toFixed(2)}mm`
  )
  lines.push(`; Depth levels: ${allDepths.map(d => d.toFixed(2)).join(', ')}`)
  lines.push('; Algorithm: cylindrical heightmap + tool-radius compensation + surface-offset roughing')
  lines.push('; VERIFY: cylinder diameter; A home')

  // Step 2: Build cylindrical heightmap from CENTERED triangles
  const hm = buildCylindricalHeightmap(
    centered, stockR, extXStart, extXEnd, nx, na
  )

  // Verify we got hits
  let hitCount = 0
  for (let i = 0; i < hm.radii.length; i++) {
    if (hm.radii[i]! !== NO_HIT) hitCount++
  }
  lines.push(`; Heightmap: ${hitCount}/${hm.radii.length} cells hit (${(hitCount / hm.radii.length * 100).toFixed(1)}%)`)

  // Step 3: Apply tool radius compensation
  const compensated = applyToolRadiusCompensation(hm, toolR, stockR)

  // Step 4: Compute per-angle X extents with overcut (used for finishing only)
  const overcutCells = Math.max(1, Math.ceil(overcutMm / actualDx))
  const xExtents = computePerAngleXExtents(hm, overcutCells)

  // Separate into roughing and finishing
  const enableFinish = p.enableFinishPass === true || (p.enableFinishPass !== false && allDepths.length > 1)
  const roughingDepths = enableFinish ? allDepths.slice(0, -1) : allDepths
  const finishDepth = enableFinish ? allDepths[allDepths.length - 1]! : null

  let passNum = 0

  // ── Roughing: Surface-offset passes ─────────────────────────────────────
  //
  // Each roughing layer uses a HYBRID strategy:
  //   - Where mesh EXISTS: surface-offset cuts that follow the model shape,
  //     progressively approaching the mesh surface with each layer.
  //   - Where NO mesh exists (within the part's X span): waterline cuts at
  //     the current depth level to clear stock around the model.
  //
  // This produces toolpaths that both reveal the 3D model shape AND remove
  // all surrounding stock material.

  // Inter-pass clearance: just above stock surface (fast repositioning).
  // Full safe retract (clearZ) only used between depth levels and at program start/end.
  const interPassZ = stockR + Math.min(2, p.safeZMm)

  for (let di = 0; di < roughingDepths.length; di++) {
    const zd = roughingDepths[di]!
    const targetCutR = stockR + zd // radial position to cut (zd is negative)
    if (targetCutR < 0.05) continue

    // Fraction through roughing: 0 = first (shallowest), 1 = last (deepest)
    const frac = roughingDepths.length > 1
      ? di / (roughingDepths.length - 1)
      : 1

    lines.push(`; ─── Roughing: depth ${zd.toFixed(3)}mm (target R=${targetCutR.toFixed(3)}mm, frac=${frac.toFixed(2)}) ───`)

    // Full retract at the START of each depth level
    lines.push(`G0 Z${clearZ.toFixed(3)}`)

    let firstPassAtDepth = true

    for (let ia = 0; ia < na; ia++) {
      const aDeg = ia * actualStepADeg

      const passPoints: Array<{ x: number; cutZ: number }> = []

      // Roughing spans the FULL machinable X range at every angle.
      // The stock is a full cylinder — all material within the X range
      // needs to be cleared at each depth level.
      for (let ix = 0; ix < nx; ix++) {
        const x = extXStart + ix * actualDx
        const compR = compensated[ix * na + ia]!

        let cutZ: number
        if (compR === NO_HIT) {
          // No mesh here — clear stock at the current waterline depth.
          cutZ = targetCutR
        } else {
          // Mesh exists — surface-offset roughing.
          const surfaceLimit = compR + allowance
          const gap = stockR - surfaceLimit
          const surfaceOffsetR = surfaceLimit + gap * (1 - frac)
          cutZ = Math.max(surfaceLimit, Math.min(surfaceOffsetR, stockR - 0.01))
        }

        if (cutZ < 0.05) continue
        if (cutZ >= stockR - 0.01) continue

        passPoints.push({ x, cutZ })
      }

      if (passPoints.length < 2) continue

      passNum++
      if (passNum % 2 === 0) passPoints.reverse()

      lines.push(`; Pass ${passNum}: A=${aDeg.toFixed(1)}° rough offset_frac=${frac.toFixed(2)}`)

      if (firstPassAtDepth) {
        // First pass at this depth: already at clearZ from the depth-level retract
        lines.push(`G0 A${aDeg.toFixed(3)}`)
        lines.push(`G0 X${passPoints[0]!.x.toFixed(3)}`)
        lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)
        firstPassAtDepth = false
      } else {
        // Subsequent passes at same depth: lift just above stock, reposition, drop
        lines.push(`G0 Z${interPassZ.toFixed(3)}`)
        lines.push(`G0 A${aDeg.toFixed(3)} X${passPoints[0]!.x.toFixed(3)}`)
        lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)
      }

      for (let i = 1; i < passPoints.length; i++) {
        const pt = passPoints[i]!
        const prev = passPoints[i - 1]!
        const zChange = Math.abs(pt.cutZ - prev.cutZ)
        if (zChange > 0.005) {
          lines.push(`G1 X${pt.x.toFixed(3)} Z${pt.cutZ.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
        } else {
          lines.push(`G1 X${pt.x.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
        }
      }
    }
  }

  // ── Finishing pass ──────────────────────────────────────────────────────

  if (finishDepth != null) {
    const finishTargetR = stockR + finishDepth
    if (finishTargetR >= 0.05) {
      const finishStepDeg = Math.max(0.5, p.finishStepoverDeg ?? stepA / 2)
      const finishNa = Math.max(4, Math.ceil(360 / finishStepDeg))
      const finishDaDeg = 360 / finishNa

      lines.push(
        `; ─── Finishing pass: target R=${finishTargetR.toFixed(3)}mm, ` +
        `A step=${finishDaDeg.toFixed(2)}° (${finishNa} passes) ───`
      )

      // Rebuild heightmap at finer angular resolution if needed
      let finishHm = hm
      let finishComp = compensated
      let finishNaActual = na
      if (finishNa > na) {
        let finishNx = nx
        const finishMaxCells = Math.max(maxCells, 80_000)
        while (finishNx * finishNa > finishMaxCells && finishNx > 2) finishNx--
        finishHm = buildCylindricalHeightmap(
          centered, stockR, extXStart, extXEnd, finishNx, finishNa
        )
        finishComp = applyToolRadiusCompensation(finishHm, toolR, stockR)
        finishNaActual = finishNa
      } else {
        finishNaActual = na
      }

      const finishExtents = computePerAngleXExtents(finishHm, overcutCells)

      // Full retract once at the start of finishing
      lines.push(`G0 Z${clearZ.toFixed(3)}`)
      let firstFinishPass = true

      for (let ia = 0; ia < finishNaActual; ia++) {
        const [xIdxStart, xIdxEnd] = finishExtents[ia]!
        if (xIdxStart === -1) continue

        const aDeg = ia * (360 / finishNaActual)

        const passPoints: Array<{ x: number; cutZ: number }> = []

        for (let ix = xIdxStart; ix <= xIdxEnd; ix++) {
          const x = finishHm.xStart + ix * finishHm.dx
          const compR = finishComp[ix * finishNaActual + ia]!

          let cutZ: number
          if (compR === NO_HIT) {
            cutZ = finishTargetR
          } else {
            cutZ = Math.max(finishTargetR, compR)
          }

          if (cutZ < 0.05) continue
          if (cutZ >= stockR - 0.01) continue

          passPoints.push({ x, cutZ })
        }

        if (passPoints.length < 2) continue

        passNum++
        if (passNum % 2 === 0) passPoints.reverse()

        lines.push(`; Finish ${passNum}: A=${aDeg.toFixed(1)}°`)

        if (firstFinishPass) {
          lines.push(`G0 A${aDeg.toFixed(3)}`)
          lines.push(`G0 X${passPoints[0]!.x.toFixed(3)}`)
          lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)
          firstFinishPass = false
        } else {
          lines.push(`G0 Z${interPassZ.toFixed(3)}`)
          lines.push(`G0 A${aDeg.toFixed(3)} X${passPoints[0]!.x.toFixed(3)}`)
          lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)
        }

        for (let i = 1; i < passPoints.length; i++) {
          const pt = passPoints[i]!
          const prev = passPoints[i - 1]!
          if (Math.abs(pt.cutZ - prev.cutZ) > 0.005) {
            lines.push(`G1 X${pt.x.toFixed(3)} Z${pt.cutZ.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
          } else {
            lines.push(`G1 X${pt.x.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
          }
        }
      }
    }
  }

  lines.push(`G0 Z${clearZ.toFixed(3)}`)
  lines.push('G0 A0 ; return A to home')
  return lines
}
