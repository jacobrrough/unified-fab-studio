import { z } from 'zod'

/** How to reposition the imported mesh in model space (applied to output STL in `assets/`). */
export const meshImportPlacementSchema = z.enum(['as_is', 'center_origin', 'center_xy_ground_z'])

export type MeshImportPlacement = z.infer<typeof meshImportPlacementSchema>

/** File vertical axis before UFS Y-up convention (viewport / sketch use Y-up). */
export const meshImportUpAxisSchema = z.enum(['y_up', 'z_up'])

export type MeshImportUpAxis = z.infer<typeof meshImportUpAxisSchema>

export const MESH_IMPORT_PLACEMENT_DEFAULTS = {
  placement: 'as_is' satisfies MeshImportPlacement,
  upAxis: 'y_up' satisfies MeshImportUpAxis
} as const

/** Parse optional IPC/renderer payload for `assets:importMesh` (unknown fields ignored). */
export function parseMeshImportPlacementPayload(raw: unknown): {
  placement?: MeshImportPlacement
  upAxis?: MeshImportUpAxis
} {
  if (raw == null || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: { placement?: MeshImportPlacement; upAxis?: MeshImportUpAxis } = {}
  const p = meshImportPlacementSchema.safeParse(o.placement)
  const u = meshImportUpAxisSchema.safeParse(o.upAxis)
  if (p.success) out.placement = p.data
  if (u.success) out.upAxis = u.data
  return out
}
