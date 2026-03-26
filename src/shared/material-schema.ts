import { z } from 'zod'

/**
 * CNC cut parameters for a given material.
 * Feed/speed auto-calculation formula:
 *   RPM = (surfaceSpeedMMin * 1000) / (π × toolDiamMm)
 *   FeedMmMin = RPM × fluteCount × chiploadMm
 *   PlungeMmMin = FeedMmMin × plungeFactor
 *   StepoverMm = toolDiamMm × stepoverFactor
 *   ZPassMm = -(toolDiamMm × docFactor)
 */
export const materialCutParamsSchema = z.object({
  /** Recommended surface speed in m/min for carbide tooling */
  surfaceSpeedMMin: z.number().positive(),
  /** Chipload per tooth in mm */
  chiploadMm: z.number().positive(),
  /** Depth-of-cut as fraction of tool diameter (e.g. 0.5 = half-diameter DOC) */
  docFactor: z.number().positive(),
  /** Stepover as fraction of tool diameter (e.g. 0.45 = 45% WOC) */
  stepoverFactor: z.number().positive(),
  /** Plunge feed as fraction of horizontal feed (e.g. 0.3 = 30%) */
  plungeFactor: z.number().positive().default(0.3),
  /** Optional spindle RPM override (ignores surfaceSpeedMMin) */
  rpmOverride: z.number().positive().optional(),
  /** Optional hard feed override in mm/min (ignores all calculated values) */
  feedOverrideMmMin: z.number().positive().optional()
})

export type MaterialCutParams = z.infer<typeof materialCutParamsSchema>

export const materialCategoryEnum = z.enum([
  'softwood',
  'hardwood',
  'mdf',
  'plywood',
  'aluminum_6061',
  'aluminum_cast',
  'steel_mild',
  'steel_tool',
  'stainless',
  'brass',
  'copper',
  'acrylic',
  'hdpe',
  'pvc',
  'delrin',
  'foam',
  'carbon_fiber',
  'other'
])
export type MaterialCategory = z.infer<typeof materialCategoryEnum>

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  softwood:      'Softwood (Pine, Cedar)',
  hardwood:      'Hardwood (Oak, Maple)',
  mdf:           'MDF',
  plywood:       'Plywood',
  aluminum_6061: 'Aluminum 6061',
  aluminum_cast: 'Aluminum (Cast)',
  steel_mild:    'Steel (Mild / A36)',
  steel_tool:    'Steel (Tool / O1)',
  stainless:     'Stainless Steel',
  brass:         'Brass',
  copper:        'Copper',
  acrylic:       'Acrylic (PMMA)',
  hdpe:          'HDPE',
  pvc:           'PVC',
  delrin:        'Delrin (POM / Acetal)',
  foam:          'Foam / Tooling Board',
  carbon_fiber:  'Carbon Fiber',
  other:         'Other'
}

export const materialRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: materialCategoryEnum,
  notes: z.string().optional(),
  source: z.enum(['bundled', 'user']).optional(),
  /** Cut params keyed by a rough tool-type label: 'endmill', 'ball', 'vbit', 'drill', 'default' */
  cutParams: z.record(z.string(), materialCutParamsSchema)
})

export type MaterialRecord = z.infer<typeof materialRecordSchema>

export const materialLibrarySchema = z.object({
  version: z.literal(1),
  materials: z.array(materialRecordSchema)
})

export type MaterialLibrary = z.infer<typeof materialLibrarySchema>

/**
 * Calculate CNC cut parameters for a given material + tool combination.
 * Returns absolute mm/min values ready to plug into operation params.
 */
export function calcCutParams(
  mat: MaterialRecord,
  toolDiamMm: number,
  fluteCount: number = 2,
  toolType: string = 'default'
): {
  feedMmMin: number
  plungeMmMin: number
  stepoverMm: number
  zPassMm: number
  rpm: number
} {
  const cp = mat.cutParams[toolType] ?? mat.cutParams['default']
  if (!cp) {
    // bare fallback — shouldn't happen with good data
    return { feedMmMin: 1000, plungeMmMin: 300, stepoverMm: toolDiamMm * 0.4, zPassMm: -(toolDiamMm * 0.5), rpm: 18000 }
  }

  const rpm = cp.rpmOverride ?? Math.round((cp.surfaceSpeedMMin * 1000) / (Math.PI * toolDiamMm))
  const feedMmMin = cp.feedOverrideMmMin ?? Math.round(rpm * fluteCount * cp.chiploadMm)
  const plungeMmMin = Math.round(feedMmMin * cp.plungeFactor)
  const stepoverMm = Math.round(toolDiamMm * cp.stepoverFactor * 10) / 10
  const zPassMm = -(Math.round(toolDiamMm * cp.docFactor * 10) / 10)

  return { feedMmMin, plungeMmMin, stepoverMm, zPassMm, rpm }
}
