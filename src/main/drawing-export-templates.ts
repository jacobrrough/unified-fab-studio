/** Pure title-block HTML + minimal DXF for drawing export (no model projection yet). */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeFileStem(name: string): string {
  const t = name.trim() || 'drawing'
  return t.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').slice(0, 120)
}

export function buildTitleBlockHtml(opts: {
  projectTitle: string
  generatedAtIso: string
  appLabel?: string
  /** First sheet name from `drawing/drawing.json` when present */
  sheetTitle?: string
  sheetScale?: string
  /** Manifest view slots — labels + optional preview detail lines; no projected geometry */
  viewPlaceholders?: { kind: string; label: string; detailLine?: string }[]
}): string {
  const title = escapeHtml(opts.projectTitle)
  const when = escapeHtml(opts.generatedAtIso)
  const app = escapeHtml(opts.appLabel ?? 'Unified Fab Studio')
  const sheetLine =
    opts.sheetTitle != null && opts.sheetTitle.trim() !== ''
      ? escapeHtml(opts.sheetTitle.trim()) + (opts.sheetScale?.trim() ? ` · scale ${escapeHtml(opts.sheetScale.trim())}` : '')
      : ''
  const viewList =
    opts.viewPlaceholders && opts.viewPlaceholders.length > 0
      ? `<ul style="text-align:left;margin:0.5em 0 0;padding-left:1.25em;max-width:36em;">${opts.viewPlaceholders
          .map((v) => {
            const detail = v.detailLine?.trim()
              ? `<div style="font-size:9pt;color:#555;margin-top:0.2em;">${escapeHtml(v.detailLine.trim())}</div>`
              : ''
            return `<li>${escapeHtml(v.kind)}${v.label.trim() ? ` — ${escapeHtml(v.label.trim())}` : ''} <span style="color:#666">(placeholder)</span>${detail}</li>`
          })
          .join('')}</ul><p style="margin-top:0.75em;font-size:10pt;color:#444;">No model geometry projected — documentation shell only.</p>`
      : ''
  const viewportInner = viewList
    ? `${viewList}`
    : `Model views are not wired yet.<br/>
      Use this PDF as a documentation shell or print blank title block.`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, Segoe UI, Roboto, sans-serif;
    margin: 0;
    padding: 0;
    color: #111;
    background: #fff;
  }
  .sheet {
    width: 190mm;
    min-height: 277mm;
    margin: 0 auto;
    border: 1px solid #333;
    padding: 10mm 12mm;
    position: relative;
  }
  h1 { font-size: 18pt; margin: 0 0 4mm; }
  .meta { font-size: 9pt; color: #444; margin-bottom: 8mm; }
  .viewport {
    border: 1px dashed #888;
    height: 140mm;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-size: 11pt;
    text-align: center;
    padding: 8mm;
  }
  .block {
    position: absolute;
    right: 12mm;
    bottom: 10mm;
    width: 85mm;
    border: 1px solid #333;
    font-size: 8pt;
    padding: 3mm 4mm;
    line-height: 1.35;
  }
  .block strong { display: block; font-size: 9pt; margin-bottom: 2mm; }
</style>
</head>
<body>
  <div class="sheet">
    <h1>Drawing — ${title}</h1>
    <div class="meta">${app} · generated ${when}${sheetLine ? ` · sheet: ${sheetLine}` : ''}</div>
    <div class="viewport">
      ${viewportInner}
    </div>
    <div class="block">
      <strong>Notes</strong>
      Export STL/STEP from Design or G-code from Manufacture for shop packages.
      2D projection from the 3D model is planned; this sheet is a template only.
    </div>
  </div>
</body>
</html>`
}

/** Minimal ASCII DXF (R12-style) with a frame and labels — opens in most CAD viewers. */
export function buildPlaceholderDxf(opts: {
  projectTitle: string
  generatedAtIso: string
  sheetTitle?: string
  sheetScale?: string
  viewPlaceholders?: { kind: string; label: string; detailLine?: string }[]
}): string {
  const title = opts.projectTitle.slice(0, 80).replace(/\r|\n/g, ' ')
  const sheetBit =
    opts.sheetTitle != null && opts.sheetTitle.trim() !== ''
      ? ` · ${opts.sheetTitle.trim()}${opts.sheetScale?.trim() ? ` (${opts.sheetScale.trim()})` : ''}`
      : ''
  const viewBit =
    opts.viewPlaceholders && opts.viewPlaceholders.length > 0
      ? ` Views: ${opts.viewPlaceholders
          .map((v) => {
            const bits = [`${v.kind}${v.label.trim() ? ` ${v.label}` : ''}`]
            if (v.detailLine?.trim()) bits.push(v.detailLine.trim())
            return bits.join(' · ')
          })
          .join('; ')}.`
      : ''
  const note = `Generated ${opts.generatedAtIso} — placeholder sheet (no model geometry).${sheetBit}${viewBit}`.slice(
    0,
    250
  )

  const lines: string[] = []
  const push = (...xs: string[]) => {
    for (const x of xs) lines.push(x)
  }

  push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1012', '0', 'ENDSEC')
  push('0', 'SECTION', '2', 'TABLES')
  push('0', 'TABLE', '2', 'LAYER', '70', '1')
  push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS')
  push('0', 'ENDTAB', '0', 'ENDSEC')
  push('0', 'SECTION', '2', 'BLOCKS', '0', 'ENDSEC')
  push('0', 'SECTION', '2', 'ENTITIES')

  // Outer frame (mm-ish units)
  const frame = [
    [0, 0, 297, 0],
    [297, 0, 297, 210],
    [297, 210, 0, 210],
    [0, 210, 0, 0]
  ] as const
  for (const [x1, y1, x2, y2] of frame) {
    push('0', 'LINE', '8', '0', '62', '250', '10', String(x1), '20', String(y1), '30', '0', '11', String(x2), '21', String(y2), '31', '0')
  }

  push(
    '0',
    'TEXT',
    '8',
    '0',
    '62',
    '7',
    '10',
    '12',
    '20',
    '198',
    '30',
    '0',
    '40',
    '4',
    '1',
    title
  )
  push(
    '0',
    'TEXT',
    '8',
    '0',
    '62',
    '8',
    '10',
    '12',
    '20',
    '188',
    '30',
    '0',
    '40',
    '2.5',
    '1',
    note
  )

  push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\r\n')
}
