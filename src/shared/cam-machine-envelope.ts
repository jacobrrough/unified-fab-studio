import type { ToolpathSegment3 } from './cam-gcode-toolpath'

export type MachineEnvelopeBoundsGcode = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export type MachineEnvelopeViolation = {
  axis: 'x' | 'y' | 'z'
  kind: 'below_min' | 'above_max'
  /** Positive distance outside the allowed range (mm). */
  excessMm: number
}

export type MachineEnvelopeCheck = {
  withinEnvelope: boolean
  bounds: MachineEnvelopeBoundsGcode | null
  violations: MachineEnvelopeViolation[]
}

/**
 * Axis extents of all segment endpoints in G-code coordinates (mm).
 */
export function computeToolpathBoundsFromSegments(segments: ToolpathSegment3[]): MachineEnvelopeBoundsGcode | null {
  if (segments.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const consider = (x: number, y: number, z: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  for (const s of segments) {
    consider(s.x0, s.y0, s.z0)
    consider(s.x1, s.y1, s.z1)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/**
 * Compare parsed toolpath bounds to machine profile work volume [0, wx] × [0, wy] × [0, wz] in the same G-code space.
 * Does not model fixtures, WCS offsets, or rotary axes — profile-based orientation only.
 */
export function compareToolpathToMachineEnvelope(
  segments: ToolpathSegment3[],
  workAreaMm: { x: number; y: number; z: number }
): MachineEnvelopeCheck {
  const bounds = computeToolpathBoundsFromSegments(segments)
  if (!bounds) {
    return { withinEnvelope: true, bounds: null, violations: [] }
  }

  const violations: MachineEnvelopeViolation[] = []
  const { x: wx, y: wy, z: wz } = workAreaMm

  if (bounds.minX < 0) violations.push({ axis: 'x', kind: 'below_min', excessMm: -bounds.minX })
  if (bounds.maxX > wx) violations.push({ axis: 'x', kind: 'above_max', excessMm: bounds.maxX - wx })
  if (bounds.minY < 0) violations.push({ axis: 'y', kind: 'below_min', excessMm: -bounds.minY })
  if (bounds.maxY > wy) violations.push({ axis: 'y', kind: 'above_max', excessMm: bounds.maxY - wy })
  if (bounds.minZ < 0) violations.push({ axis: 'z', kind: 'below_min', excessMm: -bounds.minZ })
  if (bounds.maxZ > wz) violations.push({ axis: 'z', kind: 'above_max', excessMm: bounds.maxZ - wz })

  return {
    withinEnvelope: violations.length === 0,
    bounds,
    violations
  }
}
