import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sketchPreviewPlacementMatrix, worldPointToSketchMm } from './sketch-preview-placement'

describe('sketchPreviewPlacementMatrix', () => {
  it('datum XY matches historical Rx(−π/2) mapping of canonical axes', () => {
    const M = sketchPreviewPlacementMatrix({ kind: 'datum', datum: 'XY' })
    const ref = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
    const ex = new THREE.Vector3(1, 0, 0).applyMatrix4(M)
    const ey = new THREE.Vector3(0, 1, 0).applyMatrix4(M)
    const ez = new THREE.Vector3(0, 0, 1).applyMatrix4(M)
    expect(ex.distanceTo(new THREE.Vector3(1, 0, 0).applyMatrix4(ref))).toBeLessThan(1e-6)
    expect(ey.distanceTo(new THREE.Vector3(0, 1, 0).applyMatrix4(ref))).toBeLessThan(1e-6)
    expect(ez.distanceTo(new THREE.Vector3(0, 0, 1).applyMatrix4(ref))).toBeLessThan(1e-6)
  })

  it('datum bases are orthonormal with u×v ≈ n', () => {
    for (const datum of ['XY', 'XZ', 'YZ'] as const) {
      const M = sketchPreviewPlacementMatrix({ kind: 'datum', datum })
      const u = new THREE.Vector3().setFromMatrixColumn(M, 0).normalize()
      const v = new THREE.Vector3().setFromMatrixColumn(M, 1).normalize()
      const n = new THREE.Vector3().setFromMatrixColumn(M, 2).normalize()
      const cross = new THREE.Vector3().crossVectors(u, v)
      expect(cross.distanceTo(n)).toBeLessThan(1e-5)
    }
  })

  it('face plane: Gram–Schmidt xAxis yields orthonormal u×v ≈ n', () => {
    const M = sketchPreviewPlacementMatrix({
      kind: 'face',
      origin: [10, 20, 30],
      normal: [0, 0, 1],
      xAxis: [1, 0.1, 0]
    })
    const u = new THREE.Vector3().setFromMatrixColumn(M, 0).normalize()
    const v = new THREE.Vector3().setFromMatrixColumn(M, 1).normalize()
    const n = new THREE.Vector3().setFromMatrixColumn(M, 2).normalize()
    const cross = new THREE.Vector3().crossVectors(u, v)
    expect(cross.dot(n)).toBeGreaterThan(0)
    expect(cross.distanceTo(n)).toBeLessThan(1e-4)
    const o = new THREE.Vector3().setFromMatrixColumn(M, 3)
    expect(o.x).toBeCloseTo(10)
    expect(o.y).toBeCloseTo(20)
    expect(o.z).toBeCloseTo(30)
  })
})

describe('worldPointToSketchMm', () => {
  it('inverts datum XY placement for a point on the sketch plane', () => {
    const w = new THREE.Vector3(10, 0, -5)
    const { x, y } = worldPointToSketchMm({ kind: 'datum', datum: 'XY' }, w)
    expect(x).toBeCloseTo(10)
    expect(y).toBeCloseTo(5)
  })
})
