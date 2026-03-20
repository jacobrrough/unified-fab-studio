import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  bufferToUtf8ToolXml,
  inferToolRecordsFromFileBuffer,
  parseFusionToolExport,
  parseFusionToolsCsv,
  parseHsmToolLibraryXml,
  parseToolsCsv,
  splitCsvLine
} from './tools-import'

describe('parseToolsCsv', () => {
  it('parses header and rows', () => {
    const csv = `name,diameterMm,fluteCount,type
Rough,6.35,3,endmill`
    const tools = parseToolsCsv(csv)
    expect(tools).toHaveLength(1)
    expect(tools[0]!.name).toBe('Rough')
    expect(tools[0]!.diameterMm).toBeCloseTo(6.35)
    expect(tools[0]!.fluteCount).toBe(3)
  })
})

describe('parseFusionToolExport', () => {
  it('maps diameter fields', () => {
    const j = JSON.stringify([{ name: 'T1', diameter: 3.0, fluteCount: 2 }])
    const tools = parseFusionToolExport(j)
    expect(tools[0]!.diameterMm).toBe(3)
  })
})

describe('splitCsvLine', () => {
  it('handles quoted commas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
  })
})

describe('parseFusionToolsCsv', () => {
  it('parses wide header and quoted rows', () => {
    const csv = [
      'Name [desc],Tool Diameter (mm) [diameter],Flutes',
      '"Rough, 6mm",6.0,3',
      'Finish,3.175,2'
    ].join('\n')
    const tools = parseFusionToolsCsv(csv)
    expect(tools).toHaveLength(2)
    expect(tools[0]!.diameterMm).toBe(6)
    expect(tools[0]!.name).toContain('Rough')
    expect(tools[1]!.diameterMm).toBeCloseTo(3.175)
  })
})

describe('parseHsmToolLibraryXml', () => {
  it('parses Tool blocks (mm and inch diameter)', () => {
    const xml = `<Lib>
      <Tool><Description>A</Description><Diameter>4</Diameter><NumberOfFlutes>2</NumberOfFlutes></Tool>
      <hsm:Tool xmlns:hsm="x"><hsm:Name>B</hsm:Name><hsm:Diameter unit="inch">0.25</hsm:Diameter></hsm:Tool>
    </Lib>`
    const tools = parseHsmToolLibraryXml(xml)
    expect(tools).toHaveLength(2)
    expect(tools[0]!.diameterMm).toBe(4)
    expect(tools[0]!.source).toBe('hsm')
    expect(tools[1]!.diameterMm).toBeCloseTo(6.35)
  })
})

describe('bufferToUtf8ToolXml', () => {
  it('gunzips buffers with gzip magic', () => {
    const inner = '<Tool><Description>X</Description><Diameter>2</Diameter></Tool>'
    const buf = gzipSync(Buffer.from(inner, 'utf-8'))
    expect(bufferToUtf8ToolXml(buf)).toContain('Description')
  })
})

describe('inferToolRecordsFromFileBuffer', () => {
  it('reads gzipped hsmlib by file name', () => {
    const xml = '<Tool><Description>Z</Description><Diameter>5</Diameter></Tool>'
    const buf = gzipSync(Buffer.from(xml, 'utf-8'))
    const tools = inferToolRecordsFromFileBuffer('MyLib.hsmlib', buf)
    expect(tools).toHaveLength(1)
    expect(tools[0]!.name).toBe('Z')
  })
})
