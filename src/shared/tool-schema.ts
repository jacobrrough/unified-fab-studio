import { z } from 'zod'

/**
 * Per-material speed/feed preset — Makera CAM style.
 * Each tool can carry multiple material presets so selecting a stock
 * material type auto-populates spindle speed, feedrate, and cut depth.
 */
export const toolMaterialPresetSchema = z.object({
  /** Matches StockMaterialType from manufacture-schema (or any custom string). */
  materialType: z.string().trim().min(1),
  /** Spindle speed (RPM). */
  spindleRpm: z.number().positive().optional(),
  /** XY feed rate (mm/min). */
  feedMmMin: z.number().positive().optional(),
  /** Plunge / Z feed rate (mm/min). */
  plungeMmMin: z.number().positive().optional(),
  /** Radial stepover (mm). */
  stepoverMm: z.number().positive().optional(),
  /** Axial step-down per pass (mm). */
  stepDownMm: z.number().positive().optional(),
  /** Whether this preset is active/enabled for auto-selection. */
  enabled: z.boolean().optional()
})

export type ToolMaterialPreset = z.infer<typeof toolMaterialPresetSchema>

/** Canonical tool record for CNC (and optional FDM nozzle as future). */
export const toolRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['endmill', 'ball', 'vbit', 'drill', 'face', 'chamfer', 'thread_mill', 'o_flute', 'corn', 'other']),
  diameterMm: z.number().positive(),
  fluteCount: z.number().int().nonnegative().optional(),
  stickoutMm: z.number().nonnegative().optional(),
  /** Overall length from holder reference */
  lengthMm: z.number().positive().optional(),
  material: z.string().optional(),
  /** Default surface speed m/min — optional */
  surfaceSpeedMMin: z.number().positive().optional(),
  /** Default chipload mm — optional */
  chiploadMm: z.number().positive().optional(),
  notes: z.string().optional(),
  source: z.enum(['manual', 'csv', 'json', 'fusion', 'hsm', 'vectric']).optional(),
  /**
   * Makera CAM-style material presets — per-material speed/feed entries.
   * When a stock material type is selected, the matching enabled preset
   * auto-fills spindle RPM, feed rate, step-down, and stepover for the op.
   */
  materialPresets: z.array(toolMaterialPresetSchema).optional()
})

export type ToolRecord = z.infer<typeof toolRecordSchema>

export const toolLibraryFileSchema = z.object({
  version: z.literal(1),
  tools: z.array(toolRecordSchema)
})

export type ToolLibraryFile = z.infer<typeof toolLibraryFileSchema>
