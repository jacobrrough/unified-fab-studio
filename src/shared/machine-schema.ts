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
  /** Replaced in post: grbl, mach3, generic_mm, grbl_4axis */
  dialect: z.enum(['grbl', 'mach3', 'generic_mm', 'grbl_4axis']),
  /**
   * Number of controlled axes. 3 = standard XYZ, 4 = XYZ + A rotary axis.
   * Defaults to 3 when absent. Required for 4-axis ops (cnc_4axis_roughing,
   * cnc_4axis_finishing, cnc_4axis_contour, cnc_4axis_indexed) to be offered in the UI.
   */
  axisCount: z.number().int().min(3).max(5).optional(),
  /**
   * For 4-axis machines: rotation range of the A axis in degrees.
   * Typical values: 360 (continuous), 270, 180. Defaults to 360 when absent.
   */
  aAxisRangeDeg: z.number().positive().optional(),
  /**
   * For 4-axis machines: axis of rotation in the part coordinate system.
   * 'x' = A rotates around X, 'y' = A rotates around Y. Defaults to 'x'.
   */
  aAxisOrientation: z.enum(['x', 'y']).optional(),
  /** Extra metadata for UI / validation */
  meta: z
    .object({
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      source: z.enum(['bundled', 'user']).optional(),
      /** Stub profile created from a Fusion / HSM `.cps` post file (app does not execute CPS). */
      importedFromCps: z.boolean().optional(),
      /** Original `.cps` file basename when `importedFromCps` is true. */
      cpsOriginalBasename: z.string().optional(),
      /**
       * For CNC machines with axisCount <= 3: distinguishes VCarve-style 2D/2.5D
       * routing ('2d') from full 3D surfacing CAM ('3d'). Defaults to '2d' when absent.
       * Has no effect on FDM machines or machines with axisCount >= 4.
       */
      cncProfile: z.enum(['2d', '3d']).optional()
    })
    .optional()
})

export type MachineProfile = z.infer<typeof machineProfileSchema>
