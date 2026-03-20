import type { KernelPostSolidOp } from './part-features-schema'

/** One-line label for kernel op queue UI and debugging. */
export function kernelOpSummary(op: KernelPostSolidOp): string {
  switch (op.kind) {
    case 'fillet_all':
      return `fillet all R=${op.radiusMm} mm`
    case 'chamfer_all':
      return `chamfer all L=${op.lengthMm} mm`
    case 'fillet_select':
      return `fillet ${op.edgeDirection} R=${op.radiusMm} mm`
    case 'chamfer_select':
      return `chamfer ${op.edgeDirection} L=${op.lengthMm} mm`
    case 'shell_inward':
      return `shell t=${op.thicknessMm} mm${op.openDirection ? ` (${op.openDirection})` : ''}`
    case 'pattern_rectangular':
      return `rect pattern ${op.countX}×${op.countY} Δ(${op.spacingXMm},${op.spacingYMm})`
    case 'pattern_circular':
      return `circ pattern n=${op.count} @(${op.centerXMm},${op.centerYMm}) ${op.totalAngleDeg}°`
    case 'pattern_linear_3d':
      return `linear 3D n=${op.count} step(${op.dxMm},${op.dyMm},${op.dzMm})`
    case 'pattern_path':
      return `path pattern n=${op.count} pts=${op.pathPoints.length}${op.closedPath ? ' closed' : ''}`
    case 'boolean_subtract_cylinder':
      return `−cyl @(${op.centerXMm},${op.centerYMm}) r=${op.radiusMm} Z[${op.zMinMm},${op.zMaxMm}]`
    case 'boolean_union_box':
      return `+box AABB`
    case 'boolean_subtract_box':
      return `−box AABB`
    case 'boolean_intersect_box':
      return `∩ box AABB`
    case 'boolean_combine_profile':
      return `${op.mode} profile#${op.profileIndex} depth=${op.extrudeDepthMm} z0=${op.zStartMm}`
    case 'split_keep_halfspace':
      return `split ${op.axis}@${op.offsetMm} keep ${op.keep}`
    case 'hole_from_profile':
      return op.mode === 'through_all'
        ? `hole profile#${op.profileIndex} through-all z0=${op.zStartMm}`
        : `hole profile#${op.profileIndex} depth=${op.depthMm} z0=${op.zStartMm}`
    case 'thread_cosmetic':
      return `thread cosmetic r=${op.majorRadiusMm} p=${op.pitchMm} L=${op.lengthMm} d=${op.depthMm} (≤256 rings)`
    case 'transform_translate':
      return `${op.keepOriginal ? 'copy' : 'move'} Δ(${op.dxMm},${op.dyMm},${op.dzMm})`
    case 'press_pull_profile':
      return `press/pull profile#${op.profileIndex} Δ=${op.deltaMm} z0=${op.zStartMm}`
    case 'sweep_profile_path':
      return `sweep profile#${op.profileIndex} pathPts=${op.pathPoints.length} z0=${op.zStartMm}`
    case 'pipe_path':
      return `pipe pathPts=${op.pathPoints.length} R=${op.outerRadiusMm}${op.wallThicknessMm ? ` t=${op.wallThicknessMm}` : ''}`
    case 'thicken_scale':
      return `thicken(scale) Δ=${op.deltaMm}`
    case 'coil_cut':
      return `coil cut r=${op.majorRadiusMm} pitch=${op.pitchMm} turns=${op.turns} d=${op.depthMm} (≤1024 rings)`
    case 'mirror_union_plane':
      return `mirror ∪ ${op.plane} @(${op.originXMm},${op.originYMm},${op.originZMm})`
    case 'sheet_tab_union':
      return `sheet tab ${op.lengthMm}×${op.widthMm}×${op.heightMm} mm`
    default:
      return `kernel op ${(op as { kind: string }).kind}`
  }
}
