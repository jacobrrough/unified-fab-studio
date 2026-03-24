import { describe, expect, it } from 'vitest'
import { mergeMachineFirstProjectTools } from './tool-merge'

describe('mergeMachineFirstProjectTools', () => {
  it('prefers machine ids and appends project-only', () => {
    const m = mergeMachineFirstProjectTools(
      { version: 1, tools: [{ id: 'a', name: 'A', type: 'endmill', diameterMm: 6 }] },
      { version: 1, tools: [{ id: 'a', name: 'Dup', type: 'endmill', diameterMm: 6 }, { id: 'b', name: 'B', type: 'drill', diameterMm: 3 }] }
    )
    expect(m.tools.map((t) => t.id)).toEqual(['a', 'b'])
  })
})
