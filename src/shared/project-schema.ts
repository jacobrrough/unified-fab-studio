import { z } from 'zod'

/** Fidelity hint for imported CAD/mesh assets (UFS internal). */
export const roundTripLevelSchema = z.enum(['mesh_only', 'partial', 'full'])

export const importHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  importedAt: z.string(),
  /** File extension or short label, e.g. stl, step, obj */
  sourceFormat: z.string(),
  sourceFileName: z.string(),
  /** Path relative to project root, POSIX-style */
  assetRelativePath: z.string(),
  roundTripLevel: roundTripLevelSchema,
  warnings: z.array(z.string()).optional()
})

export type ImportHistoryEntry = z.infer<typeof importHistoryEntrySchema>

/** On-disk project format (project.json at project root). */
export const projectSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1),
  updatedAt: z.string(),
  activeMachineId: z.string().trim().min(1),
  /** Relative paths inside project folder */
  meshes: z.array(z.string()).default([]),
  /** Phase 1: import audit trail (mesh → project STL pipeline). */
  importHistory: z.array(importHistoryEntrySchema).optional().default([]),
  notes: z.string().optional()
})

export type ProjectFile = z.infer<typeof projectSchema>

export const appSettingsSchema = z.object({
  curaEnginePath: z.string().optional(),
  /** Directory containing Cura `definitions` (fdmprinter.def.json) */
  curaDefinitionsPath: z.string().optional(),
  /** CuraEngine `-s` bundle for `buildCuraSliceArgs` (see `cura-slice-defaults.ts`). */
  curaSlicePreset: z.enum(['balanced', 'draft', 'fine']).optional(),
  prusaSlicerPath: z.string().optional(),
  pythonPath: z.string().optional(),
  lastProjectPath: z.string().optional(),
  theme: z.enum(['dark', 'light']).default('dark')
})

export type AppSettings = z.infer<typeof appSettingsSchema>
