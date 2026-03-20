import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { toolLibraryFileSchema, toolRecordSchema, type ToolLibraryFile, type ToolRecord } from '../shared/tool-schema'

/** Split one CSV line with optional double-quote fields (Fusion exports). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (quote && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      quote = !quote
      continue
    }
    if (c === ',' && !quote) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

/**
 * Fusion / Manufacture **library export CSV** (wide header row, quoted cells).
 * Assumes diameters are **mm** (Fusion library set to metric). Best-effort column match.
 */
export function parseFusionToolsCsv(content: string): ToolRecord[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headerCells = splitCsvLine(lines[0]!).map((c) => c.toLowerCase())
  const idxDia = headerCells.findIndex(
    (h) => h.includes('diameter') || /\bdiam\b/.test(h) || h.includes('ø')
  )
  if (idxDia < 0) return []
  const idxName = headerCells.findIndex(
    (h) => /\bname\b/.test(h) || h.includes('description') || h.includes('tool name')
  )
  const idxFlutes = headerCells.findIndex((h) => h.includes('flute'))
  const tools: ToolRecord[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!)
    const diaRaw = cells[idxDia]?.replace(/,/g, '.').replace(/[^\d.-]/g, '') ?? ''
    const dia = Number(diaRaw)
    if (!Number.isFinite(dia) || dia <= 0) continue
    const name =
      idxName >= 0 && cells[idxName]?.length
        ? cells[idxName]!.replace(/^"|"$/g, '')
        : `Tool Ø${dia}`
    const flutes = idxFlutes >= 0 ? Number(cells[idxFlutes]) : undefined
    tools.push(
      toolRecordSchema.parse({
        id: randomUUID(),
        name,
        type: 'endmill',
        diameterMm: dia,
        fluteCount: Number.isFinite(flutes) ? flutes : undefined,
        source: 'fusion'
      })
    )
  }
  return tools
}

export function parseToolsCsv(content: string): ToolRecord[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].toLowerCase()
  const hasHeader = header.includes('diameter') || header.includes('name')
  const start = hasHeader ? 1 : 0
  const tools: ToolRecord[] = []
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim())
    const name = parts[0] ?? 'tool'
    const diameter = Number(parts[1])
    if (!Number.isFinite(diameter) || diameter <= 0) continue
    const flutes = parts[2] ? Number(parts[2]) : undefined
    const typeRaw = (parts[3] ?? 'endmill').toLowerCase()
    const type = (
      ['endmill', 'ball', 'vbit', 'drill', 'face', 'other'].includes(typeRaw) ? typeRaw : 'endmill'
    ) as ToolRecord['type']
    tools.push(
      toolRecordSchema.parse({
        id: randomUUID(),
        name,
        type,
        diameterMm: diameter,
        fluteCount: Number.isFinite(flutes) ? flutes : undefined,
        source: 'csv'
      })
    )
  }
  return tools
}

export function parseToolsJson(content: string): ToolLibraryFile {
  const data = JSON.parse(content) as unknown
  if (Array.isArray(data)) {
    const tools = data.map((t) => toolRecordSchema.parse({ ...t, id: (t as { id?: string }).id ?? randomUUID() }))
    return toolLibraryFileSchema.parse({ version: 1, tools })
  }
  return toolLibraryFileSchema.parse(data)
}

/** Gzip magic; HSM / Fusion sometimes ship libraries gzipped. */
export function bufferToUtf8ToolXml(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return gunzipSync(buf).toString('utf-8')
    } catch {
      /* fall through */
    }
  }
  return buf.toString('utf-8')
}

function xmlTextContent(tag: string, block: string): string | undefined {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}\\b[^>]*>([^<]*)</(?:[\\w.]+:)?${tag}>`, 'i')
  const m = block.match(re)
  return m?.[1]?.trim()
}

function parseLocalizedNumber(s: string): number {
  return Number(s.replace(/,/g, '.').replace(/[^\d.-]/g, ''))
}

function parseDiameterMm(block: string): number | null {
  const mAttr = block.match(
    /<(?:[\w.]+:)?Diameter\b[^>]*\bunit\s*=\s*["']([^"']*)["'][^>]*>\s*([^<]+)\s*</i
  )
  const mPlain = block.match(/<(?:[\w.]+:)?Diameter\b[^>]*>\s*([^<]+)\s*</i)
  const raw = (mAttr?.[2] ?? mPlain?.[1])?.trim()
  if (!raw) return null
  const n = parseLocalizedNumber(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = (mAttr?.[1] ?? 'mm').toLowerCase()
  if (unit.includes('inch') || unit === 'in' || unit === '"') return n * 25.4
  return n
}

function parseFlutes(block: string): number | undefined {
  for (const t of ['NumberOfFlutes', 'FluteCount', 'Flutes']) {
    const v = xmlTextContent(t, block)
    if (v?.length) {
      const n = Number(v.replace(/\D/g, ''))
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return undefined
}

function parseToolName(block: string, fallbackDia: number): string {
  for (const t of ['Description', 'Name', 'Title', 'ProductID', 'ProductId', 'ToolNumber']) {
    const v = xmlTextContent(t, block)
    if (v?.length) return v
  }
  return `Tool Ø${fallbackDia}`
}

/**
 * Best-effort **HSM / hsmlib-style** XML: repeated `Tool` elements with `Diameter` (+ optional `Description`).
 * Not a full schema; tolerates XML namespaces on tags.
 */
export function parseHsmToolLibraryXml(xml: string): ToolRecord[] {
  const re = /<(?:[\w.]+:)?Tool\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?Tool>/gi
  const tools: ToolRecord[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!
    const dia = parseDiameterMm(block)
    if (dia == null) continue
    const name = parseToolName(block, dia)
    const fluteCount = parseFlutes(block)
    const key = `${name}:${dia}`
    if (seen.has(key)) continue
    seen.add(key)
    tools.push(
      toolRecordSchema.parse({
        id: randomUUID(),
        name,
        type: 'endmill',
        diameterMm: dia,
        fluteCount,
        source: 'hsm'
      })
    )
  }
  return tools
}

/**
 * Load tool rows from a library **file** (CSV, JSON, gzipped XML `.hsmlib` / `.tpgz`, `.tp.xml`, `.xml`).
 */
export function inferToolRecordsFromFileBuffer(fileName: string, buf: Buffer): ToolRecord[] {
  const lower = fileName.toLowerCase()
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'json') {
    const txt = buf.toString('utf-8')
    try {
      return parseToolsJson(txt).tools
    } catch {
      return parseFusionToolExport(txt)
    }
  }

  if (ext === 'csv') {
    const txt = buf.toString('utf-8')
    let t = parseToolsCsv(txt)
    if (t.length === 0) t = parseFusionToolsCsv(txt)
    return t
  }

  const xmlByName =
    lower.endsWith('.hsmlib') ||
    lower.endsWith('.tpgz') ||
    lower.endsWith('.tp.xml') ||
    (ext === 'xml' && (lower.includes('tool') || lower.includes('library') || lower.includes('hsm')))

  if (xmlByName) {
    return parseHsmToolLibraryXml(bufferToUtf8ToolXml(buf))
  }

  const decoded = bufferToUtf8ToolXml(buf)
  if (/<[a-z0-9]*:?Tool\b/i.test(decoded)) {
    return parseHsmToolLibraryXml(decoded)
  }

  return []
}

/** Fusion-style JSON array export (loose keys). */
export function parseFusionToolExport(content: string): ToolRecord[] {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: ToolRecord[] = []
  for (const row of data) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = String(r.name ?? r.description ?? 'Fusion tool')
    const dia = Number(r.diameter ?? r.Diameter ?? r['diameter'])
    if (!Number.isFinite(dia) || dia <= 0) continue
    out.push(
      toolRecordSchema.parse({
        id: randomUUID(),
        name,
        type: 'endmill',
        diameterMm: dia,
        fluteCount: r.fluteCount != null ? Number(r.fluteCount) : undefined,
        source: 'fusion'
      })
    )
  }
  return out
}

/** Vectric / generic SQLite tool DB — optional path handled in IPC with better-sqlite3 omitted; use CSV export from Vectric instead. */
export function mergeToolLibraries(base: ToolLibraryFile, extra: ToolRecord[]): ToolLibraryFile {
  const seen = new Set(base.tools.map((t) => `${t.name}:${t.diameterMm}`))
  const tools = [...base.tools]
  for (const t of extra) {
    const key = `${t.name}:${t.diameterMm}`
    if (seen.has(key)) continue
    seen.add(key)
    tools.push(t)
  }
  return { version: 1, tools }
}
