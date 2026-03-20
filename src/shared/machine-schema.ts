import { z } from 'zod'

export const machineProfileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  kind: z.enum(['fdm', 'cnc']),
  /** Millimeters */
  workAreaMm: z.object({
    x: z.number().positive(),
    y: z.number().positive(),
    z: z.number().positive()
  }),
  maxFeedMmMin: z.number().positive(),
  /** Post template filename under resources/posts */
  postTemplate: z.string().trim().min(1),
  /** Replaced in post: grbl, mach3, generic_mm */
  dialect: z.enum(['grbl', 'mach3', 'generic_mm']),
  /** Extra metadata for UI / validation */
  meta: z
    .object({
      manufacturer: z.string().optional(),
      model: z.string().optional()
    })
    .optional()
})

export type MachineProfile = z.infer<typeof machineProfileSchema>
