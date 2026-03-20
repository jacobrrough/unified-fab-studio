import { z } from 'zod'

export const stockSchema = z.object({
  kind: z.enum(['box', 'cylinder', 'fromExtents']),
  /** mm */
  x: z.number().positive().optional(),
  y: z.number().positive().optional(),
  z: z.number().positive().optional(),
  /** Extra material on stock faces for roughing (mm). */
  allowanceMm: z.number().nonnegative().optional()
})

export const setupSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  machineId: z.string().trim().min(1),
  wcsNote: z.string().optional(),
  /** Fixture / vises / soft-jaw context for the operator (not interpreted by CAM yet). */
  fixtureNote: z.string().optional(),
  /** Work offset index 1–6 → G54–G59 on most mills. */
  workCoordinateIndex: z.number().int().min(1).max(6).optional(),
  stock: stockSchema.optional()
})

export type ManufactureSetup = z.infer<typeof setupSchema>

export const manufactureOperationSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum([
    'fdm_slice',
    'cnc_parallel',
    'cnc_contour',
    'cnc_pocket',
    'cnc_drill',
    /** Adaptive clearing — OpenCAMLib `AdaptiveWaterline` when available; else built-in parallel finish from STL bounds. */
    'cnc_adaptive',
    /** Z-level waterline — OpenCAMLib `Waterline` when `pip install opencamlib` works for your Python; else built-in parallel finish. */
    'cnc_waterline',
    /** XY raster — OpenCAMLib `PathDropCutter` in `engines/cam/ocl_toolpath.py` when available; else built-in 2.5D mesh height-field, then orthogonal bounds zigzag. */
    'cnc_raster',
    'export_stl'
  ]),
  label: z.string().trim().min(1),
  /** Relative path under project: assets/foo.stl */
  sourceMesh: z.string().optional(),
  suppressed: z.boolean().optional(),
  /**
   * CNC CAM (`cam:run`): optional `toolDiameterMm`, `toolId`, `zPassMm`, `stepoverMm`, `feedMmMin`, `plungeMmMin`, `safeZMm`.
   * 2D milling kinds can also pass geometry as arrays:
   * - contour/pocket: `contourPoints: Array<[xMm, yMm]>`, optional `contourSourceId`,
   *   `contourSourceLabel`, `contourSourceSignature` (for sketch drift checks), `contourDerivedAt` (ISO timestamp),
   *   and contour options `contourSide` ('climb'|'conventional'), `leadInMm`, `leadOutMm`.
   *   Pocket can also set `zStepMm` (optional step-down increment), `entryMode` ('plunge'|'ramp'),
   *   `rampMm`, optional `rampMaxAngleDeg` (default 45: max ramp angle from horizontal; XY run may grow),
   *   `wallStockMm` (rough stock to leave), `finishPass` (boolean, default true), and
   *   `finishEachDepth` (boolean, default false).
   * - drill: `drillPoints: Array<[xMm, yMm]>`, optional `retractMm`, `peckMm`, `dwellMs`,
   *   `drillCycle` ('expanded'|'g81'|'g82'|'g83')
   *   and `drillDerivedAt` (ISO timestamp)
   * See `resolveCamCutParams` / `resolveCamToolDiameterMm` for defaults.
   */
  params: z.record(z.string(), z.unknown()).optional()
})

export const manufactureFileSchema = z.object({
  version: z.literal(1),
  setups: z.array(setupSchema).default([]),
  operations: z.array(manufactureOperationSchema).default([])
})

export type ManufactureFile = z.infer<typeof manufactureFileSchema>
export type ManufactureOperation = z.infer<typeof manufactureOperationSchema>
export type ManufactureOperationKind = ManufactureOperation['kind']

/**
 * Whether this operation kind uses the CNC CAM path (`cam:run`, tool / cut params).
 * Convention: CNC kinds use the `cnc_` prefix — keep that when extending the enum above.
 */
export function isManufactureCncOperationKind(kind: ManufactureOperationKind): boolean {
  return kind.startsWith('cnc_')
}

export function emptyManufacture(): ManufactureFile {
  return { version: 1, setups: [], operations: [] }
}
