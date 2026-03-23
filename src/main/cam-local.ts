import type { StlBounds, Vec3 } from './stl'

export type ParallelFinishParams = {
  bounds: StlBounds
  /** Pass depth below top of stock (mm), negative into material */
  zPassMm: number
  stepoverMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
}

/**
 * Naive parallel XZ passes at fixed Y steps — for regression / demo when OpenCAMLib is unavailable.
 * Not industrial surfacing; produces valid G1 moves within mesh XY bounds.
 */
export function generateParallelFinishLines(params: ParallelFinishParams): string[] {
  const { bounds, zPassMm, stepoverMm, feedMmMin, plungeMmMin, safeZMm } = params
  const [minX, minY] = bounds.min
  const [maxX, maxY] = bounds.max
  const lines: string[] = []
  const zWork = zPassMm

  let y = minY
  let flip = false
  while (y <= maxY + 1e-6) {
    const x0 = flip ? maxX : minX
    const x1 = flip ? minX : maxX
    lines.push(`G0 Z${safeZMm.toFixed(3)}`)
    lines.push(`G0 X${x0.toFixed(3)} Y${y.toFixed(3)}`)
    lines.push(`G1 Z${zWork.toFixed(3)} F${plungeMmMin.toFixed(0)}`)
    lines.push(`G1 X${x1.toFixed(3)} Y${y.toFixed(3)} F${feedMmMin.toFixed(0)}`)
    flip = !flip
    y += stepoverMm
  }
  lines.push(`G0 Z${safeZMm.toFixed(3)}`)
  return lines
}

/** Cross-like sign for barycentric inside test: sign(P, A, B). */
function triSign(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by)
}

function pointInTriangle2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const d1 = triSign(px, py, ax, ay, bx, by)
  const d2 = triSign(px, py, bx, by, cx, cy)
  const d3 = triSign(px, py, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** Upper Z on triangle plane at (px,py); null if nearly vertical or outside (caller filters outside). */
function zOnTrianglePlane(px: number, py: number, v0: Vec3, v1: Vec3, v2: Vec3): number | null {
  const [x0, y0, z0] = v0
  const [x1, y1, z1] = v1
  const [x2, y2, z2] = v2
  const ux = x1 - x0
  const uy = y1 - y0
  const uz = z1 - z0
  const vx = x2 - x0
  const vy = y2 - y0
  const vz = z2 - z0
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  if (Math.abs(nz) < 1e-9) return null
  const z = z0 - (nx * (px - x0) + ny * (py - y0)) / nz
  return Number.isFinite(z) ? z : null
}

export function heightAtXyFromTriangles(triangles: ReadonlyArray<readonly [Vec3, Vec3, Vec3]>, px: number, py: number): number | null {
  let best: number | null = null
  for (const [v0, v1, v2] of triangles) {
    const [x0, y0] = v0
    const [x1, y1] = v1
    const [x2, y2] = v2
    if (!pointInTriangle2d(px, py, x0, y0, x1, y1, x2, y2)) continue
    const z = zOnTrianglePlane(px, py, v0, v1, v2)
    if (z == null) continue
    if (best == null || z > best) best = z
  }
  return best
}

export type MeshHeightRasterParams = {
  triangles: ReadonlyArray<readonly [Vec3, Vec3, Vec3]>
  minX: number
  maxX: number
  minY: number
  maxY: number
  stepoverMm: number
  sampleStepMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
}

/**
 * XY zigzag raster with Z from a 2.5D upper envelope of STL triangles (no cutter offset / undercuts).
 * Caps row and column counts for large meshes.
 */
export function generateMeshHeightRasterLines(params: MeshHeightRasterParams): string[] {
  const { triangles, minX, maxX, minY, maxY, feedMmMin, plungeMmMin, safeZMm } = params
  if (triangles.length === 0 || !(maxX > minX) || !(maxY > minY)) return []

  const stepY = Math.max(0.05, params.stepoverMm)
  const rawStepX = Math.max(0.05, params.sampleStepMm)
  const maxRows = 400
  const maxCols = 450
  const spanY = maxY - minY
  const spanX = maxX - minX
  const yStride = Math.max(stepY, spanY / maxRows)
  const xStride = Math.max(rawStepX, spanX / maxCols)

  const lines: string[] = []
  let y = minY
  let flip = false
  while (y <= maxY + 1e-6) {
    const xs: number[] = []
    for (let x = minX; x <= maxX + 1e-6; x += xStride) xs.push(Math.min(x, maxX))
    if (xs.length === 0) xs.push(minX)
    if (flip) xs.reverse()

    type P = { x: number; y: number; z: number }
    const segment: P[] = []
    const flush = () => {
      if (segment.length === 0) return
      const f = segment[0]!
      lines.push(`G0 Z${safeZMm.toFixed(3)}`)
      lines.push(`G0 X${f.x.toFixed(3)} Y${f.y.toFixed(3)}`)
      lines.push(`G1 Z${f.z.toFixed(3)} F${plungeMmMin.toFixed(0)}`)
      for (let i = 1; i < segment.length; i++) {
        const p = segment[i]!
        lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F${feedMmMin.toFixed(0)}`)
      }
      segment.length = 0
    }

    for (const x of xs) {
      const z = heightAtXyFromTriangles(triangles, x, y)
      if (z == null) {
        flush()
        continue
      }
      const last = segment[segment.length - 1]
      if (last && Math.hypot(last.x - x, last.y - y) < 1e-6) continue
      segment.push({ x, y, z })
    }
    flush()

    flip = !flip
    y += yStride
  }
  lines.push(`G0 Z${safeZMm.toFixed(3)}`)
  return lines
}

export type OrthoBoundsRasterParams = ParallelFinishParams

/**
 * Constant-Z zigzag stepping in X, sweeping Y — orthogonal to {@link generateParallelFinishLines} (Y-step / X-sweep).
 */
export function generateOrthoBoundsRasterLines(params: OrthoBoundsRasterParams): string[] {
  const { bounds, zPassMm, stepoverMm, feedMmMin, plungeMmMin, safeZMm } = params
  const [minX, minY] = bounds.min
  const [maxX, maxY] = bounds.max
  const lines: string[] = []
  const zWork = zPassMm

  let x = minX
  let flip = false
  while (x <= maxX + 1e-6) {
    const y0 = flip ? maxY : minY
    const y1 = flip ? minY : maxY
    lines.push(`G0 Z${safeZMm.toFixed(3)}`)
    lines.push(`G0 X${x.toFixed(3)} Y${y0.toFixed(3)}`)
    lines.push(`G1 Z${zWork.toFixed(3)} F${plungeMmMin.toFixed(0)}`)
    lines.push(`G1 X${x.toFixed(3)} Y${y1.toFixed(3)} F${feedMmMin.toFixed(0)}`)
    flip = !flip
    x += stepoverMm
  }
  lines.push(`G0 Z${safeZMm.toFixed(3)}`)
  return lines
}

export type CamPoint2d = readonly [number, number]

export type Contour2dParams = {
  contourPoints: ReadonlyArray<CamPoint2d>
  zPassMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
  /** Climb keeps CCW ring direction; conventional flips to CW. */
  contourSide?: 'climb' | 'conventional'
  /** Optional linear lead-in distance before entering first contour point. */
  leadInMm?: number
  /** Optional linear lead-out distance after closing the contour. */
  leadOutMm?: number
}

export type Pocket2dParams = {
  contourPoints: ReadonlyArray<CamPoint2d>
  stepoverMm: number
  zPassMm: number
  /** Optional step-down increment (mm); default single depth at zPassMm. */
  zStepMm?: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
  /** Optional radial stock to leave on walls during rough pocket raster. */
  wallStockMm?: number
  /** Optional finish contour at each depth step (default false = final depth only). */
  finishEachDepth?: boolean
  /** Pocket roughing entry mode per segment. */
  entryMode?: 'plunge' | 'ramp'
  /** Ramp run length in XY (mm) when `entryMode` is `ramp`. */
  rampMm?: number
  /**
   * Max ramp angle from horizontal (degrees). XY run is lengthened (up to segment span) so that
   * atan2(|ΔZ|, run) ≤ this value when possible. Default 45.
   */
  rampMaxAngleDeg?: number
}

export type Pocket2dGenerateResult = {
  lines: string[]
  /** User-facing CAM notes (e.g. ramp geometry limits). */
  hints: string[]
}

/** Minimum XY run (mm) for a ramp from `safeZ` to target Z so incline is ≤ `maxAngleDeg` from horizontal. */
export function minRampRunForMaxAngleMm(zDropMm: number, maxAngleDeg: number): number {
  if (!(zDropMm > 0) || !Number.isFinite(zDropMm)) return 0
  const clamped = Math.min(89, Math.max(1, maxAngleDeg))
  return zDropMm / Math.tan((clamped * Math.PI) / 180)
}

export type Drill2dParams = {
  drillPoints: ReadonlyArray<CamPoint2d>
  zPassMm: number
  feedMmMin: number
  safeZMm: number
  retractMm?: number
  cycleMode?: 'g81' | 'g82' | 'g83' | 'expanded'
  peckMm?: number
  /** Optional dwell in milliseconds for G82. */
  dwellMs?: number
}

function ringBounds(points: ReadonlyArray<CamPoint2d>): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length < 3) return null
  let minX = points[0]![0]
  let minY = points[0]![1]
  let maxX = points[0]![0]
  let maxY = points[0]![1]
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** Even-odd horizontal intersections of ring at y (excluding horizontal edges). */
function horizontalSegmentsInsideRing(ring: ReadonlyArray<CamPoint2d>, y: number): Array<[number, number]> {
  if (ring.length < 3) return []
  const xs: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!
    const [x2, y2] = ring[(i + 1) % ring.length]!
    if (Math.abs(y2 - y1) < 1e-9) continue
    // Half-open to avoid double counting at vertices.
    const ymin = Math.min(y1, y2)
    const ymax = Math.max(y1, y2)
    if (!(y >= ymin && y < ymax)) continue
    const t = (y - y1) / (y2 - y1)
    xs.push(x1 + t * (x2 - x1))
  }
  xs.sort((a, b) => a - b)
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const a = xs[i]!
    const b = xs[i + 1]!
    if (b - a > 1e-6) out.push([a, b])
  }
  return out
}

function pointInRing2d(ring: ReadonlyArray<CamPoint2d>, x: number, y: number): boolean {
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distancePointToSegment2d(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-12) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const qx = ax + t * dx
  const qy = ay + t * dy
  return Math.hypot(px - qx, py - qy)
}

function minDistanceToRingEdges(ring: ReadonlyArray<CamPoint2d>, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[(i + 1) % ring.length]!
    const d = distancePointToSegment2d(x, y, ax, ay, bx, by)
    if (d < best) best = d
  }
  return best
}

function uniqueSorted(values: number[], eps = 1e-7): number[] {
  values.sort((a, b) => a - b)
  const out: number[] = []
  for (const v of values) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > eps) out.push(v)
  }
  return out
}

function rootsAtDistanceFromSegmentForY(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  y: number,
  r: number
): number[] {
  const roots: number[] = []
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const len = Math.sqrt(len2)
  const eps = 1e-9

  const endpointRoots = (xe: number, ye: number): void => {
    const yy = y - ye
    const rem = r * r - yy * yy
    if (rem < -eps) return
    const s = Math.sqrt(Math.max(0, rem))
    roots.push(xe - s, xe + s)
  }
  endpointRoots(x1, y1)
  endpointRoots(x2, y2)

  if (len <= eps) return roots

  if (Math.abs(dy) > eps) {
    const rhsBase = dx * (y - y1)
    const rhs = r * len
    const xA = x1 + (rhsBase + rhs) / dy
    const xB = x1 + (rhsBase - rhs) / dy
    for (const x of [xA, xB]) {
      const t = ((x - x1) * dx + (y - y1) * dy) / len2
      if (t >= -1e-6 && t <= 1 + 1e-6) roots.push(x)
    }
  } else if (Math.abs(Math.abs(y - y1) - r) <= 1e-6) {
    roots.push(x1, x2)
  }

  return roots
}

function horizontalSegmentsInsideInsetRing(ring: ReadonlyArray<CamPoint2d>, y: number, insetMm: number): Array<[number, number]> {
  const base = horizontalSegmentsInsideRing(ring, y)
  if (base.length === 0 || insetMm <= 1e-9) return base
  const out: Array<[number, number]> = []
  for (const [a, b] of base) {
    const candidates = [a, b]
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!
      const [x2, y2] = ring[(i + 1) % ring.length]!
      const roots = rootsAtDistanceFromSegmentForY(x1, y1, x2, y2, y, insetMm)
      for (const x of roots) {
        if (x > a + 1e-7 && x < b - 1e-7) candidates.push(x)
      }
    }
    const xs = uniqueSorted(candidates)
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i]!
      const x1 = xs[i + 1]!
      if (x1 - x0 <= 1e-6) continue
      const xm = 0.5 * (x0 + x1)
      if (!pointInRing2d(ring, xm, y)) continue
      const d = minDistanceToRingEdges(ring, xm, y)
      if (d + 1e-6 < insetMm) continue
      out.push([x0, x1])
    }
  }
  return out
}

/**
 * Z levels from surface toward {@link targetZ} when cutting negative Z (into material).
 * If {@link targetZ} ≥ 0, returns a single pass at {@link targetZ}.
 */
export function computeNegativeZDepthPasses(targetZ: number, stepDownMm: number): number[] {
  const stepDown = Math.max(0.01, Math.abs(stepDownMm))
  const depths: number[] = []
  if (targetZ < 0) {
    for (let d = -stepDown; d > targetZ + 1e-9; d -= stepDown) depths.push(d)
    depths.push(targetZ)
  } else {
    depths.push(targetZ)
  }
  return depths
}

export function generateContour2dLines(params: Contour2dParams): string[] {
  const rawRing = params.contourPoints
  let ring = [...rawRing]
  if (ring.length < 3) return []
  const signedArea = (() => {
    let a = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!
      const [x2, y2] = ring[(i + 1) % ring.length]!
      a += x1 * y2 - x2 * y1
    }
    return 0.5 * a
  })()
  if (params.contourSide === 'conventional' && signedArea > 0) ring.reverse()
  if (params.contourSide === 'climb' && signedArea < 0) ring.reverse()
  const lines: string[] = []
  const [x0, y0] = ring[0]!
  const [x1, y1] = ring[1]!
  const dx = x1 - x0
  const dy = y1 - y0
  const segLen = Math.hypot(dx, dy)
  const tx = segLen > 1e-9 ? dx / segLen : 1
  const ty = segLen > 1e-9 ? dy / segLen : 0
  const leadIn = Math.max(0, params.leadInMm ?? 0)
  const leadOut = Math.max(0, params.leadOutMm ?? 0)
  const entryX = x0 - tx * leadIn
  const entryY = y0 - ty * leadIn
  lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
  lines.push(`G0 X${entryX.toFixed(3)} Y${entryY.toFixed(3)}`)
  lines.push(`G1 Z${params.zPassMm.toFixed(3)} F${params.plungeMmMin.toFixed(0)}`)
  if (leadIn > 0) {
    lines.push(`G1 X${x0.toFixed(3)} Y${y0.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
  }
  for (let i = 1; i < ring.length; i++) {
    const [x, y] = ring[i]!
    lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
  }
  lines.push(`G1 X${x0.toFixed(3)} Y${y0.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
  if (leadOut > 0) {
    const outX = x0 + tx * leadOut
    const outY = y0 + ty * leadOut
    lines.push(`G1 X${outX.toFixed(3)} Y${outY.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
  }
  lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
  return lines
}

export function generatePocket2dLines(params: Pocket2dParams): Pocket2dGenerateResult {
  const b = ringBounds(params.contourPoints)
  if (!b || params.stepoverMm <= 0) return { lines: [], hints: [] }
  const lines: string[] = []
  const targetZ = params.zPassMm
  const stepDown = Math.max(0.01, Math.abs(params.zStepMm ?? params.zPassMm))
  const depths = computeNegativeZDepthPasses(targetZ, stepDown)
  const stock = Math.max(0, params.wallStockMm ?? 0)
  const finishEachDepth = params.finishEachDepth === true
  const entryMode = params.entryMode === 'ramp' ? 'ramp' : 'plunge'
  const rampMm = Math.max(0.01, params.rampMm ?? 2)
  const rampMaxAngleDeg =
    typeof params.rampMaxAngleDeg === 'number' && Number.isFinite(params.rampMaxAngleDeg)
      ? params.rampMaxAngleDeg
      : 45
  let rampExtendedForAngle = false
  let rampSteepDespiteSpan = false
  for (const z of depths) {
    const zDrop = Math.abs(params.safeZMm - z)
    const minRunForAngle = minRampRunForMaxAngleMm(zDrop, rampMaxAngleDeg)
    let y = b.minY
    let reverseRow = false
    while (y <= b.maxY + 1e-6) {
      const segs = horizontalSegmentsInsideInsetRing(params.contourPoints, y, stock)
      if (segs.length > 0) {
        const row = reverseRow ? [...segs].reverse() : segs
        for (let s = 0; s < row.length; s++) {
          const [a, b] = row[s]!
          if (b - a <= 1e-6) continue
          const x0 = reverseRow ? b : a
          const x1 = reverseRow ? a : b
          lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
          lines.push(`G0 X${x0.toFixed(3)} Y${y.toFixed(3)}`)
          if (entryMode === 'ramp') {
            const span = Math.abs(x1 - x0)
            const requested = Math.min(rampMm, span)
            let run: number
            if (minRunForAngle > span + 1e-6) {
              run = span
              rampSteepDespiteSpan = true
            } else {
              run = Math.min(span, Math.max(requested, minRunForAngle))
              if (run > requested + 1e-3) rampExtendedForAngle = true
            }
            const xr = reverseRow ? x0 - run : x0 + run
            lines.push(`G1 X${xr.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} F${params.plungeMmMin.toFixed(0)}`)
          } else {
            lines.push(`G1 Z${z.toFixed(3)} F${params.plungeMmMin.toFixed(0)}`)
          }
          lines.push(`G1 X${x1.toFixed(3)} Y${y.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
        }
        reverseRow = !reverseRow
      }
      y += params.stepoverMm
    }
    if (finishEachDepth) {
      lines.push(
        ...generateContour2dLines({
          contourPoints: params.contourPoints,
          zPassMm: z,
          feedMmMin: params.feedMmMin,
          plungeMmMin: params.plungeMmMin,
          safeZMm: params.safeZMm
        })
      )
    }
  }
  lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
  const hints: string[] = []
  if (entryMode === 'ramp') {
    if (rampExtendedForAngle) {
      hints.push(
        `Pocket ramp: XY run was lengthened (within each segment) to stay within rampMaxAngleDeg (${rampMaxAngleDeg.toFixed(0)}°) versus safe-Z to cut depth.`
      )
    }
    if (rampSteepDespiteSpan) {
      hints.push(
        `Pocket ramp: some segment spans are shorter than the horizontal run needed for rampMaxAngleDeg (${rampMaxAngleDeg.toFixed(0)}°); those entries may be steeper than the limit.`
      )
    }
  }
  return { lines, hints }
}

export function generateDrill2dLines(params: Drill2dParams): string[] {
  if (params.drillPoints.length === 0) return []
  /** Retract plane R in G81/G82/G83 (mm); defaults to safeZMm when retractMm omitted. */
  const r = params.retractMm ?? params.safeZMm
  const lines: string[] = []
  lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
  const mode = params.cycleMode ?? 'g81'
  const peck = typeof params.peckMm === 'number' && Number.isFinite(params.peckMm) && params.peckMm > 0 ? params.peckMm : undefined
  const dwellMs = typeof params.dwellMs === 'number' && Number.isFinite(params.dwellMs) && params.dwellMs > 0 ? params.dwellMs : undefined
  for (const [x, y] of params.drillPoints) {
    if (mode === 'expanded') {
      lines.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`)
      lines.push(`G1 Z${params.zPassMm.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
      lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
      continue
    }
    if (mode === 'g83' && peck != null) {
      lines.push(`G83 X${x.toFixed(3)} Y${y.toFixed(3)} Z${params.zPassMm.toFixed(3)} R${r.toFixed(3)} Q${peck.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
      continue
    }
    if (mode === 'g82' && dwellMs != null) {
      lines.push(`G82 X${x.toFixed(3)} Y${y.toFixed(3)} Z${params.zPassMm.toFixed(3)} R${r.toFixed(3)} P${dwellMs.toFixed(0)} F${params.feedMmMin.toFixed(0)}`)
      continue
    }
    lines.push(`G81 X${x.toFixed(3)} Y${y.toFixed(3)} Z${params.zPassMm.toFixed(3)} R${r.toFixed(3)} F${params.feedMmMin.toFixed(0)}`)
  }
  if (mode !== 'expanded') lines.push('G80')
  lines.push(`G0 Z${params.safeZMm.toFixed(3)}`)
  return lines
}
