import { describe, expect, it } from 'vitest'
import { machineProfileFromCpsContent, tryExtractCpsLabel } from './machine-cps-import'

describe('tryExtractCpsLabel', () => {
  it('prefers first line // comment', () => {
    expect(tryExtractCpsLabel('// Plasma table\nother')).toBe('Plasma table')
  })

  it('reads description = double-quoted', () => {
    expect(tryExtractCpsLabel('description = "My vendor post";\n')).toBe('My vendor post')
  })

  it('reads description = single-quoted', () => {
    expect(tryExtractCpsLabel("description = 'Laser head';\n")).toBe('Laser head')
  })
})

describe('machineProfileFromCpsContent', () => {
  const sampleCps = `// Grbl-style export
description = "Bench mill wrapper";
vendor = "custom";
function onOpen() {}
`

  it('builds stub profile with id from filename', () => {
    const m = machineProfileFromCpsContent('bench_mill.cps', sampleCps)
    expect(m.id).toBe('bench_mill')
    expect(m.kind).toBe('cnc')
    expect(m.dialect).toBe('grbl')
    expect(m.postTemplate).toBe('cnc_grbl.hbs')
    expect(m.workAreaMm).toEqual({ x: 300, y: 300, z: 120 })
    expect(m.meta?.importedFromCps).toBe(true)
    expect(m.meta?.cpsOriginalBasename).toBe('bench_mill.cps')
  })

  it('uses first // line for name when present', () => {
    const m = machineProfileFromCpsContent('ignored_name.cps', sampleCps)
    expect(m.name).toBe('Grbl-style export')
  })

  it('uses title from basename when no label in file', () => {
    const m = machineProfileFromCpsContent('haas_vf2.cps', 'var x = 1;\n')
    expect(m.name).toBe('Haas Vf2')
  })

  it('uses fallback id when basename has no alphanumeric', () => {
    const m = machineProfileFromCpsContent('@@@.cps', '')
    expect(m.id).toMatch(/^cps_import_\d+$/)
  })
})
