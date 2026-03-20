/** Minimal binary STL parser (returns bounds + triangle count). */

export type StlBounds = {
  min: [number, number, number]
  max: [number, number, number]
  triangleCount: number
}

export function parseBinaryStl(buffer: Buffer): StlBounds {
  if (buffer.length < 84) {
    throw new Error('STL too small')
  }
  const triangleCount = buffer.readUInt32LE(80)
  const expected = 84 + triangleCount * 50
  if (buffer.length < expected) {
    throw new Error(`STL corrupt: expected ${expected} bytes, got ${buffer.length}`)
  }
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity
  let offset = 84
  for (let i = 0; i < triangleCount; i++) {
    offset += 12
    for (let v = 0; v < 3; v++) {
      const x = buffer.readFloatLE(offset)
      offset += 4
      const y = buffer.readFloatLE(offset)
      offset += 4
      const z = buffer.readFloatLE(offset)
      offset += 4
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
    }
    offset += 2
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    triangleCount
  }
}

export type Vec3 = readonly [number, number, number]

/** Detects ASCII STL header (`solid` …); main parser is binary-only. */
export function isLikelyAsciiStl(buffer: Buffer): boolean {
  if (buffer.length < 5) return false
  const head = buffer.subarray(0, 5).toString('ascii').toLowerCase()
  return head === 'solid'
}

/** First triangle vertices in STL model space (binary STL only). */
export function readStlFirstTriangleVertices(buffer: Buffer): [Vec3, Vec3, Vec3] | null {
  if (buffer.length < 84 || isLikelyAsciiStl(buffer)) return null
  const triangleCount = buffer.readUInt32LE(80)
  if (triangleCount < 1) return null
  let o = 84 + 12
  const readV = (): Vec3 => {
    const x = buffer.readFloatLE(o)
    o += 4
    const y = buffer.readFloatLE(o)
    o += 4
    const z = buffer.readFloatLE(o)
    o += 4
    return [x, y, z]
  }
  const v0 = readV()
  const v1 = readV()
  const v2 = readV()
  return [v0, v1, v2]
}

export type StlTriangleIterateResult = { fileTriangleCount: number; yielded: number; truncated: boolean }

/**
 * Iterate binary STL triangles in file order. Stops after `maxYield` triangles (narrow-phase budget).
 */
export function iterateBinaryStlTriangles(
  buffer: Buffer,
  maxYield: number,
  fn: (v0: Vec3, v1: Vec3, v2: Vec3, fileIndex: number) => void
): StlTriangleIterateResult {
  if (buffer.length < 84 || isLikelyAsciiStl(buffer)) {
    return { fileTriangleCount: 0, yielded: 0, truncated: false }
  }
  const fileTriangleCount = buffer.readUInt32LE(80)
  const expected = 84 + fileTriangleCount * 50
  if (buffer.length < expected) {
    return { fileTriangleCount: 0, yielded: 0, truncated: false }
  }
  let o = 84
  let yielded = 0
  for (let i = 0; i < fileTriangleCount; i++) {
    if (yielded >= maxYield) {
      return { fileTriangleCount, yielded, truncated: true }
    }
    o += 12
    const x0 = buffer.readFloatLE(o)
    o += 4
    const y0 = buffer.readFloatLE(o)
    o += 4
    const z0 = buffer.readFloatLE(o)
    o += 4
    const x1 = buffer.readFloatLE(o)
    o += 4
    const y1 = buffer.readFloatLE(o)
    o += 4
    const z1 = buffer.readFloatLE(o)
    o += 4
    const x2 = buffer.readFloatLE(o)
    o += 4
    const y2 = buffer.readFloatLE(o)
    o += 4
    const z2 = buffer.readFloatLE(o)
    o += 4
    o += 2
    fn([x0, y0, z0], [x1, y1, z1], [x2, y2, z2], i)
    yielded++
  }
  return { fileTriangleCount, yielded, truncated: false }
}

const DEFAULT_MAX_STL_TRIANGLES_CAM = 250_000

/** Collect binary STL triangles for CAM height queries (caps count for memory / perf). */
export function collectBinaryStlTriangles(
  buffer: Buffer,
  maxTriangles: number = DEFAULT_MAX_STL_TRIANGLES_CAM
): { triangles: Array<[Vec3, Vec3, Vec3]>; truncated: boolean; fileTriangleCount: number } {
  const out: Array<[Vec3, Vec3, Vec3]> = []
  const r = iterateBinaryStlTriangles(buffer, maxTriangles, (v0, v1, v2) => {
    out.push([v0, v1, v2])
  })
  return {
    triangles: out,
    truncated: r.truncated,
    fileTriangleCount: r.fileTriangleCount
  }
}
