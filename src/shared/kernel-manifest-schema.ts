import { z } from 'zod'

/** Written to `part/kernel-manifest.json` after each kernel build attempt (Phase 1). */
export const kernelManifestSchema = z.object({
  version: z.literal(1),
  builtAt: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  detail: z.string().optional(),
  stepPath: z.string().trim().min(1).optional(),
  stlPath: z.string().trim().min(1).optional(),
  solidKind: z.enum(['extrude', 'revolve', 'loft']).optional(),
  profileCount: z.number().optional(),
  /**
   * Kernel JSON payload:
   * 1 = base solid only
   * 2 = legacy postSolidOps
   * 3 = extended postSolidOps
   * 4 = true sweep/thread/thicken op set (with compatibility mapping for legacy surrogates)
   */
  payloadVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  postSolidOpCount: z.number().optional(),
  /** Placement source used for kernel STEP/STL transform. */
  sketchPlaneKind: z.enum(['datum', 'face']).optional(),
  /** Present when `sketchPlaneKind` is `datum`. */
  sketchPlaneDatum: z.enum(['XY', 'XZ', 'YZ']).optional(),
  /** Preview-vs-kernel placement parity from STL AABB check. */
  placementParity: z.enum(['ok', 'mismatch', 'error']).optional(),
  placementParityDetail: z.string().optional(),
  placementParityMaxDeltaMm: z.number().optional(),
  /** SHA-256 hex of canonical design JSON used for the build (optional). */
  designHash: z.string().optional(),
  /** SHA-256 hex of canonical `part/features.json` JSON (optional; omitted on older manifests). */
  featuresHash: z.string().optional(),
  /**
   * CadQuery loft strategy when `solidKind` is loft: two-profile tags (`smooth+align`, `ruled+flip`, …)
   * or multi-profile `multi+union-chain:<n>:…`. Omitted for extrude/revolve or older Python builds.
   */
  loftStrategy: z.string().trim().min(1).optional(),
  /** Flat pattern strategy emitted when sheet fold/flat ops are present. */
  flatPatternStrategy: z.string().trim().min(1).optional()
})

export type KernelManifest = z.infer<typeof kernelManifestSchema>

export function emptyKernelManifest(): KernelManifest {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    ok: false,
    error: 'never_built'
  }
}
