/**
 * CuraEngine `-s` values used by `buildCuraSliceArgs` in `src/main/slicer.ts`.
 * Keep docs (Utilities → Slice, VERIFICATION) aligned with this object.
 */
export const CURA_SLICE_CLI_DEFAULTS = {
  layerHeightMm: 0.2,
  lineWidthMm: 0.4,
  wallLineCount: 2,
  infillSparseDensity: 15
} as const

export type CuraSliceCliParams = typeof CURA_SLICE_CLI_DEFAULTS

/** Named presets (Utilities → Slice). `balanced` matches {@link CURA_SLICE_CLI_DEFAULTS}. */
export const CURA_SLICE_PRESET_IDS = ['balanced', 'draft', 'fine'] as const
export type CuraSlicePresetId = (typeof CURA_SLICE_PRESET_IDS)[number]

export const CURA_SLICE_PRESETS: Record<CuraSlicePresetId, CuraSliceCliParams> = {
  balanced: { ...CURA_SLICE_CLI_DEFAULTS },
  draft: { layerHeightMm: 0.3, lineWidthMm: 0.4, wallLineCount: 1, infillSparseDensity: 10 },
  fine: { layerHeightMm: 0.12, lineWidthMm: 0.4, wallLineCount: 3, infillSparseDensity: 20 }
}

export function resolveCuraSliceParams(presetId?: string | null): CuraSliceCliParams {
  if (presetId && presetId in CURA_SLICE_PRESETS) {
    return { ...CURA_SLICE_PRESETS[presetId as CuraSlicePresetId] }
  }
  return { ...CURA_SLICE_CLI_DEFAULTS }
}
