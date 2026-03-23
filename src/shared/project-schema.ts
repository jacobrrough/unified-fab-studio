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
  notes: z.string().optional(),
  /**
   * Optional physical material metadata (local BOM / rough mass notes; not cloud-backed).
   * Density is kg/m³ when set.
   */
  physicalMaterial: z
    .object({
      name: z.string().optional(),
      densityKgM3: z.number().positive().optional()
    })
    .optional(),
  /** Free-text finish / color / appearance notes for documentation or export. */
  appearanceNotes: z.string().optional()
})

export type ProjectFile = z.infer<typeof projectSchema>

export const appSettingsSchema = z.object({
  curaEnginePath: z.string().optional(),
  /** Directory containing Cura `definitions` (fdmprinter.def.json) */
  curaDefinitionsPath: z.string().optional(),
  /**
   * Optional path to a machine `.def.json` passed as CuraEngine `-j` (overrides bundled
   * `resources/slicer/creality_k2_plus.def.json` when non-empty).
   */
  curaMachineDefinitionPath: z.string().optional(),
  /** CuraEngine `-s` bundle for `buildCuraSliceArgs` (see `cura-slice-defaults.ts`). */
  curaSlicePreset: z.enum(['balanced', 'draft', 'fine']).optional(),
  /**
   * Extra CuraEngine `-s` keys as JSON object, e.g. `{"infill_pattern":"grid","material_print_temperature":"210"}`.
   * Merged after the numeric preset; keys match Cura setting ids (underscore names).
   */
  curaEngineExtraSettingsJson: z.string().optional(),
  /**
   * JSON array of named profiles: `[{"id":"pla","label":"PLA","basePreset":"balanced","settingsJson":"{}"}]`.
   * See Utilities → Slice and `mergeCuraSliceInvocationSettings`.
   */
  curaSliceProfilesJson: z.string().optional(),
  /** When set, Slice merges this profile from `curaSliceProfilesJson` after the global extra JSON. */
  curaActiveSliceProfileId: z.string().optional(),
  prusaSlicerPath: z.string().optional(),
  pythonPath: z.string().optional(),
  /** Last folder used when opening/creating a project (legacy; see `recentProjectPaths`). */
  lastProjectPath: z.string().optional(),
  /**
   * Default parent folder for **New project** when set (browse in File → Project).
   * Projects are created as subfolders here (e.g. `…/New-job-2025-03-23T12-00-00`).
   */
  projectsRoot: z.string().optional(),
  /** Most recently opened project folders (absolute paths), newest first. */
  recentProjectPaths: z.array(z.string()).optional().default([]),
  theme: z.enum(['dark', 'light']).default('dark')
})

export type AppSettings = z.infer<typeof appSettingsSchema>
