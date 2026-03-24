import { describe, expect, it } from 'vitest'
import { estimateFeedMmMinFromTool } from './tool-feed-hint'

describe('estimateFeedMmMinFromTool', () => {
  it('returns undefined without surface speed', () => {
    expect(estimateFeedMmMinFromTool({ id: '1', name: 'x', type: 'endmill', diameterMm: 6 })).toBeUndefined()
  })

  it('computes feed from typical inputs', () => {
    const v = estimateFeedMmMinFromTool({
      id: '1',
      name: 'x',
      type: 'endmill',
      diameterMm: 6,
      surfaceSpeedMMin: 100,
      chiploadMm: 0.05,
      fluteCount: 2
    })
    expect(v).toBeGreaterThan(100)
  })
})
