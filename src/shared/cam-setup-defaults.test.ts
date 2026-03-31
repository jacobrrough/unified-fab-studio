import { describe, expect, it } from 'vitest'
import {
  rasterRestGapFromStockAndMeshMinZ,
  recommendedSafeZFromStockThicknessMm,
  rotaryMachinableXSpanMm,
  rotaryMeshStockAlignmentHint,
  shopJobStockAsCamSetup,
  suggestedZPassMmFromStockAndMeshMinZ
} from './cam-setup-defaults'

describe('cam-setup-defaults', () => {
  it('recommendedSafeZFromStockThicknessMm scales with stock height', () => {
    expect(recommendedSafeZFromStockThicknessMm(10)).toBeLessThan(recommendedSafeZFromStockThicknessMm(80))
    expect(recommendedSafeZFromStockThicknessMm(5)).toBeGreaterThanOrEqual(4)
  })

  it('rasterRestGapFromStockAndMeshMinZ uses WCS stock top Z0 convention', () => {
    expect(rasterRestGapFromStockAndMeshMinZ(20, -12)).toBeCloseTo(8, 5)
    expect(rasterRestGapFromStockAndMeshMinZ(20, -25)).toBeUndefined()
  })

  it('shopJobStockAsCamSetup builds box stock for resolveCamCutParams', () => {
    const s = shopJobStockAsCamSetup({ x: 120, y: 40, z: 15 })
    expect(s.stock?.kind).toBe('box')
    expect(s.stock?.z).toBe(15)
  })

  it('suggestedZPassMmFromStockAndMeshMinZ returns negative depth capped by stock', () => {
    expect(suggestedZPassMmFromStockAndMeshMinZ(20, -8)).toBe(-8)
    expect(suggestedZPassMmFromStockAndMeshMinZ(5, -25)).toBe(-5)
    expect(suggestedZPassMmFromStockAndMeshMinZ(10, 2)).toBeUndefined()
  })

  it('rotaryMachinableXSpanMm skips chuck and clamp buffer', () => {
    const { machXStartMm, machXEndMm } = rotaryMachinableXSpanMm(100, 10, 5)
    expect(machXEndMm).toBe(100)
    expect(machXStartMm).toBeGreaterThan(10)
  })

  it('rotaryMeshStockAlignmentHint warns on centered mesh vs long stock', () => {
    const h = rotaryMeshStockAlignmentHint({ stockLengthMm: 100, meshMinX: -40, meshMaxX: 40 })
    expect(h).toBeTruthy()
    expect(h).toContain('CAM_4TH_AXIS_REFERENCE')
  })
})
