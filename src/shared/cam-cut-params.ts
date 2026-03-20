import type { ManufactureOperation } from './manufacture-schema'

/** Matches previous hardcoded `cam:run` values from the Make tab. */
export const CAM_CUT_DEFAULTS = {
  zPassMm: 5,
  stepoverMm: 2,
  feedMmMin: 1200,
  plungeMmMin: 400,
  safeZMm: 10
} as const

export type CamCutParamsResolved = {
  zPassMm: number
  stepoverMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
}

function finiteNonZeroNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseFloat(v)
    if (Number.isFinite(n) && n !== 0) return n
  }
  return undefined
}

function finitePositiveNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseFloat(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

/**
 * Cutting parameters for `cam:run` / OCL config from `manufacture.json` operation `params`.
 * Used for all CNC kinds, including catalog labels “3D” that still map to 2D contour/pocket (`cnc_contour` / `cnc_pocket`).
 * Unknown or invalid fields fall back to {@link CAM_CUT_DEFAULTS}.
 */
export function resolveCamCutParams(operation: ManufactureOperation | undefined): CamCutParamsResolved {
  const p = operation?.params
  if (!p || typeof p !== 'object') {
    return { ...CAM_CUT_DEFAULTS }
  }

  return {
    zPassMm: finiteNonZeroNumber(p['zPassMm']) ?? CAM_CUT_DEFAULTS.zPassMm,
    stepoverMm: finitePositiveNumber(p['stepoverMm']) ?? CAM_CUT_DEFAULTS.stepoverMm,
    feedMmMin: finitePositiveNumber(p['feedMmMin']) ?? CAM_CUT_DEFAULTS.feedMmMin,
    plungeMmMin: finitePositiveNumber(p['plungeMmMin']) ?? CAM_CUT_DEFAULTS.plungeMmMin,
    safeZMm: finitePositiveNumber(p['safeZMm']) ?? CAM_CUT_DEFAULTS.safeZMm
  }
}
