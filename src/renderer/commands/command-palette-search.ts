import type { FusionStyleCommand } from '../../shared/fusion-style-command-catalog'

/**
 * When the user types a short alias, also match catalog rows that mention these substrings.
 * Keys are normalized (trimmed lower case).
 */
export const PALETTE_QUERY_ALIASES: Record<string, string[]> = {
  pdf: ['dr_export_pdf'],
  dxf: ['dr_export_dxf'],
  measure: ['ut_measure'],
  distance: ['ut_measure'],
  section: ['ut_section'],
  interference: ['ut_interference', 'as_interference'],
  palette: ['ut_command_palette'],
  shortcuts: ['ut_keyboard_shortcuts'],
  parameters: ['ut_parameters'],
  param: ['ut_parameters'],
  drawing: ['dr_new_sheet', 'dr_export'],
  manifest: ['dr_new_sheet', 'drawing']
}

export function rowMatchesPaletteQuery(row: FusionStyleCommand, q: string): boolean {
  const ql = q.trim().toLowerCase()
  if (!ql) return true
  const hay = `${row.label} ${row.id} ${row.ribbon} ${row.fusionRibbon ?? ''} ${row.notes ?? ''}`.toLowerCase()
  if (hay.includes(ql)) return true
  const extra = PALETTE_QUERY_ALIASES[ql]
  if (extra?.some((term) => hay.includes(term.toLowerCase()))) return true
  return false
}

export function orderRowsByRecent(
  rows: FusionStyleCommand[],
  recentIds: string[],
  qEmpty: boolean
): FusionStyleCommand[] {
  if (!qEmpty || recentIds.length === 0) return rows
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: FusionStyleCommand[] = []
  const seen = new Set<string>()
  for (const id of recentIds) {
    const r = byId.get(id)
    if (r && !seen.has(id)) {
      out.push(r)
      seen.add(id)
    }
  }
  for (const r of rows) {
    if (!seen.has(r.id)) out.push(r)
  }
  return out
}
