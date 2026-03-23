import { describe, expect, it } from 'vitest'
import {
  appendMeasureSample,
  initialViewportInteractionState,
  viewportInteractionReducer
} from './design-viewport-interaction'

describe('appendMeasureSample', () => {
  it('cycles after two points', () => {
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 3, y: 4, z: 0 }
    const r1 = appendMeasureSample([], a, 'preview')
    expect(r1.next).toEqual([a])
    const r2 = appendMeasureSample(r1.next, b, 'preview')
    expect(r2.next).toHaveLength(2)
    const r3 = appendMeasureSample(r2.next, { x: 1, y: 1, z: 1 }, 'preview')
    expect(r3.next).toEqual([{ x: 1, y: 1, z: 1 }])
  })
})

describe('viewportInteractionReducer', () => {
  it('measure_start clears project and face', () => {
    const s = {
      ...initialViewportInteractionState,
      projectSketchMode: true,
      facePickMode: true
    }
    const n = viewportInteractionReducer(s, { type: 'measure_start' })
    expect(n.measureMode).toBe(true)
    expect(n.projectSketchMode).toBe(false)
    expect(n.facePickMode).toBe(false)
  })

  it('palette_section_start clears measure', () => {
    const s = { ...initialViewportInteractionState, measureMode: true, measurePts: [{ x: 0, y: 0, z: 0 }] }
    const n = viewportInteractionReducer(s, { type: 'palette_section_start' })
    expect(n.sectionEnabled).toBe(true)
    expect(n.measureMode).toBe(false)
    expect(n.measurePts).toEqual([])
  })

  it('section_set toggles without clearing measure', () => {
    const s = { ...initialViewportInteractionState, measureMode: true }
    const n = viewportInteractionReducer(s, { type: 'section_set', enabled: true })
    expect(n.sectionEnabled).toBe(true)
    expect(n.measureMode).toBe(true)
  })

  it('measure_clear_pts keeps measure mode', () => {
    const s = { ...initialViewportInteractionState, measureMode: true, measurePts: [{ x: 0, y: 0, z: 0 }] }
    const n = viewportInteractionReducer(s, { type: 'measure_clear_pts' })
    expect(n.measureMode).toBe(true)
    expect(n.measurePts).toEqual([])
  })

  it('esc_overlay clears measure and section only', () => {
    const s = {
      ...initialViewportInteractionState,
      measureMode: true,
      sectionEnabled: true,
      projectSketchMode: true
    }
    const n = viewportInteractionReducer(s, { type: 'esc_overlay' })
    expect(n.measureMode).toBe(false)
    expect(n.sectionEnabled).toBe(false)
    expect(n.projectSketchMode).toBe(true)
  })
})
