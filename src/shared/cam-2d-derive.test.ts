import { describe, expect, it } from 'vitest'
import {
  contourPointSignature,
  deriveContourPointsFromDesign,
  deriveDrillPointsFromDesign,
  listContourCandidatesFromDesign
} from './cam-2d-derive'
import { emptyDesign, type DesignFileV2 } from './design-schema'

describe('cam-2d-derive', () => {
  it('derives contour points from first closed profile', () => {
    const d: DesignFileV2 = {
      ...emptyDesign(),
      entities: [{ id: 'p1', kind: 'polyline', pointIds: ['a', 'b', 'c'], closed: true }],
      points: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 10, y: 5 } }
    }
    const pts = deriveContourPointsFromDesign(d)
    expect(pts.length).toBe(3)
    expect(pts[1]).toEqual([10, 0])
  })

  it('supports selecting contour source by id', () => {
    const d: DesignFileV2 = {
      ...emptyDesign(),
      entities: [
        { id: 'p1', kind: 'polyline', pointIds: ['a', 'b', 'c'], closed: true },
        { id: 'p2', kind: 'polyline', pointIds: ['d', 'e', 'f'], closed: true }
      ],
      points: {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        c: { x: 0, y: 5 },
        d: { x: 20, y: 20 },
        e: { x: 30, y: 20 },
        f: { x: 20, y: 25 }
      }
    }
    const picked = deriveContourPointsFromDesign(d, 'p2')
    expect(picked[0]).toEqual([20, 20])
  })

  it('lists contour candidates from closed sketch entities', () => {
    const d: DesignFileV2 = {
      ...emptyDesign(),
      entities: [
        { id: 'r1', kind: 'rect', cx: 5, cy: 5, w: 4, h: 2, rotation: 0 },
        { id: 'c1', kind: 'circle', cx: 10, cy: 10, r: 2 }
      ]
    }
    const cands = listContourCandidatesFromDesign(d)
    expect(cands.some((c) => c.sourceId === 'r1')).toBe(true)
    expect(cands.some((c) => c.sourceId === 'c1')).toBe(true)
    expect(cands.every((c) => c.signature.length > 0)).toBe(true)
  })

  it('lists slot as contour candidate', () => {
    const d: DesignFileV2 = {
      ...emptyDesign(),
      entities: [{ id: 's1', kind: 'slot', cx: 0, cy: 0, length: 12, width: 4, rotation: 0 }]
    }
    const cands = listContourCandidatesFromDesign(d)
    const s = cands.find((c) => c.sourceId === 's1')
    expect(s).toBeDefined()
    expect(s!.points.length).toBeGreaterThanOrEqual(8)
  })

  it('builds stable signatures with rounded precision', () => {
    const a = contourPointSignature([
      [1.0004, 2],
      [3, 4]
    ])
    const b = contourPointSignature([
      [1.00049, 2],
      [3, 4]
    ])
    expect(a).toBe(b)
  })

  it('derives drill points from circle centers', () => {
    const d: DesignFileV2 = {
      ...emptyDesign(),
      entities: [
        { id: 'c1', kind: 'circle', cx: 5, cy: 6, r: 1 },
        { id: 'c2', kind: 'circle', cx: 7, cy: 8, r: 1.5 }
      ]
    }
    expect(deriveDrillPointsFromDesign(d)).toEqual([
      [5, 6],
      [7, 8]
    ])
  })
})

