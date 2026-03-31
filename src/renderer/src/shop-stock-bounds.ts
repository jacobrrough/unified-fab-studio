/**
 * Pure helpers for Shop viewport: model AABB in Three.js space vs stock (flat block or 4/5-axis cylinder).
 * Must stay aligned with applyTransform in ShopModelViewer.tsx.
 */
import type { ModelTransform } from './ShopModelViewer'

export type MachineUIMode = 'fdm' | 'cnc_2d' | 'cnc_3d' | 'cnc_4axis' | 'cnc_5axis'

/** Carvera 4th-axis rotation axis height above spoilboard — must match AXIS_Y in ShopModelViewer buildFourAxisRig. */
export const CARVERA_AXIS_Y = 55

/**
 * Eight corners of the model in Three.js world space after rotation, scale, and position
 * (same mapping as applyTransform).
 */
export function computeModelCornerWorldPointsInThreeJS(
  modelSz: { x: number; y: number; z: number },
  t: ModelTransform
): [number, number, number][] {
  const DEG = Math.PI / 180
  const ex = t.rotation.x * DEG
  const ey = t.rotation.z * DEG
  const ez = t.rotation.y * DEG
  const scX = t.scale.x
  const scY = t.scale.z
  const scZ = t.scale.y
  const [cX, sX] = [Math.cos(ex), Math.sin(ex)]
  const [cY, sY] = [Math.cos(ey), Math.sin(ey)]
  const [cZ, sZ] = [Math.cos(ez), Math.sin(ez)]
  const hx = modelSz.x / 2
  const hy = modelSz.y / 2
  const hz = modelSz.z / 2
  const pts: [number, number, number][] = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [-hx, hy, -hz],
    [hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [-hx, hy, hz],
    [hx, hy, hz]
  ]
  const out: [number, number, number][] = []
  for (const [x, y, z] of pts) {
    const x1 = x * cZ - y * sZ
    const y1 = x * sZ + y * cZ
    const z1 = z
    const x2 = x1 * cY + z1 * sY
    const y2 = y1
    const z2 = -x1 * sY + z1 * cY
    const x3 = x2
    const y3 = y2 * cX - z2 * sX
    const z3 = y2 * sX + z2 * cX
    const fx = x3 * scX + t.position.x
    const fy = y3 * scY + t.position.z
    const fz = z3 * scZ + t.position.y
    out.push([fx, fy, fz])
  }
  return out
}

export function computeModelBoundsInThreeJS(
  modelSz: { x: number; y: number; z: number },
  t: ModelTransform
): { loX: number; hiX: number; loY: number; hiY: number; loZ: number; hiZ: number } {
  const corners = computeModelCornerWorldPointsInThreeJS(modelSz, t)
  let loX = Infinity
  let hiX = -Infinity
  let loY = Infinity
  let hiY = -Infinity
  let loZ = Infinity
  let hiZ = -Infinity
  for (const [fx, fy, fz] of corners) {
    loX = Math.min(loX, fx)
    hiX = Math.max(hiX, fx)
    loY = Math.min(loY, fy)
    hiY = Math.max(hiY, fy)
    loZ = Math.min(loZ, fz)
    hiZ = Math.max(hiZ, fz)
  }
  return { loX, hiX, loY, hiY, loZ, hiZ }
}

const FIT_EPS = 0.5

/**
 * Returns true when the model (at its current transform) is fully inside the stock.
 * Flat modes: stock AABB X=[-sx/2,sx/2], Y=[0,sz], Z=[-sy/2,sy/2].
 * Rotary (4/5-axis): machinable cylinder segment along X, radius stock.y/2, axis at (Y,Z)=(CARVERA_AXIS_Y,0).
 */
export function modelFitsInStock(
  modelSz: { x: number; y: number; z: number },
  t: ModelTransform,
  stock: { x: number; y: number; z: number },
  mode: MachineUIMode,
  opts?: { chuckDepthMm?: number; clampOffsetMm?: number }
): boolean {
  const eps = FIT_EPS
  const isRotary = mode === 'cnc_4axis' || mode === 'cnc_5axis'
  if (isRotary) {
    const chuckDep = opts?.chuckDepthMm ?? 0
    const clampOff = opts?.clampOffsetMm ?? 0
    const unusable = chuckDep + clampOff
    const halfLen = stock.x / 2
    const xMin = -halfLen + unusable - eps
    const xMax = halfLen + eps
    const R = stock.y / 2 + eps
    const corners = computeModelCornerWorldPointsInThreeJS(modelSz, t)
    for (const [fx, fy, fz] of corners) {
      if (fx < xMin || fx > xMax) return false
      const dy = fy - CARVERA_AXIS_Y
      const dz = fz
      if (dy * dy + dz * dz > R * R) return false
    }
    return true
  }
  const { loX, hiX, loY, hiY, loZ, hiZ } = computeModelBoundsInThreeJS(modelSz, t)
  return (
    loX >= -stock.x / 2 - eps &&
    hiX <= stock.x / 2 + eps &&
    loY >= -eps &&
    hiY <= stock.z + eps &&
    loZ >= -stock.y / 2 - eps &&
    hiZ <= stock.y / 2 + eps
  )
}

export function fitModelToStock(
  modelSz: { x: number; y: number; z: number },
  stock: { x: number; y: number; z: number },
  mode?: MachineUIMode,
  opts?: { chuckDepthMm?: number; clampOffsetMm?: number }
): Pick<ModelTransform, 'position' | 'rotation' | 'scale'> {
  const { x: Wx, y: Wy, z: Wz } = modelSz
  type Rot = ModelTransform['rotation']
  const orientations: { dims: [number, number, number]; rot: Rot }[] = [
    { dims: [Wx, Wy, Wz], rot: { x: 0, y: 0, z: 0 } },
    { dims: [Wx, Wz, Wy], rot: { x: 90, y: 0, z: 0 } },
    { dims: [Wz, Wy, Wx], rot: { x: 0, y: 0, z: 90 } },
    { dims: [Wy, Wx, Wz], rot: { x: 0, y: 90, z: 0 } },
    { dims: [Wy, Wz, Wx], rot: { x: 90, y: 90, z: 0 } },
    { dims: [Wz, Wx, Wy], rot: { x: 0, y: 90, z: 90 } }
  ]

  const is4Axis = mode === 'cnc_4axis' || mode === 'cnc_5axis'

  if (is4Axis) {
    const chuckDep = opts?.chuckDepthMm ?? 0
    const clampOff = opts?.clampOffsetMm ?? 0
    const unusable = chuckDep + clampOff
    const usableLen = Math.max(1, stock.x - unusable)
    const xCenter = unusable / 2

    let bestScale = -1
    let bestRot: Rot = { x: 0, y: 0, z: 0 }
    for (const { dims: [dx, dy, dz], rot } of orientations) {
      if (!dx || !dy || !dz) continue
      const sX = usableLen / dx
      const sYZ = stock.y / Math.sqrt(dy * dy + dz * dz)
      const s = Math.min(sX, sYZ)
      if (s > bestScale) {
        bestScale = s
        bestRot = rot
      }
    }
    const s = Math.max(0.001, bestScale)
    return {
      position: { x: xCenter, y: 0, z: CARVERA_AXIS_Y },
      rotation: bestRot,
      scale: { x: s, y: s, z: s }
    }
  }

  let bestScale = -1
  let bestRot: Rot = { x: 0, y: 0, z: 0 }
  for (const { dims: [dx, dy, dz], rot } of orientations) {
    if (!dx || !dy || !dz) continue
    const s = Math.min(stock.x / dx, stock.z / dy, stock.y / dz)
    if (s > bestScale) {
      bestScale = s
      bestRot = rot
    }
  }
  const s = Math.max(0.001, bestScale)
  return {
    position: { x: 0, y: 0, z: stock.z / 2 },
    rotation: bestRot,
    scale: { x: s, y: s, z: s }
  }
}
