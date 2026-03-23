import type { ToolpathSegment3 } from './cam-gcode-toolpath'

export type HeightField2d5 = {
  originX: number
  originY: number
  cellMm: number
  cols: number
  rows: number
  /** Remaining solid top Z (mm); lowered under the tool envelope along cutting segments. */
  topZ: Float32Array
  stockTopZ: number
}

export type BuildHeightFieldOptions = {
  toolRadiusMm: number
  /** Upper bound on grid resolution (performance). */
  maxCols?: number
  maxRows?: number
  /** Initial planar stock top Z before cuts. */
  stockTopZ?: number
  /** Ignore feed segments entirely above this Z (air moves near stock top). */
  cuttingZThreshold?: number
  marginMm?: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function stampDisk(
  field: { originX: number; originY: number; cellMm: number; cols: number; rows: number; topZ: Float32Array; stockTopZ: number },
  cx: number,
  cy: number,
  cutZ: number,
  radiusMm: number
): void {
  const { originX, originY, cellMm, cols, rows, topZ } = field
  const rCells = Math.ceil(radiusMm / cellMm) + 1
  const ic = Math.floor((cx - originX) / cellMm)
  const jc = Math.floor((cy - originY) / cellMm)
  for (let dj = -rCells; dj <= rCells; dj++) {
    for (let di = -rCells; di <= rCells; di++) {
      const i = ic + di
      const j = jc + dj
      if (i < 0 || j < 0 || i >= cols || j >= rows) continue
      const px = originX + (i + 0.5) * cellMm
      const py = originY + (j + 0.5) * cellMm
      if (Math.hypot(px - cx, py - cy) > radiusMm + 1e-6) continue
      const idx = j * cols + i
      const cur = topZ[idx]!
      if (cutZ < cur) topZ[idx] = cutZ
    }
  }
}

function stampSegment(
  field: Parameters<typeof stampDisk>[0],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  radiusMm: number
): void {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const step = Math.max(field.cellMm * 0.35, 0.05)
  const n = Math.max(1, Math.ceil(len / step))
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const x = x0 + t * (x1 - x0)
    const y = y0 + t * (y1 - y0)
    const z = z0 + t * (z1 - z0)
    stampDisk(field, x, y, z, radiusMm)
  }
}

/**
 * Approximate 2.5D stock top after passes: stamps a cylindrical tool footprint along **feed** segments
 * whose depth goes below {@link BuildHeightFieldOptions.cuttingZThreshold}.
 */
export function buildHeightFieldFromCuttingSegments(
  segments: ReadonlyArray<ToolpathSegment3>,
  opts: BuildHeightFieldOptions
): HeightField2d5 | null {
  const toolRadiusMm = Math.max(0.05, opts.toolRadiusMm)
  const maxCols = opts.maxCols ?? 96
  const maxRows = opts.maxRows ?? 96
  const stockTopZ = opts.stockTopZ ?? 0
  const cuttingZThreshold = opts.cuttingZThreshold ?? 0.05
  const marginMm = opts.marginMm ?? toolRadiusMm + 1

  const cutting = segments.filter(
    (s) =>
      s.kind === 'feed' &&
      (Math.min(s.z0, s.z1) < cuttingZThreshold || Math.max(s.z0, s.z1) < cuttingZThreshold)
  )
  if (cutting.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of cutting) {
    minX = Math.min(minX, s.x0, s.x1)
    minY = Math.min(minY, s.y0, s.y1)
    maxX = Math.max(maxX, s.x0, s.x1)
    maxY = Math.max(maxY, s.y0, s.y1)
  }
  minX -= marginMm
  minY -= marginMm
  maxX += marginMm
  maxY += marginMm

  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!(spanX > 1e-6) || !(spanY > 1e-6)) return null

  let cellMm = Math.max(spanX / maxCols, spanY / maxRows, 0.1)
  let cols = Math.ceil(spanX / cellMm)
  let rows = Math.ceil(spanY / cellMm)
  if (cols > maxCols) {
    cellMm = spanX / maxCols
    cols = maxCols
    rows = Math.ceil(spanY / cellMm)
  }
  if (rows > maxRows) {
    cellMm = Math.max(cellMm, spanY / maxRows)
    rows = maxRows
    cols = Math.ceil(spanX / cellMm)
  }
  cols = clamp(cols, 2, maxCols)
  rows = clamp(rows, 2, maxRows)
  cellMm = Math.max(spanX / cols, spanY / rows, 0.1)

  const originX = minX
  const originY = minY
  const topZ = new Float32Array(cols * rows)
  topZ.fill(stockTopZ)

  const field = { originX, originY, cellMm, cols, rows, topZ, stockTopZ }

  for (const s of cutting) {
    stampSegment(field, s.x0, s.y0, s.x1, s.y1, s.z0, s.z1, toolRadiusMm)
  }

  return { originX, originY, cellMm, cols, rows, topZ, stockTopZ }
}
