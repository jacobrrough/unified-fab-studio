/**
 * 4-Axis Cylindrical Heightmap CAM Engine
 *
 * Generates proper rotary toolpaths using a cylindrical heightmap approach:
 *   1. Build a cylindrical heightmap by ray-casting the mesh from stock OD inward
 *   2. Apply tool-radius compensation (min-envelope over tool footprint)
 *   3. Generate continuous zigzag passes at each radial depth level (waterline roughing)
 *   4. Extend passes past material edges for clean cuts (overcut)
 *   5. Finishing passes follow the compensated surface with fine stepover
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

/** Closest hit distance from ray origin along direction vector. */
function closestRayHit(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  triangles: Triangle[]
): number | null {
  let best: number | null = null
  for (const [v0, v1, v2] of triangles) {
    const t = rayIntersectTriangle(ox, oy, oz, dx, dy, dz, v0, v1, v2)
    if (t != null && (best == null || t < best)) best = t
  }
  return best
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

      const hit = closestRayHit(x, oy, oz, 0, dy, dz, localTris)
      if (hit == null) continue

      // Compute radial distance of hit point from X-axis
      const hy = oy + hit * dy
      const hz = oz + hit * dz
      const rHit = Math.hypot(hy, hz)

      // Sanity: ignore hits that are way outside stock or at the axis
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
 * This is the shallowest (outermost) surface the tool center must respect
 * to avoid gouging into adjacent higher features.
 *
 * The tool footprint in cylindrical coords:
 *   - Axial (X): ±toolRadius
 *   - Angular: ±asin(toolRadius / currentRadius) ≈ ±(toolRadius / currentRadius) * (180/π)
 */
function applyToolRadiusCompensation(
  hm: CylindricalHeightmap,
  toolRadius: number,
  stockRadius: number
): Float32Array {
  const compensated = new Float32Array(hm.nx * hm.na).fill(NO_HIT)
  const kernelIx = Math.max(1, Math.ceil(toolRadius / Math.max(0.01, hm.dx)))
  // Angular kernel depends on radius — use stock radius for conservative estimate
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
          // Angular wraps around
          let nia = ia + dia
          if (nia < 0) nia += hm.na
          if (nia >= hm.na) nia -= hm.na

          // Check if within circular tool footprint
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

/**
 * For each angular position, find the X range where mesh exists and extend
 * it by overcutMm in both directions. Returns per-angle [xStartIdx, xEndIdx].
 */
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
      // No mesh at this angle — check neighbors to see if we should still cut
      // (for overcut into adjacent angles that have mesh)
      extents.push([-1, -1])
    } else {
      const extStart = Math.max(0, first - overcutCells)
      const extEnd = Math.min(hm.nx - 1, last + overcutCells)
      extents.push([extStart, extEnd])
    }
  }

  // Second pass: fill gaps by looking at neighboring angles
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
  /** Generate a finishing pass at the final depth (default: true when multiple z depths). */
  enableFinishPass?: boolean
  /** Finishing pass angular stepover in degrees (default: stepoverDeg / 2). */
  finishStepoverDeg?: number
}

/**
 * Generate 4-axis cylindrical toolpath using heightmap-based approach.
 *
 * Algorithm:
 * 1. Build cylindrical heightmap by ray-casting mesh
 * 2. Apply tool-radius compensation
 * 3. For each radial depth level (roughing):
 *    a. For each angular position, generate continuous X-axis passes
 *    b. Extend past material edges by overcut distance
 *    c. Cut at the deeper of (current depth level) or (compensated surface)
 *    d. Skip air regions where no material exists
 * 4. Finishing pass: follow the compensated surface at fine stepover
 */
export function generateCylindricalMeshRasterLines(p: CylindricalRasterParams): string[] {
  const stockR = Math.max(1e-6, p.cylinderRadiusMm / 2)
  const clearZ = stockR + p.safeZMm
  const toolD = p.toolDiameterMm ?? 3.175
  const toolR = toolD / 2
  const overcutMm = p.overcutMm ?? toolD
  const stepA = Math.max(0.5, Math.min(90, p.stepoverDeg))
  const spanX = Math.max(1e-6, p.machXEndMm - p.machXStartMm)

  // Extend machinable range by overcut on each side (within reason)
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

  lines.push(
    `; 4-axis cylindrical MESH raster — R=${stockR.toFixed(1)}mm (Ø${(stockR * 2).toFixed(1)}), ` +
    `X=[${p.machXStartMm.toFixed(2)}..${p.machXEndMm.toFixed(2)}] +overcut ${overcutMm.toFixed(1)}mm, ` +
    `A step≈${actualStepADeg.toFixed(2)}° (grid ${nx}×${na}), Z levels=${p.zDepthsMm.length}, ` +
    `tool Ø${toolD.toFixed(2)}mm`
  )
  lines.push('; Algorithm: cylindrical heightmap + tool-radius compensation + waterline roughing')
  lines.push('; VERIFY: STL WCS aligned with stock; cylinder diameter; A home')

  // Step 1: Build cylindrical heightmap
  const hm = buildCylindricalHeightmap(
    p.triangles, stockR, extXStart, extXEnd, nx, na
  )

  // Step 2: Apply tool radius compensation
  const compensated = applyToolRadiusCompensation(hm, toolR, stockR)

  // Step 3: Compute per-angle X extents with overcut
  const overcutCells = Math.max(1, Math.ceil(overcutMm / actualDx))
  const xExtents = computePerAngleXExtents(hm, overcutCells)

  // Separate depths into roughing and finishing
  const allDepths = [...p.zDepthsMm].sort((a, b) => b - a) // shallowest first (least negative)
  const enableFinish = p.enableFinishPass !== false && allDepths.length > 1
  const roughingDepths = enableFinish ? allDepths.slice(0, -1) : allDepths
  const finishDepth = enableFinish ? allDepths[allDepths.length - 1]! : null

  let passNum = 0

  // ── Roughing: Waterline passes ──────────────────────────────────────────

  for (const zd of roughingDepths) {
    const targetCutR = stockR + zd // radial position to cut (zd is negative)
    if (targetCutR < 0.05) continue

    lines.push(`; ─── Roughing: radial depth ${zd.toFixed(3)}mm (cut at R=${targetCutR.toFixed(3)}mm) ───`)

    for (let ia = 0; ia < na; ia++) {
      const [xIdxStart, xIdxEnd] = xExtents[ia]!
      if (xIdxStart === -1) continue // no material at this angle

      const aDeg = ia * actualStepADeg

      // Build the pass: continuous X sweep at this angle and depth
      const passPoints: Array<{ x: number; cutZ: number }> = []

      for (let ix = xIdxStart; ix <= xIdxEnd; ix++) {
        const x = extXStart + ix * actualDx
        const compR = compensated[ix * na + ia]!

        // For roughing: cut at the deeper of current depth level or compensated surface
        // (don't cut deeper than the part surface — that's what finishing is for)
        let cutZ: number
        if (compR === NO_HIT) {
          // No mesh here — cut at full depth to remove stock around the part
          // But only if we're within the overcut zone of actual material
          cutZ = targetCutR
        } else {
          // Mesh exists: cut at current roughing level, but never deeper than
          // the compensated surface + finish allowance
          const surfaceLimit = compR + allowance
          cutZ = Math.max(targetCutR, surfaceLimit)
        }

        if (cutZ < 0.05) continue
        // Don't cut if we'd be above stock (nothing to remove)
        if (cutZ >= stockR - 0.01) continue

        passPoints.push({ x, cutZ })
      }

      if (passPoints.length < 2) continue

      passNum++
      // Alternate direction for zigzag
      if (passNum % 2 === 0) passPoints.reverse()

      lines.push(`; Pass ${passNum}: A=${aDeg.toFixed(1)}° rough Z_level=${zd.toFixed(3)}`)
      lines.push(`G0 Z${clearZ.toFixed(3)}`)
      lines.push(`G0 A${aDeg.toFixed(3)}`)
      lines.push(`G0 X${passPoints[0]!.x.toFixed(3)}`)

      // Plunge to first cut depth
      lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)

      // Continuous cutting pass along X
      for (let i = 1; i < passPoints.length; i++) {
        const pt = passPoints[i]!
        const prev = passPoints[i - 1]!
        const zChange = Math.abs(pt.cutZ - prev.cutZ)
        if (zChange > 0.005) {
          // Z changes along the pass — emit XZ move
          lines.push(`G1 X${pt.x.toFixed(3)} Z${pt.cutZ.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
        } else {
          // Flat pass — X only
          lines.push(`G1 X${pt.x.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
        }
      }

      // Retract
      lines.push(`G0 Z${clearZ.toFixed(3)}`)
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
        // Build finer heightmap for finish
        let finishNx = nx
        const finishMaxCells = Math.max(maxCells, 80_000)
        while (finishNx * finishNa > finishMaxCells && finishNx > 2) finishNx--
        finishHm = buildCylindricalHeightmap(
          p.triangles, stockR, extXStart, extXEnd, finishNx, finishNa
        )
        finishComp = applyToolRadiusCompensation(finishHm, toolR, stockR)
        finishNaActual = finishNa
      } else {
        finishNaActual = na
      }

      const finishExtents = computePerAngleXExtents(finishHm, overcutCells)

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
            // Finish: follow the actual surface (with allowance already subtracted)
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
        lines.push(`G0 Z${clearZ.toFixed(3)}`)
        lines.push(`G0 A${aDeg.toFixed(3)}`)
        lines.push(`G0 X${passPoints[0]!.x.toFixed(3)}`)
        lines.push(`G1 Z${passPoints[0]!.cutZ.toFixed(3)} F${p.plungeMmMin.toFixed(0)}`)

        for (let i = 1; i < passPoints.length; i++) {
          const pt = passPoints[i]!
          const prev = passPoints[i - 1]!
          if (Math.abs(pt.cutZ - prev.cutZ) > 0.005) {
            lines.push(`G1 X${pt.x.toFixed(3)} Z${pt.cutZ.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
          } else {
            lines.push(`G1 X${pt.x.toFixed(3)} F${p.feedMmMin.toFixed(0)}`)
          }
        }

        lines.push(`G0 Z${clearZ.toFixed(3)}`)
      }
    }
  }

  lines.push(`G0 Z${clearZ.toFixed(3)}`)
  lines.push('G0 A0 ; return A to home')
  return lines
}
