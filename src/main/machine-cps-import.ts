import { machineProfileSchema, type MachineProfile } from '../shared/machine-schema'

/** Defaults aligned with bundled CNC profiles (see `resources/machines/*.json`). */
const CPS_STUB_DEFAULTS = {
  kind: 'cnc' as const,
  workAreaMm: { x: 300, y: 300, z: 120 },
  maxFeedMmMin: 2000,
  postTemplate: 'cnc_generic_mm.hbs',
  dialect: 'grbl' as const
}

/**
 * First meaningful `//` line or `description = "..."` in the first chunk of the file (Fusion-style CPS).
 */
export function tryExtractCpsLabel(text: string): string | undefined {
  const lines = text.split(/\r?\n/).slice(0, 48)
  for (const line of lines) {
    const comment = line.match(/^\s*\/\/\s*(.+?)\s*$/)
    const c = comment?.[1]?.trim()
    if (c) return c.slice(0, 120)
  }
  for (const line of lines) {
    const dq = line.match(/^\s*description\s*=\s*"([^"]*)"/)
    if (dq?.[1] != null) {
      const t = dq[1].trim()
      if (t) return t.slice(0, 120)
    }
    const sq = line.match(/^\s*description\s*=\s*'([^']*)'/)
    if (sq?.[1] != null) {
      const t = sq[1].trim()
      if (t) return t.slice(0, 120)
    }
  }
  return undefined
}

function sanitizeMachineIdFromBasename(fileBasename: string): string {
  const s = fileBasename
    .replace(/\.cps$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
  if (s.length > 0) return s
  return `cps_import_${Date.now()}`
}

function titleishFromBase(base: string): string {
  const raw = base.replace(/\.cps$/i, '').replace(/[_-]+/g, ' ').trim()
  if (!raw) return 'Imported CPS post'
  return raw.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Build a valid `MachineProfile` stub from a Fusion `.cps` post file. Unified Fab does not run CPS posts.
 */
export function machineProfileFromCpsContent(fileBasename: string, cpsText: string): MachineProfile {
  const baseForTitle = fileBasename.replace(/\.cps$/i, '')
  const id = sanitizeMachineIdFromBasename(fileBasename)
  const fromFile = tryExtractCpsLabel(cpsText)
  const nameRaw = (fromFile && fromFile.length > 0 ? fromFile : titleishFromBase(baseForTitle)).trim()
  const name = nameRaw.length > 0 ? nameRaw : 'Imported CPS post'

  const candidate = {
    id,
    name,
    ...CPS_STUB_DEFAULTS,
    meta: {
      importedFromCps: true,
      cpsOriginalBasename: fileBasename,
      source: 'user' as const
    }
  }
  return machineProfileSchema.parse(candidate)
}
