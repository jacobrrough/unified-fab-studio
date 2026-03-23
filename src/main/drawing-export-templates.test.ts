import { describe, expect, it } from 'vitest'
import {
  buildFlatPatternDxf,
  buildPlaceholderDxf,
  buildTitleBlockHtml,
  escapeHtml,
  sanitizeFileStem
} from './drawing-export-templates'

describe('drawing-export-templates', () => {
  it('escapeHtml escapes special characters', () => {
    expect(escapeHtml(`a<b>"c"&'`)).toBe('a&lt;b&gt;&quot;c&quot;&amp;&#39;')
  })

  it('sanitizeFileStem strips unsafe characters', () => {
    expect(sanitizeFileStem(`foo/bar:name`)).toBe('foo_bar_name')
  })

  it('buildTitleBlockHtml includes escaped project title', () => {
    const html = buildTitleBlockHtml({
      projectTitle: '<script>',
      generatedAtIso: '2020-01-01'
    })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('buildTitleBlockHtml includes sheet title and scale when provided', () => {
    const html = buildTitleBlockHtml({
      projectTitle: 'Proj',
      generatedAtIso: '2020-01-01',
      sheetTitle: 'General',
      sheetScale: '1:2'
    })
    expect(html).toContain('General')
    expect(html).toContain('1:2')
  })

  it('buildTitleBlockHtml lists view placeholders when provided', () => {
    const html = buildTitleBlockHtml({
      projectTitle: 'Proj',
      generatedAtIso: '2020-01-01',
      viewPlaceholders: [{ kind: 'base', label: 'Front' }]
    })
    expect(html).toContain('base')
    expect(html).toContain('Front')
    expect(html).toContain('metadata')
  })

  it('buildTitleBlockHtml includes detail lines when provided', () => {
    const html = buildTitleBlockHtml({
      projectTitle: 'Proj',
      generatedAtIso: '2020-01-01',
      viewPlaceholders: [{ kind: 'base', label: 'Front', detailLine: 'Base · view from front — preview' }]
    })
    expect(html).toContain('view from front')
  })

  it('buildPlaceholderDxf is a minimal closed DXF', () => {
    const dxf = buildPlaceholderDxf({ projectTitle: 'P1', generatedAtIso: 'day' })
    expect(dxf).toContain('SECTION')
    expect(dxf).toContain('ENTITIES')
    expect(dxf).toContain('EOF')
    expect(dxf).toContain('P1')
  })

  it('buildPlaceholderDxf embeds sheet metadata in note', () => {
    const dxf = buildPlaceholderDxf({
      projectTitle: 'P1',
      generatedAtIso: 'day',
      sheetTitle: 'A1',
      sheetScale: '1:1'
    })
    expect(dxf).toContain('A1')
    expect(dxf).toContain('1:1')
  })

  it('buildPlaceholderDxf mentions view placeholders in note', () => {
    const dxf = buildPlaceholderDxf({
      projectTitle: 'P1',
      generatedAtIso: 'day',
      viewPlaceholders: [{ kind: 'projected', label: 'Right' }]
    })
    expect(dxf).toContain('projected')
    expect(dxf).toContain('Right')
  })

  it('buildFlatPatternDxf includes bend layer geometry', () => {
    const dxf = buildFlatPatternDxf({
      projectTitle: 'FlatP',
      generatedAtIso: 'day',
      outlinePoints: [
        [0, 0],
        [20, 0],
        [20, 10],
        [0, 10]
      ],
      bendLines: [[0, 5, 20, 5]]
    })
    expect(dxf).toContain('BEND')
    expect(dxf).toContain('FlatP')
    expect(dxf).toContain('EOF')
  })
})
