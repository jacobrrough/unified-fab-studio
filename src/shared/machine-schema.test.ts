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

  it('parses 4-axis machine profile with axisCount and aAxisRangeDeg', () => {
    const fourAxis = {
      ...minimalCnc,
      id: 'makera-carvera-4axis',
      name: 'Makera Carvera (4th Axis)',
      postTemplate: 'cnc_4axis_grbl.hbs',
      dialect: 'grbl_4axis' as const,
      axisCount: 4,
      aAxisRangeDeg: 360,
      aAxisOrientation: 'x' as const
    }
    const m = machineProfileSchema.parse(fourAxis)
    expect(m.axisCount).toBe(4)
    expect(m.aAxisRangeDeg).toBe(360)
    expect(m.aAxisOrientation).toBe('x')
    expect(m.dialect).toBe('grbl_4axis')
  })

  it('rejects axisCount below 3', () => {
    expect(() => machineProfileSchema.parse({ ...minimalCnc, axisCount: 2 })).toThrow()
  })

  it('rejects unknown aAxisOrientation', () => {
    expect(() =>
      machineProfileSchema.parse({ ...minimalCnc, axisCount: 4, aAxisOrientation: 'z' as never })
    ).toThrow()
  })

  it('allows grbl_4axis dialect', () => {
    const m = machineProfileSchema.parse({ ...minimalCnc, dialect: 'grbl_4axis' as const })
    expect(m.dialect).toBe('grbl_4axis')
  })
})
