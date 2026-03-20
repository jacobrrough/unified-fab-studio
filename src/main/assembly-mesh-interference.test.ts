import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { emptyAssembly, parseAssemblyFile } from '../shared/assembly-schema'
import {
  buildAssemblyInterferenceReport,
  narrowPhaseMeshPair,
  trianglesIntersectSatStub,
  type MeshInstance
} from './assembly-mesh-interference'
import type { Vec3 } from './stl'

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

function encodeTriangle(verts: [number, number, number][]): Buffer {
  const tri = Buffer.alloc(50)
  let o = 0
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(1, o)
  o += 4
  for (const [x, y, z] of verts) {
    tri.writeFloatLE(x, o)
    o += 4
    tri.writeFloatLE(y, o)
    o += 4
    tri.writeFloatLE(z, o)
    o += 4
  }
  tri.writeUInt16LE(0, o)
  return tri
}

function buildStl(tris: [number, number, number][][]): Buffer {
  const header = Buffer.alloc(80, 0)
  const count = Buffer.alloc(4)
  count.writeUInt32LE(tris.length, 0)
  return Buffer.concat([header, count, ...tris.map(encodeTriangle)])
}

describe('trianglesIntersectSatStub', () => {
  it('detects overlap for coplanar overlapping triangles', () => {
    const a = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0]
    ] as const
    const b = [
      [1, 1, 0],
      [3, 1, 0],
      [1, 3, 0]
    ] as const
    expect(trianglesIntersectSatStub([...a], [...b])).toBe(true)
  })

  it('separates triangles on parallel planes', () => {
    const a = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0]
    ] as const
    const b = [
      [0, 0, 5],
      [1, 0, 5],
      [0, 1, 5]
    ] as const
    expect(trianglesIntersectSatStub([...a], [...b])).toBe(false)
  })
})

describe('buildAssemblyInterferenceReport mesh paths', () => {
  it('flags AABB overlap for two binary STLs with overlapping placement', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ufs-assy-'))
    try {
      const stl = buildOneTriangleStl()
      await writeFile(join(dir, 'a.stl'), stl)
      await writeFile(join(dir, 'b.stl'), stl)
      const asm = parseAssemblyFile({
        version: 2,
        name: 'T',
        components: [
          {
            id: '1',
            name: 'A',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            grounded: true,
            meshPath: 'a.stl'
          },
          {
            id: '2',
            name: 'B',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            meshPath: 'b.stl'
          }
        ]
      })
      const r = await buildAssemblyInterferenceReport(dir, asm)
      expect(r.meshResolvedCount).toBe(2)
      expect(r.meshAabbOverlapPairs?.length).toBeGreaterThan(0)
      expect(r.narrowPhaseOverlapPairs?.length).toBeGreaterThan(0)
      expect(r.conflictingPairs.length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not overlap when one mesh is translated along Z', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ufs-assy-'))
    try {
      const stl = buildOneTriangleStl()
      await writeFile(join(dir, 'a.stl'), stl)
      await writeFile(join(dir, 'b.stl'), stl)
      const asm = parseAssemblyFile({
        version: 2,
        name: 'T',
        components: [
          {
            id: '1',
            name: 'A',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            grounded: true,
            meshPath: 'a.stl'
          },
          {
            id: '2',
            name: 'B',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 50, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            meshPath: 'b.stl'
          }
        ]
      })
      const r = await buildAssemblyInterferenceReport(dir, asm)
      expect(r.meshAabbOverlapPairs?.length ?? 0).toBe(0)
      expect(r.conflictingPairs.length).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records warning for traversal mesh path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ufs-assy-'))
    try {
      const asm = emptyAssembly('X')
      asm.components = [
        {
          id: '1',
          name: 'Bad',
          partPath: 'design/sketch.json',
          transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
          grounded: true,
          bomQuantity: 1,
          suppressed: false,
          motionIsolated: false,
          meshPath: '../secret.stl'
        }
      ]
      const r = await buildAssemblyInterferenceReport(dir, asm)
      expect(r.meshWarnings?.some((w) => w.includes('Unsafe'))).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('narrow phase finds overlap when first-triangle SAT stub does not', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ufs-assy-'))
    try {
      const stlA = buildStl([
        [
          [0, 0, 100],
          [1, 0, 100],
          [0, 1, 100]
        ],
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0]
        ]
      ])
      const stlB = buildStl([
        [
          [0.25, 0.25, 0],
          [0.75, 0.25, 0],
          [0.25, 0.75, 0]
        ]
      ])
      await writeFile(join(dir, 'a.stl'), stlA)
      await writeFile(join(dir, 'b.stl'), stlB)
      const asm = parseAssemblyFile({
        version: 2,
        name: 'T',
        components: [
          {
            id: '1',
            name: 'A',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            grounded: true,
            meshPath: 'a.stl'
          },
          {
            id: '2',
            name: 'B',
            partPath: 'design/sketch.json',
            transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
            meshPath: 'b.stl'
          }
        ]
      })
      const r = await buildAssemblyInterferenceReport(dir, asm)
      expect(r.triangleStubPairs == null || r.triangleStubPairs.length === 0).toBe(true)
      expect(r.narrowPhaseOverlapPairs?.length).toBe(1)
      expect(r.conflictingPairs.length).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('narrowPhaseMeshPair', () => {
  it('returns hit for overlapping unit triangles in XY', () => {
    const ta: [Vec3, Vec3, Vec3][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0]
      ]
    ]
    const tb: [Vec3, Vec3, Vec3][] = [
      [
        [0.25, 0.25, 0],
        [0.75, 0.25, 0],
        [0.25, 0.75, 0]
      ]
    ]
    const boxA: MeshInstance = {
      id: 'a',
      name: 'A',
      worldMin: [0, 0, 0],
      worldMax: [1, 1, 0],
      firstTriWorld: null
    }
    const boxB: MeshInstance = {
      id: 'b',
      name: 'B',
      worldMin: [0.25, 0.25, 0],
      worldMax: [0.75, 0.75, 0],
      firstTriWorld: null
    }
    const n = narrowPhaseMeshPair(ta, tb, boxA, boxB)
    expect(n.hit).toBe(true)
    expect(n.incomplete).toBe(false)
  })
})
