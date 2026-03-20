import { describe, expect, it } from 'vitest'
import { emptyDesign } from '../../shared/design-schema'
import {
  circularPatternSketchInstances,
  linearPatternSketchInstances,
  offsetClosedPolygon,
  translateSketch,
  translateSketchPoints
} from './design-ops'

describe('offsetClosedPolygon', () => {
  it('offsets a CCW axis-aligned square outward', () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]
    const out = offsetClosedPolygon(sq, 1)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(4)
    const xs = out!.map((p) => p[0])
    const ys = out!.map((p) => p[1])
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(10)
    expect(Math.min(...ys)).toBeLessThan(0)
    expect(Math.max(...ys)).toBeGreaterThan(10)
  })
})

describe('linearPatternSketchInstances', () => {
  it('duplicates original entities along k×Δ without exponential growth', () => {
    const d = emptyDesign()
    d.entities = [{ id: 'c1', kind: 'circle', cx: 0, cy: 0, r: 5 }]
    const out = linearPatternSketchInstances(d, 10, 0, 3)
    const circles = out.entities.filter((e) => e.kind === 'circle')
    expect(circles.length).toBe(3)
    expect(circles.map((e) => (e.kind === 'circle' ? e.cx : 0))).toEqual([0, 10, 20])
  })
})

describe('circularPatternSketchInstances', () => {
  it('places copies at start + k×(total°/count) around pivot (kernel pattern_circular rule)', () => {
    const d = emptyDesign()
    d.entities = [{ id: 'c1', kind: 'circle', cx: 10, cy: 0, r: 2 }]
    const out = circularPatternSketchInstances(d, 0, 0, 4, 360, 0)
    const circles = out.entities.filter((e) => e.kind === 'circle')
    expect(circles.length).toBe(4)
    const centers = circles.map((e) => (e.kind === 'circle' ? [e.cx, e.cy] : [0, 0]))
    expect(centers[0]![0]).toBeCloseTo(10, 5)
    expect(centers[0]![1]).toBeCloseTo(0, 5)
    expect(centers[1]![0]).toBeCloseTo(0, 5)
    expect(centers[1]![1]).toBeCloseTo(10, 5)
    expect(centers[2]![0]).toBeCloseTo(-10, 5)
    expect(centers[2]![1]).toBeCloseTo(0, 5)
    expect(centers[3]![0]).toBeCloseTo(0, 5)
    expect(centers[3]![1]).toBeCloseTo(-10, 5)
  })

  it('returns unchanged sketch when totalAngleDeg is out of range', () => {
    const d = emptyDesign()
    d.entities = [{ id: 'c1', kind: 'circle', cx: 0, cy: 0, r: 5 }]
    const out = circularPatternSketchInstances(d, 0, 0, 3, 0, 0)
    expect(out.entities.length).toBe(1)
  })
})

describe('translateSketchPoints', () => {
  it('moves only selected point ids', () => {
    const d = emptyDesign()
    d.points = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
    d.entities = [{ id: 'r1', kind: 'rect', cx: 5, cy: 5, w: 2, h: 2, rotation: 0 }]
    const n = translateSketchPoints(d, 1, 2, new Set(['a']))
    expect(n.points.a!.x).toBe(1)
    expect(n.points.a!.y).toBe(2)
    expect(n.points.b!.x).toBe(10)
    expect(n.entities[0]).toEqual(d.entities[0])
  })
})

describe('translateSketch', () => {
  it('translates points and primitive centers', () => {
    const d = emptyDesign()
    d.points = { a: { x: 0, y: 0 } }
    d.entities = [{ id: 'r1', kind: 'rect', cx: 5, cy: 5, w: 2, h: 2, rotation: 0 }]
    const n = translateSketch(d, 3, -1)
    expect(n.points.a!.x).toBe(3)
    expect(n.points.a!.y).toBe(-1)
    const r = n.entities[0]
    expect(r?.kind).toBe('rect')
    if (r?.kind === 'rect') {
      expect(r.cx).toBe(8)
      expect(r.cy).toBe(4)
    }
  })
})
