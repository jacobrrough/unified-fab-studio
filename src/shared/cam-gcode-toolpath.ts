/**
 * Lightweight G0/G1 parser for CAM preview (absolute XYZ, mm-style numbers).
 * Ignores canned cycles and non-motion blocks — use for toolpath / 2.5D proxy only.
 */

export type ToolpathMotionKind = 'rapid' | 'feed'

export type ToolpathSegment3 = {
  kind: ToolpathMotionKind
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
}

function readAxis(line: string, axis: 'X' | 'Y' | 'Z'): number | null {
  const m = line.match(new RegExp(`${axis}(-?\\d+(?:\\.\\d+)?)`))
  if (!m) return null
  const n = Number.parseFloat(m[1] ?? '')
  return Number.isFinite(n) ? n : null
}

export function extractToolpathSegmentsFromGcode(gcode: string): ToolpathSegment3[] {
  const lines = gcode
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(';'))

  const state = { x: 0, y: 0, z: 0 }
  const segs: ToolpathSegment3[] = []

  for (const line of lines) {
    if (!/^(G0|G00|G1|G01)\b/i.test(line)) continue
    const isRapid = /^G0\b/i.test(line) || /^G00\b/i.test(line)
    const nx = readAxis(line, 'X') ?? state.x
    const ny = readAxis(line, 'Y') ?? state.y
    const nz = readAxis(line, 'Z') ?? state.z
    segs.push({
      kind: isRapid ? 'rapid' : 'feed',
      x0: state.x,
      y0: state.y,
      z0: state.z,
      x1: nx,
      y1: ny,
      z1: nz
    })
    state.x = nx
    state.y = ny
    state.z = nz
  }

  return segs
}

/** Default cylinder diameter (mm) for 4-axis preview when params omit it — matches `cam-runner` / `axis4_toolpath.py`. */
export const DEFAULT_4AXIS_CYLINDER_DIAMETER_MM = 50

export function isManufactureKind4AxisForPreview(kind: string | undefined): boolean {
  return kind === 'cnc_4axis_wrapping' || kind === 'cnc_4axis_indexed'
}

export function resolve4AxisCylinderDiameterMm(params: unknown): number {
  if (!params || typeof params !== 'object') return DEFAULT_4AXIS_CYLINDER_DIAMETER_MM
  const d = (params as Record<string, unknown>).cylinderDiameterMm
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) return d
  return DEFAULT_4AXIS_CYLINDER_DIAMETER_MM
}

/**
 * Map 4-axis engine radial Z (distance from rotation axis) to mill-style Z for preview
 * (stock top ≈ 0, cuts negative). Does not change emitted G-code.
 */
export function apply4AxisRadialZToMillPreviewSegments(
  segments: ToolpathSegment3[],
  cylinderDiameterMm: number
): ToolpathSegment3[] {
  const r = cylinderDiameterMm * 0.5
  if (!(r > 0) || !Number.isFinite(r)) return segments
  return segments.map((s) => ({
    ...s,
    z0: s.z0 - r,
    z1: s.z1 - r
  }))
}

/** One contiguous polyline in G-code space (mm), grouped by motion kind. */
export type ToolpathPathChain = {
  kind: ToolpathMotionKind
  points: { x: number; y: number; z: number }[]
}

function gcodePointsEqual(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz < 1e-10
}

/**
 * Merge consecutive G0/G1 segments that share an endpoint into polylines (same kind only).
 * Discontinuous jumps start a new chain.
 */
export function buildContiguousPathChains(segments: ToolpathSegment3[]): ToolpathPathChain[] {
  if (segments.length === 0) return []
  const chains: ToolpathPathChain[] = []
  for (const s of segments) {
    const a = { x: s.x0, y: s.y0, z: s.z0 }
    const b = { x: s.x1, y: s.y1, z: s.z1 }
    const last = chains[chains.length - 1]
    if (last && last.kind === s.kind) {
      const prev = last.points[last.points.length - 1]!
      if (gcodePointsEqual(prev, a)) {
        last.points.push(b)
      } else {
        chains.push({ kind: s.kind, points: [a, b] })
      }
    } else {
      chains.push({ kind: s.kind, points: [a, b] })
    }
  }
  return chains
}

function segmentLengthMm(s: ToolpathSegment3): number {
  const dx = s.x1 - s.x0
  const dy = s.y1 - s.y0
  const dz = s.z1 - s.z0
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export type ToolpathLengthSampler = {
  /** Total polyline length in mm (sum of segment lengths). */
  totalMm: number
  /** Position after travelling a distance `d` mm from the start of the first segment (clamped). */
  atDistanceMm: (d: number) => { x: number; y: number; z: number }
  /** Unit parameter u in [0,1] → position along path by arc length. */
  atUnit: (u: number) => { x: number; y: number; z: number }
}

/**
 * Arc-length parameterization of the toolpath polyline (endpoints of each G0/G1 segment, in order).
 */
export function buildToolpathLengthSampler(segments: ToolpathSegment3[]): ToolpathLengthSampler {
  if (segments.length === 0) {
    const z = { x: 0, y: 0, z: 0 }
    return {
      totalMm: 0,
      atDistanceMm: () => z,
      atUnit: () => z
    }
  }

  const points: { x: number; y: number; z: number }[] = []
  const first = segments[0]!
  points.push({ x: first.x0, y: first.y0, z: first.z0 })
  for (const s of segments) {
    points.push({ x: s.x1, y: s.y1, z: s.z1 })
  }

  const legLengths: number[] = []
  let totalMm = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    legLengths.push(len)
    totalMm += len
  }

  const atDistanceMm = (d: number): { x: number; y: number; z: number } => {
    if (totalMm <= 0 || legLengths.length === 0) return { ...points[0]! }
    let dist = Math.max(0, Math.min(d, totalMm))
    let i = 0
    while (i < legLengths.length && dist > legLengths[i]! + 1e-9) {
      dist -= legLengths[i]!
      i++
    }
    if (i >= legLengths.length) {
      const last = points[points.length - 1]!
      return { x: last.x, y: last.y, z: last.z }
    }
    const a = points[i]!
    const b = points[i + 1]!
    const L = legLengths[i]!
    if (L < 1e-12) return { x: b.x, y: b.y, z: b.z }
    const t = dist / L
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      z: a.z + t * (b.z - a.z)
    }
  }

  const atUnit = (u: number): { x: number; y: number; z: number } => {
    const t = Math.max(0, Math.min(1, u))
    return atDistanceMm(t * totalMm)
  }

  return { totalMm, atDistanceMm, atUnit }
}

/** Sum of G0/G1 segment lengths (mm). */
export function totalToolpathLengthMm(segments: ToolpathSegment3[]): number {
  let s = 0
  for (const seg of segments) s += segmentLengthMm(seg)
  return s
}
