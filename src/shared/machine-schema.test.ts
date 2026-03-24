import { describe, expect, it } from 'vitest'
import { machineProfileSchema } from './machine-schema'

const minimalCnc = {
  id: 'cnc1',
  name: 'Bench',
  kind: 'cnc' as const,
  workAreaMm: { x: 200, y: 200, z: 50 },
  maxFeedMmMin: 3000,
  postTemplate: 'grbl_mm.hbs',
  dialect: 'grbl' as const
}

describe('machineProfileSchema', () => {
  it('parses CNC profile', () => {
    const m = machineProfileSchema.parse(minimalCnc)
    expect(m.kind).toBe('cnc')
  })

  it('trims id, name, and postTemplate', () => {
    const m = machineProfileSchema.parse({
      ...minimalCnc,
      id: '  cnc1  ',
      name: '  Bench  ',
      postTemplate: '  grbl_mm.hbs  '
    })
    expect(m).toMatchObject({ id: 'cnc1', name: 'Bench', postTemplate: 'grbl_mm.hbs' })
  })

  it('rejects empty id, name, or postTemplate after trim', () => {
    expect(() => machineProfileSchema.parse({ ...minimalCnc, id: '' })).toThrow()
    expect(() => machineProfileSchema.parse({ ...minimalCnc, name: '   ' })).toThrow()
    expect(() => machineProfileSchema.parse({ ...minimalCnc, postTemplate: '' })).toThrow()
  })

  it('allows optional CPS import meta', () => {
    const m = machineProfileSchema.parse({
      ...minimalCnc,
      meta: { source: 'user', importedFromCps: true, cpsOriginalBasename: 'foo.cps' }
    })
    expect(m.meta).toMatchObject({ importedFromCps: true, cpsOriginalBasename: 'foo.cps' })
  })
})
