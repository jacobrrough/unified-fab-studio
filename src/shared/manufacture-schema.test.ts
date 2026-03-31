import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isManufactureCncOperationKind,
  manufactureFileSchema,
  type ManufactureOperationKind
} from './manufacture-schema'

describe('manufactureFileSchema', () => {
  it('parses legacy v1 files without new setup fields', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [{ id: 'a', label: 'S1', machineId: 'm1' }],
      operations: []
    })
    expect(m.setups[0]!.workCoordinateIndex).toBeUndefined()
  })

  it('trims setup id, label, machineId', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [{ id: '  a  ', label: '  S1  ', machineId: '  m1  ' }],
      operations: []
    })
    expect(m.setups[0]).toMatchObject({ id: 'a', label: 'S1', machineId: 'm1' })
  })

  it('rejects empty setup id, label, or machineId', () => {
    expect(() =>
      manufactureFileSchema.parse({
        version: 1,
        setups: [{ id: '', label: 'S', machineId: 'm' }],
        operations: []
      })
    ).toThrow()
    expect(() =>
      manufactureFileSchema.parse({
        version: 1,
        setups: [{ id: 'a', label: '  ', machineId: 'm' }],
        operations: []
      })
    ).toThrow()
  })

  it('trims operation id and label', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [],
      operations: [{ id: '  o1  ', kind: 'cnc_parallel', label: '  Rough  ' }]
    })
    expect(m.operations[0]).toMatchObject({ id: 'o1', label: 'Rough' })
  })

  it('rejects empty operation id or label', () => {
    expect(() =>
      manufactureFileSchema.parse({
        version: 1,
        setups: [],
        operations: [{ id: '', kind: 'cnc_parallel', label: 'L' }]
      })
    ).toThrow()
  })

  it('accepts cnc_adaptive and stock allowance', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [
        {
          id: 'a',
          label: 'S1',
          machineId: 'm1',
          workCoordinateIndex: 2,
          stock: { kind: 'box', x: 100, y: 100, z: 20, allowanceMm: 0.5 }
        }
      ],
      operations: [{ id: 'o1', kind: 'cnc_adaptive', label: 'Rough' }]
    })
    expect(m.operations[0]!.kind).toBe('cnc_adaptive')
    expect(m.setups[0]!.stock?.allowanceMm).toBe(0.5)
  })

  it('accepts fixture note and cnc_waterline op kind', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [{ id: 'a', label: 'S1', machineId: 'm1', fixtureNote: 'Soft jaws' }],
      operations: [{ id: 'o1', kind: 'cnc_waterline', label: 'WL' }]
    })
    expect(m.operations[0]!.kind).toBe('cnc_waterline')
    expect(m.setups[0]!.fixtureNote).toBe('Soft jaws')
  })

  it('accepts cnc_raster op kind', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [],
      operations: [{ id: 'o1', kind: 'cnc_raster', label: 'Raster' }]
    })
    expect(m.operations[0]!.kind).toBe('cnc_raster')
  })

  it('accepts every manufacture operation kind in one file', () => {
    const kinds = [
      'fdm_slice',
      'cnc_parallel',
      'cnc_contour',
      'cnc_pocket',
      'cnc_drill',
      'cnc_adaptive',
      'cnc_waterline',
      'cnc_raster',
      'cnc_pencil',
      'cnc_lathe_turn',
      'export_stl'
    ] as const satisfies readonly ManufactureOperationKind[]
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [],
      operations: kinds.map((kind, i) => ({ id: `o${i}`, kind, label: kind }))
    })
    expect(m.operations.map((o) => o.kind)).toEqual([...kinds])
  })
})

describe('isManufactureCncOperationKind', () => {
  const cncKinds: ManufactureOperationKind[] = [
    'cnc_parallel',
    'cnc_contour',
    'cnc_pocket',
    'cnc_drill',
    'cnc_adaptive',
    'cnc_waterline',
    'cnc_raster',
    'cnc_pencil',
    'cnc_4axis_roughing',
    'cnc_4axis_finishing',
    'cnc_4axis_contour',
    'cnc_4axis_indexed',
    'cnc_lathe_turn'
  ]

  it('is true for every cnc_* manufacture kind', () => {
    for (const k of cncKinds) {
      expect(isManufactureCncOperationKind(k)).toBe(true)
    }
  })

  it('is false for FDM and export kinds', () => {
    expect(isManufactureCncOperationKind('fdm_slice')).toBe(false)
    expect(isManufactureCncOperationKind('export_stl')).toBe(false)
  })
})

describe('4-axis operation kinds', () => {
  it('parses cnc_4axis_roughing operation', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [],
      operations: [
        {
          id: 'rotary-1',
          kind: 'cnc_4axis_roughing',
          label: 'Rotary roughing',
          params: {
            cylinderDiameterMm: 50,
            cylinderLengthMm: 80,
            zPassMm: -3,
            zStepMm: 1,
            stepoverDeg: 5,
            feedMmMin: 600
          }
        }
      ]
    })
    expect(m.operations[0]!.kind).toBe('cnc_4axis_roughing')
    expect(m.operations[0]!.params!['cylinderDiameterMm']).toBe(50)
  })

  it('parses cnc_4axis_indexed operation', () => {
    const m = manufactureFileSchema.parse({
      version: 1,
      setups: [],
      operations: [
        {
          id: 'indexed-1',
          kind: 'cnc_4axis_indexed',
          label: 'Hex flats — 6 faces',
          params: {
            indexAnglesDeg: [0, 60, 120, 180, 240, 300],
            cylinderDiameterMm: 30,
            zPassMm: -2
          }
        }
      ]
    })
    expect(m.operations[0]!.kind).toBe('cnc_4axis_indexed')
    expect(m.operations[0]!.params!['indexAnglesDeg']).toEqual([0, 60, 120, 180, 240, 300])
  })
})

describe('manufacture schema pocket param docs', () => {
  it('keeps pocket param text aligned with policy-facing behavior', () => {
    const source = readFileSync(join(__dirname, 'manufacture-schema.ts'), 'utf-8')
    expect(source).toContain('zStepMm')
    expect(source).toContain("entryMode")
    expect(source).toContain('rampMm')
    expect(source).toContain('rampMaxAngleDeg')
    expect(source).toContain('wallStockMm')
    expect(source).toContain('finishPass')
    expect(source).toContain('finishEachDepth')
  })
})
