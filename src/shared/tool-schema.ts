import { z } from 'zod'

/** Canonical tool record for CNC (and optional FDM nozzle as future). */
export const toolRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(['endmill', 'ball', 'vbit', 'drill', 'face', 'other']),
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
  source: z.enum(['manual', 'csv', 'json', 'fusion', 'hsm', 'vectric']).optional()
})

export type ToolRecord = z.infer<typeof toolRecordSchema>

export const toolLibraryFileSchema = z.object({
  version: z.literal(1),
  tools: z.array(toolRecordSchema)
})

export type ToolLibraryFile = z.infer<typeof toolLibraryFileSchema>
