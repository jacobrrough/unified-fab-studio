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
