import { z } from 'zod'

/** When true, op stays in `kernelOps` order but is omitted from CadQuery `postSolidOps`. */
const suppressKernel = { suppressed: z.boolean().optional() } as const

/** Scalar mm in world space; rejects NaN/±Infinity (aligned with `build_part.py` `_require_finite_mm`). */
const mm = z.number().finite()
const mmPos = z.number().finite().positive()

const pathPoint2d = z.tuple([mm, mm])

const patternRectangularSchema = z
  .object({
    kind: z.literal('pattern_rectangular'),
    countX: z.number().int().min(1).max(32),
    countY: z.number().int().min(1).max(32),
    spacingXMm: mm,
    spacingYMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.countX > 1 || o.countY > 1, { message: 'pattern_rectangular needs countX>1 or countY>1' })

/** Rotate copies of the current solid around +Z through (`centerXMm`, `centerYMm`, 0). */
const patternCircularSchema = z.object({
  kind: z.literal('pattern_circular'),
  count: z.number().int().min(2).max(32),
  centerXMm: mm,
  centerYMm: mm,
  /** Offset (deg) added to each copy after the first; first instance stays at the original orientation. */
  startAngleDeg: mm.default(0),
  /** Total sweep (deg) divided evenly by `count`; copies at start + i·(total/count) for i=1..count−1. Max 360. */
  totalAngleDeg: mm.min(1).max(360).default(360),
  ...suppressKernel
})

const booleanSubtractCylinderSchema = z
  .object({
    kind: z.literal('boolean_subtract_cylinder'),
    centerXMm: mm,
    centerYMm: mm,
    radiusMm: mmPos,
    zMinMm: mm,
    zMaxMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.zMaxMm > o.zMinMm, { message: 'boolean_subtract_cylinder requires zMaxMm > zMinMm' })

/** Axis-aligned box union in world mm (XY sketch plane, +Z up). */
const booleanUnionBoxSchema = z
  .object({
    kind: z.literal('boolean_union_box'),
    xMinMm: mm,
    xMaxMm: mm,
    yMinMm: mm,
    yMaxMm: mm,
    zMinMm: mm,
    zMaxMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.xMaxMm > o.xMinMm && o.yMaxMm > o.yMinMm && o.zMaxMm > o.zMinMm, {
    message: 'boolean_union_box requires strictly increasing min/max on each axis'
  })

/** Axis-aligned box subtract in world mm (same frame as `boolean_union_box`). */
const booleanSubtractBoxSchema = z
  .object({
    kind: z.literal('boolean_subtract_box'),
    xMinMm: mm,
    xMaxMm: mm,
    yMinMm: mm,
    yMaxMm: mm,
    zMinMm: mm,
    zMaxMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.xMaxMm > o.xMinMm && o.yMaxMm > o.yMinMm && o.zMaxMm > o.zMinMm, {
    message: 'boolean_subtract_box requires strictly increasing min/max on each axis'
  })

/**
 * Sheet-style tab / flange boss stub: union an axis-aligned box (length X × width Y × height Z),
 * bottom face at `zBaseMm`, centered on XY at (`centerXMm`, `centerYMm`). Same world frame as sketch extrude (+Z).
 */
const sheetTabUnionSchema = z.object({
  kind: z.literal('sheet_tab_union'),
  centerXMm: mm,
  centerYMm: mm,
  zBaseMm: mm,
  lengthMm: mmPos,
  widthMm: mmPos,
  heightMm: mmPos,
  ...suppressKernel
})

/** Translate copies along (dx,dy,dz) mm per step (first instance unchanged); cap 32. */
const patternLinear3dSchema = z
  .object({
    kind: z.literal('pattern_linear_3d'),
    count: z.number().int().min(2).max(32),
    dxMm: mm,
    dyMm: mm,
    dzMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.dxMm !== 0 || o.dyMm !== 0 || o.dzMm !== 0, {
    message: 'pattern_linear_3d needs a non-zero step (dxMm, dyMm, or dzMm)'
  })

/** Pattern body instances along a polyline path in sketch/world XY; copies translate to sampled path points. */
const patternPathSchema = z
  .object({
    kind: z.literal('pattern_path'),
    count: z.number().int().min(2).max(32),
    pathPoints: z.array(pathPoint2d).min(2).max(256),
    /** When true, arc length includes a closing segment from last point to first (skipped if first and last coincide). */
    closedPath: z.boolean().optional(),
    ...suppressKernel
  })
  .refine(
    (o) =>
      o.pathPoints.some(([x, y], i) => {
        if (i === 0) return false
        const [px, py] = o.pathPoints[i - 1]!
        return x !== px || y !== py
      }),
    {
      message: 'pattern_path needs at least one non-zero segment'
    }
  )
  .refine((o) => !o.closedPath || o.pathPoints.length >= 3, {
    message: 'pattern_path closedPath requires at least 3 path points'
  })

/**
 * Union the solid with its mirror across a world plane through the given origin:
 * **YZ** → flip X about x = originXMm; **XZ** → flip Y; **XY** → flip Z.
 */
const mirrorUnionPlaneSchema = z.object({
  kind: z.literal('mirror_union_plane'),
  plane: z.enum(['YZ', 'XZ', 'XY']),
  originXMm: mm.default(0),
  originYMm: mm.default(0),
  originZMm: mm.default(0),
  ...suppressKernel
})

/** Keep only volume inside the axis-aligned box (world mm). */
const booleanIntersectBoxSchema = z
  .object({
    kind: z.literal('boolean_intersect_box'),
    xMinMm: mm,
    xMaxMm: mm,
    yMinMm: mm,
    yMaxMm: mm,
    zMinMm: mm,
    zMaxMm: mm,
    ...suppressKernel
  })
  .refine((o) => o.xMaxMm > o.xMinMm && o.yMaxMm > o.yMinMm && o.zMaxMm > o.zMinMm, {
    message: 'boolean_intersect_box requires strictly increasing min/max on each axis'
  })

/**
 * Combine with a second body built from an existing kernel profile index and linear +Z extrude.
 * Profile index references payload `profiles` (closed loops / circles from sketch extraction).
 */
const booleanCombineProfileSchema = z.object({
  kind: z.literal('boolean_combine_profile'),
  mode: z.enum(['union', 'subtract', 'intersect']),
  profileIndex: z.number().int().min(0).max(255),
  extrudeDepthMm: mmPos,
  zStartMm: mm.default(0),
  ...suppressKernel
})

/** Split by axis plane and keep one side (half-space). */
const splitKeepHalfspaceSchema = z.object({
  kind: z.literal('split_keep_halfspace'),
  axis: z.enum(['X', 'Y', 'Z']),
  offsetMm: mm,
  keep: z.enum(['positive', 'negative']),
  ...suppressKernel
})

/** Hole operation from profile reference (typically circle), cut by depth or through-all. */
const holeFromProfileSchema = z
  .object({
    kind: z.literal('hole_from_profile'),
    profileIndex: z.number().int().min(0).max(255),
    mode: z.enum(['depth', 'through_all']),
    depthMm: mmPos.optional(),
    zStartMm: mm.default(0),
    ...suppressKernel
  })
  .refine((o) => o.mode !== 'depth' || (o.depthMm !== undefined && o.depthMm > 0), {
    message: 'hole_from_profile depth mode requires positive depthMm'
  })

/**
 * Simplified cosmetic thread: subtract repeated shallow rings along +Z around a cylinder axis.
 * Kernel caps ring count at 256 (see `build_part.py`); schema does not duplicate that cap.
 */
const threadCosmeticSchema = z.object({
  kind: z.literal('thread_cosmetic'),
  centerXMm: mm,
  centerYMm: mm,
  majorRadiusMm: mmPos,
  pitchMm: mmPos,
  lengthMm: mmPos,
  depthMm: mmPos,
  zStartMm: mm.default(0),
  ...suppressKernel
})

/** Move/copy body by translation vector; optional keepOriginal unions transformed duplicate. */
const transformTranslateSchema = z.object({
  kind: z.literal('transform_translate'),
  dxMm: z.number(),
  dyMm: z.number(),
  dzMm: z.number(),
  keepOriginal: z.boolean().default(false),
  ...suppressKernel
})

/** Press/Pull from profile: signed delta (+ union, - cut) starting at zStartMm. */
const pressPullProfileSchema = z
  .object({
    kind: z.literal('press_pull_profile'),
    profileIndex: z.number().int().min(0).max(255),
    deltaMm: mm,
    zStartMm: mm.default(0),
    ...suppressKernel
  })
  .refine((o) => o.deltaMm !== 0, { message: 'press_pull_profile requires non-zero deltaMm' })

/** Partial sweep: profile translated through path points and unioned segment-wise (no orientation follow yet). */
const sweepProfilePathSchema = z
  .object({
    kind: z.literal('sweep_profile_path'),
    profileIndex: z.number().int().min(0).max(255),
    pathPoints: z.array(pathPoint2d).min(2).max(256),
    zStartMm: mm.default(0),
    ...suppressKernel
  })
  .refine(
    (o) =>
      o.pathPoints.some(([x, y], i) => {
        if (i === 0) return false
        const [px, py] = o.pathPoints[i - 1]!
        return x !== px || y !== py
      }),
    { message: 'sweep_profile_path needs at least one non-zero segment' }
  )

/** Partial pipe along path points using circular section; optional wall thickness for hollow pipe. */
const pipePathSchema = z
  .object({
    kind: z.literal('pipe_path'),
    pathPoints: z.array(pathPoint2d).min(2).max(256),
    outerRadiusMm: mmPos,
    wallThicknessMm: mmPos.optional(),
    zStartMm: mm.default(0),
    ...suppressKernel
  })
  .refine(
    (o) =>
      o.pathPoints.some(([x, y], i) => {
        if (i === 0) return false
        const [px, py] = o.pathPoints[i - 1]!
        return x !== px || y !== py
      }),
    { message: 'pipe_path needs at least one non-zero segment' }
  )
  .refine((o) => o.wallThicknessMm == null || o.wallThicknessMm < o.outerRadiusMm, {
    message: 'pipe_path wallThicknessMm must be less than outerRadiusMm'
  })

/** Partial thicken surrogate: isotropic scale about body center (not true face offset). */
const thickenScaleSchema = z
  .object({
    kind: z.literal('thicken_scale'),
    deltaMm: z.number(),
    ...suppressKernel
  })
  .refine((o) => o.deltaMm !== 0, { message: 'thicken_scale requires non-zero deltaMm' })

/**
 * Partial coil: helical-style ring cuts stacked along Z (simplified, not true sweep of a section).
 * Kernel caps ring instances at 1024 (see `build_part.py`); schema does not duplicate that cap.
 */
const coilCutSchema = z.object({
  kind: z.literal('coil_cut'),
  centerXMm: mm,
  centerYMm: mm,
  majorRadiusMm: mmPos,
  pitchMm: mmPos,
  turns: mmPos.max(100),
  depthMm: mmPos,
  zStartMm: mm.default(0),
  ...suppressKernel
})

/**
 * Ordered post-base ops for `engines/occt/build_part.py` (Phase 3). Persisted in `part/features.json`.
 * Order is significant: e.g. apply `fillet_all` / `chamfer_all` before `shell_inward` when you want fillets on outer edges;
 * booleans after pattern if the tool should cut every instance (kernel applies this array in sequence as written).
 */
export const kernelPostSolidOpSchema = z.union([
  z.object({ kind: z.literal('fillet_all'), radiusMm: mmPos, ...suppressKernel }),
  z.object({ kind: z.literal('chamfer_all'), lengthMm: mmPos, ...suppressKernel }),
  z.object({
    kind: z.literal('fillet_select'),
    radiusMm: mmPos,
    edgeDirection: z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']),
    ...suppressKernel
  }),
  z.object({
    kind: z.literal('chamfer_select'),
    lengthMm: mmPos,
    edgeDirection: z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']),
    ...suppressKernel
  }),
  /**
   * Shell inward after removing one planar cap (default +Z, typical +Z extrusion).
   * `openDirection` selects which axis extremum to open (+X…−Z); kernel tries the opposite cap if OCC rejects the first.
   */
  z.object({
    kind: z.literal('shell_inward'),
    thicknessMm: mmPos,
    openDirection: z.enum(['+X', '-X', '+Y', '-Y', '+Z', '-Z']).optional(),
    ...suppressKernel
  }),
  patternRectangularSchema,
  patternCircularSchema,
  patternLinear3dSchema,
  patternPathSchema,
  booleanSubtractCylinderSchema,
  booleanUnionBoxSchema,
  booleanSubtractBoxSchema,
  booleanIntersectBoxSchema,
  booleanCombineProfileSchema,
  splitKeepHalfspaceSchema,
  holeFromProfileSchema,
  threadCosmeticSchema,
  transformTranslateSchema,
  pressPullProfileSchema,
  sweepProfilePathSchema,
  pipePathSchema,
  thickenScaleSchema,
  coilCutSchema,
  mirrorUnionPlaneSchema,
  sheetTabUnionSchema
])

export type KernelPostSolidOp = z.infer<typeof kernelPostSolidOpSchema>

/** Lightweight feature metadata (Fusion-style browser); geometry still driven by `design/sketch.json` until OCCT history lands. */
export const partFeatureItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['sketch', 'extrude', 'revolve', 'loft', 'fillet', 'chamfer', 'boolean', 'pattern', 'mirror']),
  label: z.string(),
  suppressed: z.boolean().optional(),
  /** Free-form params for UI / future regen */
  params: z.record(z.string(), z.unknown()).optional()
})

export const partFeaturesFileSchema = z.object({
  version: z.literal(1),
  items: z.array(partFeatureItemSchema),
  kernelOps: z.array(kernelPostSolidOpSchema).optional()
})

export type PartFeaturesFile = z.infer<typeof partFeaturesFileSchema>

export function defaultPartFeatures(): PartFeaturesFile {
  return {
    version: 1,
    items: [
      { id: 'sk1', kind: 'sketch', label: 'Sketch1' },
      { id: 'ex1', kind: 'extrude', label: 'Extrude1', params: { depthKey: 'extrudeDepthMm' } }
    ]
  }
}
