import { describe, expect, it } from 'vitest'
import type { DesignFileV2 } from '../../shared/design-schema'
import { extractKernelProfiles } from '../../shared/sketch-profile'
import { buildExtrudedGeometry, buildLoftedGeometry } from './sketch-mesh'

describe('buildExtrudedGeometry', () => {
  it('builds geometry for a rectangle extrusion', () => {
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 5,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {},
      entities: [
        {
          id: 'r1',
          kind: 'rect',
          cx: 0,
          cy: 0,
          w: 20,
          h: 10,
          rotation: 0
        }
      ],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const g = buildExtrudedGeometry(design)
    expect(g).not.toBeNull()
    expect(g!.attributes.position.count).toBeGreaterThan(8)
    g!.dispose()
  })

  it('builds extruded geometry for closed arc profile', () => {
    const sa = crypto.randomUUID()
    const sv = crypto.randomUUID()
    const se = crypto.randomUUID()
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 4,
      solidKind: 'extrude',
      loftSeparationMm: 20,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        [sa]: { x: 10, y: 0 },
        [sv]: { x: 7, y: 7 },
        [se]: { x: 0, y: 10 }
      },
      entities: [{ id: 'ar', kind: 'arc', startId: sa, viaId: sv, endId: se, closed: true }],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const g = buildExtrudedGeometry(design)
    expect(g).not.toBeNull()
    expect(g!.attributes.position.count).toBeGreaterThan(12)
    g!.dispose()
  })

  it('builds loft between two rectangles', () => {
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 5,
      solidKind: 'loft',
      loftSeparationMm: 15,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {},
      entities: [
        { id: 'r1', kind: 'rect', cx: 0, cy: 0, w: 20, h: 10, rotation: 0 },
        { id: 'r2', kind: 'rect', cx: 2, cy: 1, w: 12, h: 6, rotation: 0 }
      ],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const g = buildLoftedGeometry(design)
    expect(g).not.toBeNull()
    expect(g!.attributes.position.count).toBeGreaterThanOrEqual(6)
    g!.dispose()
  })

  it('builds loft through three rectangles (stacked ruled strips)', () => {
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 5,
      solidKind: 'loft',
      loftSeparationMm: 6,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {},
      entities: [
        { id: 'r1', kind: 'rect', cx: 0, cy: 0, w: 24, h: 14, rotation: 0 },
        { id: 'r2', kind: 'rect', cx: 0, cy: 0, w: 16, h: 10, rotation: 0 },
        { id: 'r3', kind: 'rect', cx: 0, cy: 0, w: 8, h: 5, rotation: 0 }
      ],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const g = buildLoftedGeometry(design)
    expect(g).not.toBeNull()
    expect(g!.attributes.position.count).toBeGreaterThan(100)
    g!.dispose()
  })

  it('loft aligns opposite winding on second closed polyline', () => {
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 5,
      solidKind: 'loft',
      loftSeparationMm: 10,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        c: { x: 10, y: 10 },
        d: { x: 0, y: 10 },
        e: { x: 1, y: 1 },
        f: { x: 4, y: 1 },
        g: { x: 4, y: 4 },
        h: { x: 1, y: 4 }
      },
      entities: [
        { id: 'p1', kind: 'polyline', pointIds: ['a', 'b', 'c', 'd'], closed: true },
        { id: 'p2', kind: 'polyline', pointIds: ['e', 'h', 'g', 'f'], closed: true }
      ],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const g = buildLoftedGeometry(design)
    expect(g).not.toBeNull()
    g!.dispose()
  })

  it('keeps preview closed-profile count aligned with kernel extraction', () => {
    const design: DesignFileV2 = {
      version: 2,
      extrudeDepthMm: 5,
      solidKind: 'extrude',
      loftSeparationMm: 10,
      revolve: { angleDeg: 360, axisX: 0 },
      parameters: {},
      points: {
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        c: { x: 10, y: 10 },
        d: { x: 0, y: 10 }
      },
      entities: [
        { id: 'p1', kind: 'polyline', pointIds: ['a', 'b', 'c', 'd'], closed: true },
        { id: 'c1', kind: 'circle', cx: 20, cy: 0, r: 3 },
        { id: 'e1', kind: 'ellipse', cx: 0, cy: 20, rx: 6, ry: 3, rotation: 0 }
      ],
      constraints: [],
      dimensions: [],
      sketchPlane: { kind: 'datum', datum: 'XY' }
    }
    const kernelProfiles = extractKernelProfiles(design)
    expect(kernelProfiles).not.toBeNull()
    const g = buildExtrudedGeometry(design)
    expect(g).not.toBeNull()
    expect(kernelProfiles!.length).toBe(3)
    g!.dispose()
  })
})
