import { describe, expect, it } from 'vitest'
import { buildCamSimulationPreview } from './cam-simulation-preview'

describe('buildCamSimulationPreview', () => {
  it('extracts motion/cutting counts and bounds from basic gcode', () => {
    const gcode = [
      'G0 Z5.000',
      'G0 X0.000 Y0.000',
      'G1 Z-1.000 F200',
      'G1 X10.000 Y0.000 F400',
      'G1 X10.000 Y5.000 F400',
      'G0 Z5.000'
    ].join('\n')

    const preview = buildCamSimulationPreview(gcode)
    expect(preview.motionLines).toBe(6)
    expect(preview.cuttingMoves).toBe(3)
    expect(preview.xyBounds).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 5 })
    expect(preview.zRange).toEqual({ topZ: 5, bottomZ: -1 })
    expect(preview.cues.length).toBeGreaterThan(0)
  })

  it('reports traverse-only preview when no cutting moves are present', () => {
    const gcode = ['G0 Z10.000', 'G0 X2.000 Y3.000', 'G1 Z2.000 F200'].join('\n')
    const preview = buildCamSimulationPreview(gcode)
    expect(preview.cuttingMoves).toBe(0)
    expect(preview.cues[0]?.message).toContain('No below-Z0 cutting moves detected')
  })
})
