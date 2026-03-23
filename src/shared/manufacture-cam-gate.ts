/**
 * Manufacture operation kinds that must not run through `cam:run` / Generate CAM.
 * Single source of truth for main (`describeCamOperationKind`) and renderer (early exit).
 */
export type ManufactureCamBlockedKind = 'fdm_slice' | 'export_stl'

const BLOCKED = new Set<string>(['fdm_slice', 'export_stl'])

export function isManufactureKindBlockedFromCam(kind: string | undefined): boolean {
  if (kind == null || kind === '') return false
  return BLOCKED.has(kind)
}

/** When non-null, `cam:run` should reject this kind (same copy as IPC policy). */
export function getManufactureCamRunBlock(kind: string | undefined): { error: string; hint: string } | null {
  if (kind === 'fdm_slice') {
    return {
      error: 'FDM slicing is not available through Generate CAM.',
      hint:
        'Use Utilities → Slice (CuraEngine) or Manufacture → Slice with CuraEngine on an fdm_slice row (source mesh + merged Cura settings from Settings). fdm_slice is not sent through cam:run / Generate CAM.'
    }
  }
  if (kind === 'export_stl') {
    return {
      error: 'Export STL is not a CNC toolpath operation.',
      hint: 'Export meshes from Design or project assets/. The export_stl operation is for planning only and does not use cam:run.'
    }
  }
  return null
}
