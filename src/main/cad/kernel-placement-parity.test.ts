import { describe, expect, it } from 'vitest'
import { comparePlacementParityFromBounds } from './kernel-placement-parity'

describe('comparePlacementParityFromBounds', () => {
  it('returns ok for close extents and centers', () => {
    const r = comparePlacementParityFromBounds(
      { min: [0, 0, 0], max: [10, 20, 30], triangleCount: 100 },
      { min: [0.05, -0.03, 0.02], max: [10.04, 19.98, 30.01], triangleCount: 120 },
      0.2
    )
    expect(r.parity).toBe('ok')
  })

  it('returns mismatch when deltas exceed tolerance', () => {
    const r = comparePlacementParityFromBounds(
      { min: [0, 0, 0], max: [10, 20, 30], triangleCount: 100 },
      { min: [0, 0, 0], max: [20, 10, 30], triangleCount: 100 },
      0.2
    )
    expect(r.parity).toBe('mismatch')
    expect(r.maxDeltaMm).toBeGreaterThan(1)
  })
})

