import { z } from 'zod'

/**
 * Stock material types — used to auto-select tool presets (Makera CAM style).
 * The material type drives default speed/feed lookup in materialPresets on ToolRecord.
 */
export const STOCK_MATERIAL_TYPES = [
  'wood',
  'plywood',
  'mdf',
  'aluminum',
  'brass',
  'steel',
  'plastic',
  'acrylic',
  'pcb',
  'carbon_fiber',
  'foam',
  'wax',
  'other'
] as const

export type StockMaterialType = (typeof STOCK_MATERIAL_TYPES)[number]

export const STOCK_MATERIAL_LABELS: Record<StockMaterialType, string> = {
  wood: 'Wood (hardwood)',
  plywood: 'Plywood',
  mdf: 'MDF',
  aluminum: 'Aluminum',
  brass: 'Brass',
  steel: 'Steel',
  plastic: 'Plastic (general)',
  acrylic: 'Acrylic / PMMA',
  pcb: 'PCB (FR4)',
  carbon_fiber: 'Carbon Fiber',
  foam: 'Foam / EPS',
  wax: 'Machinable Wax',
  other: 'Other'
}

/**
 * WCS origin control point — maps to one of 10 positions on the stock (5 top + 5 bottom).
 * Matches the Makera CAM "10-point stock origin picker" concept.
 * top-tl / top-tc / top-tr / top-ml / top-center / top-mr / top-bl / top-bc / top-br = 9 (3×3 grid)
 * bottom-center = 10th point (flip side reference).
 */
export const WCS_ORIGIN_POINTS = [
  'top-tl',
  'top-tc',
  'top-tr',
  'top-ml',
  'top-center',
  'top-mr',
  'top-bl',
  'top-bc',
  'top-br',
  'bottom-center'
] as const

export type WcsOriginPoint = (typeof WCS_ORIGIN_POINTS)[number]

export const stockSchema = z.object({
  kind: z.enum(['box', 'cylinder', 'fromExtents']),
  /** mm */
  x: z.number().positive().optional(),
  y: z.number().positive().optional(),
  z: z.number().positive().optional(),
  /** Extra material on stock faces for roughing (mm). */
  allowanceMm: z.number().nonnegative().optional(),
  /** Material type for auto speed/feed preset lookup. */
  materialType: z.enum(STOCK_MATERIAL_TYPES).optional()
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
  stock: stockSchema.optional(),
  /**
   * Makera-style WCS origin control point — one of 10 positions on the stock
   * (3×3 top grid + bottom center). Tells the operator which corner/face of
   * the physical workpiece maps to machine zero.
   */
  wcsOriginPoint: z.enum(WCS_ORIGIN_POINTS).optional(),
  /** Axis count for this setup: 3 (default) or 4. Drives default op kinds offered. */
  axisMode: z.enum(['3axis', '4axis']).optional()
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
    /** Adaptive clearing — OpenCAMLib `AdaptiveWaterline` when available; else built-in parallel finish from STL bounds (CAM run reports fallback reason). */
    'cnc_adaptive',
    /** Z-level waterline — OpenCAMLib `Waterline` when `pip install opencamlib` works for your Python; else built-in parallel finish (CAM run reports fallback reason). */
    'cnc_waterline',
    /** XY raster — OpenCAMLib `PathDropCutter` in `engines/cam/ocl_toolpath.py` when available; else built-in 2.5D mesh height-field, then orthogonal bounds zigzag (reason shown in CAM output). */
    'cnc_raster',
    /**
     * Pencil / rest cleanup — same OpenCAMLib **raster** path as `cnc_raster` with a **tighter effective stepover**
     * (`resolvePencilStepoverMm`: optional `pencilStepoverMm` or `pencilStepoverFactor` × op stepover, default factor 0.22).
     */
    'cnc_pencil',
    /**
     * 4-axis wrapping — cylindrical wrapping of an XZ profile around the A axis.
     * Wraps a 2D contour (or mesh-height raster) onto a cylinder; useful for
     * engraving, relief carving, and cylindrical parts on the Carvera 4th-axis
     * attachment. Requires `axisCount >= 4` on the active machine profile.
     * Params: `cylinderDiameterMm`, `wrapAxis` ('x'|'y'), `wrapMode` ('contour'|'raster'|'parallel'),
     * `zPassMm`, `stepoverMm`, `feedMmMin`, `safeZMm`, `toolDiameterMm`.
     */
    'cnc_4axis_wrapping',
    /**
     * 4-axis indexed — machine multiple 3-axis setups with the A axis locked at
     * discrete rotation angles. Each index stop is a separate sub-operation.
     * Requires `axisCount >= 4` on the active machine profile.
     * Params: `indexAnglesDeg` (array of A-axis stops, e.g. [0, 90, 180, 270]),
     * `zPassMm`, `stepoverMm`, `feedMmMin`, `safeZMm`, `toolDiameterMm`.
     */
    'cnc_4axis_indexed',
    /**
     * 3D Roughing — aggressive adaptive clearing to remove bulk material.
     * Routes to OpenCAMLib `AdaptiveWaterline` when available; falls back to
     * built-in parallel with coarse stepover. Leaves `stockAllowanceMm` on walls.
     * Params: `zPassMm`, `stepoverMm`, `feedMmMin`, `plungeMmMin`, `safeZMm`,
     *   `toolDiameterMm`, `stockAllowanceMm` (default 0.5), `toolId`.
     */
    'cnc_3d_rough',
    /**
     * 3D Finishing — fine surface pass to hit final geometry tolerance.
     * Uses raster (default) or waterline strategy with tight stepover.
     * Params: `zPassMm`, `stepoverMm`, `feedMmMin`, `plungeMmMin`, `safeZMm`,
     *   `toolDiameterMm`, `finishStrategy` ('raster'|'waterline'|'pencil'),
     *   `finishStepoverMm` (overrides stepoverMm for finer resolution), `toolId`.
     */
    'cnc_3d_finish',
    /**
     * 2D Chamfer — cuts a chamfer along an edge contour using a V-bit or chamfer mill.
     * Params: `contourPoints: [x,y][]`, `chamferAngleDeg` (tool half-angle, default 45),
     * `chamferDepthMm` (cut depth for chamfer profile), `toolDiameterMm`, `feedMmMin`, `safeZMm`.
     */
    'cnc_chamfer',
    /**
     * Thread milling — helical thread entry along a contour or single bore.
     * Params: `contourPoints: [x,y][]`, `threadPitchMm`, `threadDepthMm`,
     * `threadDirection` ('right'|'left'), `zPassMm`, `toolDiameterMm`, `feedMmMin`, `safeZMm`.
     */
    'cnc_thread_mill',
    /**
     * Laser — vector or raster laser path (inline with milling ops, same project).
     * Params: `laserMode` ('vector'|'raster'|'fill'), `laserPower` (0–100%),
     * `laserSpeed` (mm/min), `passes` (integer), `contourPoints: [x,y][]` for vector mode.
     */
    'cnc_laser',
    /**
     * PCB isolation (trace/copper clearing) — imported from Gerber or polygon contours.
     * Params: `contourPoints: [x,y][][]` (array of polygons), `isolationDepthMm` (default 0.05),
     * `toolDiameterMm`, `feedMmMin`, `safeZMm`.
     */
    'cnc_pcb_isolation',
    /**
     * PCB drilling — drill holes from Excellon / drill point array.
     * Params: `drillPoints: [x,y][]`, `zPassMm`, `toolDiameterMm`, `feedMmMin`, `safeZMm`.
     */
    'cnc_pcb_drill',
    /**
     * PCB board outline contour — cuts the PCB perimeter with optional tabs.
     * Params: `contourPoints: [x,y][]`, `zPassMm`, `zStepMm`, `tabCount`, `tabWidthMm`,
     * `tabHeightMm`, `toolDiameterMm`, `feedMmMin`, `safeZMm`.
     */
    'cnc_pcb_contour',
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
   *   Contour: optional `zStepMm` when `zPassMm` is negative — multiple full contour passes stepped into material down to `zPassMm`.
   *   Pocket can also set `zStepMm` (optional step-down increment), `entryMode` ('plunge'|'ramp'),
   *   `rampMm`, optional `rampMaxAngleDeg` (default 45: max ramp angle from horizontal; XY run may grow),
   *   `wallStockMm` (rough stock to leave), `finishPass` (boolean, default true), and
   *   `finishEachDepth` (boolean, default false).
   * - drill: `drillPoints: Array<[xMm, yMm]>`, optional `retractMm`, `peckMm`, `dwellMs`,
   *   `drillCycle` ('expanded'|'g81'|'g82'|'g83')
   *   and `drillDerivedAt` (ISO timestamp)
   * - pencil (`cnc_pencil`): optional `pencilStepoverMm` (mm, clamped to tool Ø) or `pencilStepoverFactor` (0.05–1, default 0.22)
   *   applied to resolved `stepoverMm` for the tight raster pass.
   * - contour/pcb_contour tab generation: optional `tabsMode` ('none'|'count'|'interval'),
   *   `tabCount` (int, for 'count' mode), `tabIntervalMm` (mm, for 'interval' mode),
   *   `tabWidthMm` (default 3), `tabHeightMm` (default 1.5) — holding bridges auto-inserted.
   * - chamfer (`cnc_chamfer`): `contourPoints: [x,y][]`, `chamferAngleDeg` (default 45),
   *   `chamferDepthMm` (how far below surface to reach full width), `toolDiameterMm`, `feedMmMin`.
   * - laser (`cnc_laser`): `laserMode` ('vector'|'raster'|'fill'), `laserPower` (0–100),
   *   `laserSpeed` mm/min, `passes`, `contourPoints` for vector/fill.
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
