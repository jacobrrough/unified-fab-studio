import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sketchPreviewPlacementMatrix } from './sketch-preview-placement'
import { measureMarkerRadiusMmFromGeometry, worldYRangeFromExtrudeMeshGeometry } from './viewport3d-bounds'

describe('worldYRangeFromExtrudeMeshGeometry', () => {
  it('reads world Y span from already-placed preview geometry', () => {
    const g = new THREE.BoxGeometry(10, 10, 24)
    g.applyMatrix4(sketchPreviewPlacementMatrix({ kind: 'datum', datum: 'XY' }))
    const r = worldYRangeFromExtrudeMeshGeometry(g)
    expect(r.max - r.min).toBeGreaterThan(1)
    expect(Number.isFinite(r.min) && Number.isFinite(r.max)).toBe(true)
  })
})

describe('measureMarkerRadiusMmFromGeometry', () => {
  it('uses fallback when geometry is null', () => {
    expect(measureMarkerRadiusMmFromGeometry(null)).toBe(1.2)
  })

  it('clamps small models to a minimum visible radius', () => {
    const g = new THREE.BoxGeometry(0.2, 0.2, 0.2)
    expect(measureMarkerRadiusMmFromGeometry(g)).toBe(0.65)
  })

  it('scales with bounding sphere and caps huge models', () => {
    const small = new THREE.BoxGeometry(80, 80, 80)
    const rSmall = measureMarkerRadiusMmFromGeometry(small)
    expect(rSmall).toBeGreaterThan(0.65)
    expect(rSmall).toBeLessThan(18)

    const huge = new THREE.BoxGeometry(8000, 8000, 8000)
    expect(measureMarkerRadiusMmFromGeometry(huge)).toBe(18)
  })
})
