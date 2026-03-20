import { describe, expect, it } from 'vitest'
import type { DesignFileV2 } from '../../shared/design-schema'
import { cloneDesign, energy, solveSketch } from './solver2d'

describe('solveSketch', () => {
  it('pulls segment toward horizontal', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 5 }
      },
      entities: [],
      constraints: [{ id: 'c1', type: 'horizontal', a: { pointId: 'a' }, b: { pointId: 'b' } }],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(1)
    const d2 = cloneDesign(d)
    solveSketch(d2, 200, 0.5)
    expect(Math.abs(d2.points.b!.y - d2.points.a!.y)).toBeLessThan(0.25)
  })

  it('makes two segments perpendicular', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a1: { x: 0, y: 0 },
        b1: { x: 10, y: 0 },
        a2: { x: 5, y: 0 },
        b2: { x: 8, y: 3 }
      },
      entities: [],
      constraints: [
        {
          id: 'c1',
          type: 'perpendicular',
          a1: { pointId: 'a1' },
          b1: { pointId: 'b1' },
          a2: { pointId: 'a2' },
          b2: { pointId: 'b2' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(0.01)
    const d2 = cloneDesign(d)
    solveSketch(d2, 600, 0.5)
    const p = d2.points
    const v1x = p.b1!.x - p.a1!.x
    const v1y = p.b1!.y - p.a1!.y
    const v2x = p.b2!.x - p.a2!.x
    const v2y = p.b2!.y - p.a2!.y
    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    const cos = (v1x * v2x + v1y * v2y) / (len1 * len2)
    expect(Math.abs(cos)).toBeLessThan(0.12)
  })

  it('makes two segments parallel', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a1: { x: 0, y: 0 },
        b1: { x: 10, y: 0 },
        a2: { x: 0, y: 5 },
        b2: { x: 5, y: 8 }
      },
      entities: [],
      constraints: [
        {
          id: 'c1',
          type: 'parallel',
          a1: { pointId: 'a1' },
          b1: { pointId: 'b1' },
          a2: { pointId: 'a2' },
          b2: { pointId: 'b2' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(0.01)
    const d2 = cloneDesign(d)
    solveSketch(d2, 600, 0.5)
    const p = d2.points
    const v1x = p.b1!.x - p.a1!.x
    const v1y = p.b1!.y - p.a1!.y
    const v2x = p.b2!.x - p.a2!.x
    const v2y = p.b2!.y - p.a2!.y
    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    const sin = (v1x * v2y - v1y * v2x) / (len1 * len2)
    expect(Math.abs(sin)).toBeLessThan(0.12)
  })

  it('makes two segment lengths equal', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a1: { x: 0, y: 0 },
        b1: { x: 10, y: 0 },
        a2: { x: 0, y: 5 },
        b2: { x: 3, y: 5 }
      },
      entities: [],
      constraints: [
        {
          id: 'c1',
          type: 'equal',
          a1: { pointId: 'a1' },
          b1: { pointId: 'b1' },
          a2: { pointId: 'a2' },
          b2: { pointId: 'b2' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(1)
    const d2 = cloneDesign(d)
    solveSketch(d2, 800, 0.5)
    const p = d2.points
    const l1 = Math.hypot(p.b1!.x - p.a1!.x, p.b1!.y - p.a1!.y)
    const l2 = Math.hypot(p.b2!.x - p.a2!.x, p.b2!.y - p.a2!.y)
    expect(Math.abs(l1 - l2)).toBeLessThan(0.2)
  })

  it('pulls a third point onto the line through two fixed points (collinear)', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a: { x: 0, y: 0, fixed: true },
        b: { x: 10, y: 0, fixed: true },
        c: { x: 5, y: 4 }
      },
      entities: [],
      constraints: [
        {
          id: 'c1',
          type: 'collinear',
          a: { pointId: 'a' },
          b: { pointId: 'b' },
          c: { pointId: 'c' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(1)
    const d2 = cloneDesign(d)
    solveSketch(d2, 400, 0.5)
    expect(Math.abs(d2.points.c!.y)).toBeLessThan(0.2)
  })

  it('moves free midpoint onto segment midpoint', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a: { x: -10, y: 0, fixed: true },
        b: { x: 10, y: 0, fixed: true },
        m: { x: 3, y: 4 }
      },
      entities: [],
      constraints: [
        {
          id: 'c1',
          type: 'midpoint',
          m: { pointId: 'm' },
          a: { pointId: 'a' },
          b: { pointId: 'b' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(1)
    const d2 = cloneDesign(d)
    solveSketch(d2, 400, 0.5)
    expect(Math.abs(d2.points.m!.x)).toBeLessThan(0.2)
    expect(Math.abs(d2.points.m!.y)).toBeLessThan(0.2)
  })

  it('drives angle between two segments toward parameter degrees', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: { ang1: 90 },
      points: {
        a1: { x: 0, y: 0, fixed: true },
        b1: { x: 10, y: 0, fixed: true },
        a2: { x: 5, y: 0, fixed: true },
        b2: { x: 8, y: 3 }
      },
      entities: [],
      constraints: [
        {
          id: 'ca',
          type: 'angle',
          a1: { pointId: 'a1' },
          b1: { pointId: 'b1' },
          a2: { pointId: 'a2' },
          b2: { pointId: 'b2' },
          parameterKey: 'ang1'
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(0.01)
    const d2 = cloneDesign(d)
    solveSketch(d2, 800, 0.45)
    const p = d2.points
    const v1x = p.b1!.x - p.a1!.x
    const v1y = p.b1!.y - p.a1!.y
    const v2x = p.b2!.x - p.a2!.x
    const v2y = p.b2!.y - p.a2!.y
    const len1 = Math.hypot(v1x, v1y)
    const len2 = Math.hypot(v2x, v2y)
    const cos = (v1x * v2x + v1y * v2y) / (len1 * len2)
    expect(Math.abs(cos)).toBeLessThan(0.15)
  })

  it('moves arc endpoint points under horizontal constraint (arc geometry is implied)', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        s: { x: 0, y: 0 },
        v: { x: 5, y: 8 },
        e: { x: 12, y: 3 }
      },
      entities: [{ id: 'ar1', kind: 'arc', startId: 's', viaId: 'v', endId: 'e' }],
      constraints: [{ id: 'c1', type: 'horizontal', a: { pointId: 's' }, b: { pointId: 'e' } }],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const d2 = cloneDesign(d)
    solveSketch(d2, 400, 0.5)
    expect(Math.abs(d2.points.e!.y - d2.points.s!.y)).toBeLessThan(0.25)
  })

  it('reduces symmetric constraint energy (mirror P2 to P1 across axis)', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        la: { x: 0, y: 0, fixed: true },
        lb: { x: 10, y: 0, fixed: true },
        p1: { x: 3, y: 4, fixed: true },
        p2: { x: 5, y: 1 }
      },
      entities: [],
      constraints: [
        {
          id: 'sym',
          type: 'symmetric',
          p1: { pointId: 'p1' },
          p2: { pointId: 'p2' },
          la: { pointId: 'la' },
          lb: { pointId: 'lb' }
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(0.01)
    const d2 = cloneDesign(d)
    solveSketch(d2, 500, 0.45)
    // Reflect (3,4) across the x-axis through (0,0)—(10,0) → (3,-4)
    expect(Math.hypot(d2.points.p2!.x - 3, d2.points.p2!.y + 4)).toBeLessThan(0.35)
  })

  it('reduces line–arc tangent energy at arc start', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        la: { x: 0, y: 0 },
        lb: { x: 20, y: 5 },
        s: { x: 10, y: 0 },
        v: { x: 15, y: 8 },
        e: { x: 18, y: 2 }
      },
      entities: [{ id: 'ar1', kind: 'arc', startId: 's', viaId: 'v', endId: 'e' }],
      constraints: [
        {
          id: 'tg',
          type: 'tangent',
          lineA: { pointId: 'la' },
          lineB: { pointId: 'lb' },
          arcStart: { pointId: 's' },
          arcVia: { pointId: 'v' },
          arcEnd: { pointId: 'e' },
          arcTangentAt: 'start',
          lineTangentAt: 'a'
        }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    expect(energy(d)).toBeGreaterThan(1e-6)
    const d2 = cloneDesign(d)
    solveSketch(d2, 600, 0.4)
    expect(energy(d2)).toBeLessThan(energy(d) * 0.5)
  })

  it('reduces concentric + radius/diameter energy for circles', () => {
    const d: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 10,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: { r1: 8, d2: 30 },
      points: {},
      entities: [
        { id: 'c1', kind: 'circle', cx: 0, cy: 0, r: 4 },
        { id: 'c2', kind: 'circle', cx: 6, cy: 2, r: 9 }
      ],
      constraints: [
        { id: 'k1', type: 'concentric', entityAId: 'c1', entityBId: 'c2' },
        { id: 'k2', type: 'radius', entityId: 'c1', parameterKey: 'r1' },
        { id: 'k3', type: 'diameter', entityId: 'c2', parameterKey: 'd2' }
      ],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const d2 = cloneDesign(d)
    solveSketch(d2, 120, 0.4)
    expect(energy(d2)).toBeLessThanOrEqual(energy(d))
  })
})
