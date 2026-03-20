import type { Workspace } from './WorkspaceBar'

/** Mirrors `AppShell` `UtilityTab` — kept here to avoid importing UI components into memory helpers. */
export type PersistedUtilityTab =
  | 'project'
  | 'settings'
  | 'slice'
  | 'cam'
  | 'tools'
  | 'commands'
  | 'shortcuts'

const VALID_UTIL: ReadonlySet<PersistedUtilityTab> = new Set([
  'project',
  'settings',
  'slice',
  'cam',
  'tools',
  'commands',
  'shortcuts'
])

const UTILITY_TAB_KEY = 'ufs_utility_tab'

const LAST_WORKSPACE_KEY = 'ufs_last_workspace'
const MFG_OP_FILTER_KEY = 'ufs_mfg_op_filter'
const MFG_ACTIONABLE_ONLY_KEY = 'ufs_mfg_actionable_only'

const VALID: ReadonlySet<Workspace> = new Set(['design', 'assemble', 'manufacture', 'utilities'])

/** Restore last workspace from localStorage, or `fallback` if missing / invalid. */
export function readPersistedWorkspace(fallback: Workspace): Workspace {
  try {
    const raw = localStorage.getItem(LAST_WORKSPACE_KEY)
    if (raw && VALID.has(raw as Workspace)) return raw as Workspace
  } catch {
    /* private mode / quota */
  }
  return fallback
}

export function writePersistedWorkspace(w: Workspace): void {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, w)
  } catch {
    /* ignore */
  }
}

export function readPersistedUtilityTab(fallback: PersistedUtilityTab): PersistedUtilityTab {
  try {
    const raw = localStorage.getItem(UTILITY_TAB_KEY)
    if (raw && VALID_UTIL.has(raw as PersistedUtilityTab)) return raw as PersistedUtilityTab
  } catch {
    /* ignore */
  }
  return fallback
}

export function writePersistedUtilityTab(t: PersistedUtilityTab): void {
  try {
    localStorage.setItem(UTILITY_TAB_KEY, t)
  } catch {
    /* ignore */
  }
}

export type ManufactureOpFilter =
  | 'all'
  | 'missing geometry'
  | 'stale geometry'
  | 'suppressed'
  | 'non-cam'

const VALID_MFG_FILTERS: ReadonlySet<ManufactureOpFilter> = new Set([
  'all',
  'missing geometry',
  'stale geometry',
  'suppressed',
  'non-cam'
])

export function readPersistedManufactureOpFilter(fallback: ManufactureOpFilter): ManufactureOpFilter {
  try {
    const raw = localStorage.getItem(MFG_OP_FILTER_KEY)
    if (raw && VALID_MFG_FILTERS.has(raw as ManufactureOpFilter)) return raw as ManufactureOpFilter
  } catch {
    /* ignore */
  }
  return fallback
}

export function writePersistedManufactureOpFilter(v: ManufactureOpFilter): void {
  try {
    localStorage.setItem(MFG_OP_FILTER_KEY, v)
  } catch {
    /* ignore */
  }
}

export function readPersistedManufactureActionableOnly(fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(MFG_ACTIONABLE_ONLY_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    /* ignore */
  }
  return fallback
}

export function writePersistedManufactureActionableOnly(v: boolean): void {
  try {
    localStorage.setItem(MFG_ACTIONABLE_ONLY_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}
