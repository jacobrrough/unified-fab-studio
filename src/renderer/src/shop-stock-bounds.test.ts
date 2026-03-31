import { describe, expect, it } from 'vitest'
import type { ModelTransform } from './ShopModelViewer'
import {
  computeModelBoundsInThreeJS,
  fitModelToStock,
  modelFitsInStock
} from './shop-stock-bounds'

function defaultTransform(): ModelTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  }
}

describe('shop-stock-bounds', () => {
  it('flat CNC: after fitModelToStock, modelFitsInStock is true', () => {
    const modelSz = { x: 80, y: 60, z: 12 }
    const stock = { x: 100, y: 100, z: 20 }
    const fit = fitModelToStock(modelSz, stock, 'cnc_3d')
    const t = { ...defaultTransform(), ...fit }
    expect(modelFitsInStock(modelSz, t, stock, 'cnc_3d')).toBe(true)
  })

  it('rotary 4/5-axis: after fitModelToStock, modelFitsInStock is true (not flat Y bound)', () => {
    const modelSz = { x: 40, y: 30, z: 50 }
    const stock = { x: 100, y: 50, z: 20 }
    const fit = fitModelToStock(modelSz, stock, 'cnc_4axis', {
      chuckDepthMm: 5,
      clampOffsetMm: 0
    })
    const t = { ...defaultTransform(), ...fit }
    expect(
      modelFitsInStock(modelSz, t, stock, 'cnc_4axis', {
        chuckDepthMm: 5,
        clampOffsetMm: 0
      })
    ).toBe(true)
    // Same transform would always fail the old flat-stock Y check (hiY >> stock.z)
    const { hiY } = computeModelBoundsInThreeJS(modelSz, t)
    expect(hiY).toBeGreaterThan(stock.z + 1)
  })
})
