import type { ManufactureFile, ManufactureOperation, ManufactureSetup } from './manufacture-schema'

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

/**
 * Same setup resolution as Make → Generate CAM (`cam:run`): prefer a setup whose `machineId`
 * matches the CNC machine used for the run, else first setup.
 */
/**
 * Tighter stepover for `cnc_pencil` (rest / cleanup raster intent).
 * Uses optional `pencilStepoverMm`, else `pencilStepoverFactor` × base stepover (default 0.22), clamped to tool Ø.
 */
export function resolvePencilStepoverMm(input: {
  baseStepoverMm: number
  toolDiameterMm: number
  operationParams?: Record<string, unknown>
}): number {
  const p = input.operationParams ?? {}
  const toolD = Math.max(0.1, input.toolDiameterMm)
  const explicit = finitePositiveNumber(p['pencilStepoverMm'])
  if (explicit != null) {
    return Math.min(Math.max(explicit, 0.05), toolD * 0.49)
  }
  const rawFactor = p['pencilStepoverFactor']
  let factor = 0.22
  if (typeof rawFactor === 'number' && Number.isFinite(rawFactor)) {
    factor = Math.min(1, Math.max(0.05, rawFactor))
  } else if (typeof rawFactor === 'string' && rawFactor.trim() !== '') {
    const n = Number.parseFloat(rawFactor)
    if (Number.isFinite(n)) factor = Math.min(1, Math.max(0.05, n))
  }
  const scaled = input.baseStepoverMm * factor
  return Math.min(Math.max(scaled, 0.05), toolD * 0.49)
}

export function resolveManufactureSetupForCam(
  mfg: Pick<ManufactureFile, 'setups'>,
  cncMachineId: string | undefined
): ManufactureSetup | undefined {
  if (mfg.setups.length === 0) return undefined
  if (cncMachineId) {
    const hit = mfg.setups.find((s) => s.machineId === cncMachineId)
    if (hit) return hit
  }
  return mfg.setups[0]
}
