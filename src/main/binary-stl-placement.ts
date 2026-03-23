/**
 * Binary STL placement / up-axis transform for mesh import.
 * Loaded via dynamic import from mesh-import-registry so the main chunk stays smaller (Vite SSR emit quirk).
 */
import { isLikelyAsciiStl, iterateBinaryStlTriangles, type Vec3 } from './stl'

type PlacementMode = 'as_is' | 'center_origin' | 'center_xy_ground_z'
type UpAxisMode = 'y_up' | 'z_up'

function zUpToYUpStl(v: Vec3): Vec3 {
  const [x, y, z] = v
  return [x, z, -y]
}

function addVecStl(a: Vec3, t: readonly [number, number, number]): Vec3 {
  return [a[0] + t[0], a[1] + t[1], a[2] + t[2]]
}

function triangleNormalStl(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const e1x = b[0] - a[0]
  const e1y = b[1] - a[1]
  const e1z = b[2] - a[2]
  const e2x = c[0] - a[0]
  const e2y = c[1] - a[1]
  const e2z = c[2] - a[2]
  let nx = e1y * e2z - e1z * e2y
  let ny = e1z * e2x - e1x * e2z
  let nz = e1x * e2y - e1y * e2x
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

function encodeBinaryStlFromTriangles(triangles: Array<[Vec3, Vec3, Vec3]>): Buffer {
  const header = Buffer.alloc(80, 0)
  header.write('UFS import', 0)
  const count = triangles.length
  const out = Buffer.alloc(84 + count * 50)
  header.copy(out, 0)
  out.writeUInt32LE(count, 80)
  let o = 84
  for (const [a, b, c] of triangles) {
    const [nx, ny, nz] = triangleNormalStl(a, b, c)
    out.writeFloatLE(nx, o)
    o += 4
    out.writeFloatLE(ny, o)
    o += 4
    out.writeFloatLE(nz, o)
    o += 4
    for (const p of [a, b, c]) {
      out.writeFloatLE(p[0], o)
      o += 4
      out.writeFloatLE(p[1], o)
      o += 4
      out.writeFloatLE(p[2], o)
      o += 4
    }
    out.writeUInt16LE(0, o)
    o += 2
  }
  return out
}

/**
 * Apply up-axis fix and placement to a binary STL in memory.
 * ASCII STL is not supported (same limitation as viewport preview).
 */
export function transformBinaryStlWithPlacement(
  buffer: Buffer,
  placement: PlacementMode,
  upAxis: UpAxisMode
): { ok: true; buffer: Buffer } | { ok: false; error: string; detail?: string } {
  if (buffer.length < 84) {
    return { ok: false, error: 'stl_too_small' }
  }
  if (isLikelyAsciiStl(buffer)) {
    return {
      ok: false,
      error: 'ascii_stl_placement',
      detail: 'Use binary STL for repositioning (ASCII STL not supported).'
    }
  }
  const triangleCount = buffer.readUInt32LE(80)
  if (triangleCount < 1) {
    return { ok: false, error: 'empty_stl' }
  }

  const mapUp = upAxis === 'z_up' ? zUpToYUpStl : (v: Vec3): Vec3 => [v[0], v[1], v[2]]

  const tris: Array<[Vec3, Vec3, Vec3]> = []
  const r = iterateBinaryStlTriangles(buffer, triangleCount, (v0, v1, v2) => {
    tris.push([mapUp(v0), mapUp(v1), mapUp(v2)])
  })
  if (r.truncated || r.yielded !== triangleCount) {
    return { ok: false, error: 'stl_triangle_read_mismatch' }
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity
  for (const tri of tris) {
    for (const p of tri) {
      minX = Math.min(minX, p[0])
      minY = Math.min(minY, p[1])
      minZ = Math.min(minZ, p[2])
      maxX = Math.max(maxX, p[0])
      maxY = Math.max(maxY, p[1])
      maxZ = Math.max(maxZ, p[2])
    }
  }

  let tx = 0
  let ty = 0
  let tz = 0
  if (placement === 'center_origin') {
    tx = -((minX + maxX) / 2)
    ty = -((minY + maxY) / 2)
    tz = -((minZ + maxZ) / 2)
  } else if (placement === 'center_xy_ground_z') {
    tx = -((minX + maxX) / 2)
    ty = -((minY + maxY) / 2)
    tz = -minZ
  }

  const t: [number, number, number] = [tx, ty, tz]
  const outTris: Array<[Vec3, Vec3, Vec3]> = tris.map(([a, b, c]) => [
    addVecStl(a, t),
    addVecStl(b, t),
    addVecStl(c, t)
  ])

  return { ok: true, buffer: encodeBinaryStlFromTriangles(outTris) }
}
