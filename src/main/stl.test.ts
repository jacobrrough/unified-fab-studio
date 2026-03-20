import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  isLikelyAsciiStl,
  iterateBinaryStlTriangles,
  parseBinaryStl,
  readStlFirstTriangleVertices
} from './stl'

function buildOneTriangleStl(): Buffer {
  const header = Buffer.alloc(80, 0)
  const count = Buffer.alloc(4)
  count.writeUInt32LE(1, 0)
  const tri = Buffer.alloc(50)
  let o = 0
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(1, o)
  o += 4
  const verts: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0]
  ]
  for (const [x, y, z] of verts) {
    tri.writeFloatLE(x, o)
    o += 4
    tri.writeFloatLE(y, o)
    o += 4
    tri.writeFloatLE(z, o)
    o += 4
  }
  tri.writeUInt16LE(0, o)
  return Buffer.concat([header, count, tri])
}

describe('parseBinaryStl', () => {
  it('computes axis-aligned bounds', () => {
    const b = parseBinaryStl(buildOneTriangleStl())
    expect(b.triangleCount).toBe(1)
    expect(b.min[0]).toBeCloseTo(0)
    expect(b.max[0]).toBeCloseTo(1)
    expect(b.max[1]).toBeCloseTo(1)
  })
})

describe('STL helpers', () => {
  it('detects ASCII STL header', () => {
    expect(isLikelyAsciiStl(Buffer.from('solid foo\n'))).toBe(true)
    expect(isLikelyAsciiStl(buildOneTriangleStl())).toBe(false)
  })

  it('reads first triangle vertices from binary STL', () => {
    const tri = readStlFirstTriangleVertices(buildOneTriangleStl())
    expect(tri).not.toBeNull()
    expect(tri![0]![0]).toBeCloseTo(0)
    expect(tri![1]![0]).toBeCloseTo(1)
  })

  it('iterates all triangles up to maxYield', () => {
    const header = Buffer.alloc(80, 0)
    const count = Buffer.alloc(4)
    count.writeUInt32LE(2, 0)
    const oneTriFile = buildOneTriangleStl()
    const tri50 = oneTriFile.subarray(84, 134)
    const buf = Buffer.concat([header, count, tri50, tri50])
    let n = 0
    const r = iterateBinaryStlTriangles(buf, 10, () => {
      n++
    })
    expect(r.fileTriangleCount).toBe(2)
    expect(r.yielded).toBe(2)
    expect(r.truncated).toBe(false)
    expect(n).toBe(2)
  })
})
