import { describe, expect, it } from 'vitest'
import { emptyDesign } from '../../shared/design-schema'
import { derivePartFeatures } from './derive-features'

describe('derivePartFeatures', () => {
  it('preserves kernelOps from previous features file', () => {
    const d = emptyDesign()
    d.entities = [{ id: '1', kind: 'rect', cx: 0, cy: 0, w: 10, h: 10, rotation: 0 }]
    const prev = {
      version: 1 as const,
      items: [],
      kernelOps: [
        { kind: 'fillet_all' as const, radiusMm: 1 },
        { kind: 'shell_inward' as const, thicknessMm: 2 }
      ]
    }
    const next = derivePartFeatures(d, prev)
    expect(next.kernelOps).toEqual([
      { kind: 'fillet_all', radiusMm: 1 },
      { kind: 'shell_inward', thicknessMm: 2 }
    ])
  })

  it('omits kernelOps when prev has none', () => {
    const d = emptyDesign()
    d.entities = [{ id: '1', kind: 'rect', cx: 0, cy: 0, w: 10, h: 10, rotation: 0 }]
    const next = derivePartFeatures(d, null)
    expect(next.kernelOps).toBeUndefined()
  })

  it('loft feature row includes profileCount from closed profiles', () => {
    const d = emptyDesign()
    d.solidKind = 'loft'
    d.entities = [
      { id: 'a', kind: 'rect', cx: 0, cy: 0, w: 20, h: 10, rotation: 0 },
      { id: 'b', kind: 'rect', cx: 0, cy: 0, w: 12, h: 6, rotation: 0 },
      { id: 'c', kind: 'rect', cx: 0, cy: 0, w: 6, h: 4, rotation: 0 }
    ]
    const next = derivePartFeatures(d, null)
    const loft = next.items.find((i) => i.kind === 'loft')
    expect(loft?.params?.profileCount).toBe(3)
    expect(loft?.params?.separationMm).toBe(d.loftSeparationMm)
  })
})
