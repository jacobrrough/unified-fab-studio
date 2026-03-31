import { describe, expect, it } from 'vitest'
import { calcCutParams, materialRecordSchema } from './material-schema'

describe('calcCutParams', () => {
  it('floors feed and plunge to at least 1 mm/min (guardrail parity)', () => {
    const mat = materialRecordSchema.parse({
      id: 'floor-test',
      name: 'Floor test',
      category: 'foam',
      cutParams: {
        default: {
          surfaceSpeedMMin: 20,
          chiploadMm: 1e-6,
          docFactor: 0.1,
          stepoverFactor: 0.4,
          plungeFactor: 0.05
        }
      }
    })
    const r = calcCutParams(mat, 200, 2)
    expect(r.feedMmMin).toBeGreaterThanOrEqual(1)
    expect(r.plungeMmMin).toBeGreaterThanOrEqual(1)
    expect(r.feedClampedToFloor).toBe(true)
    expect(r.recommendedFeedMmMin).toBeLessThan(1)
  })
})
