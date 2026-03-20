/**
 * Fusion-style command inventory for Unified Fab Studio.
 * Names mirror common CAD/Fusion workflows; this is not Autodesk software and does not ship proprietary assets.
 * Status reflects this codebase today — most modeling commands remain planned until OCCT/history integration.
 */

export type CommandParityStatus = 'implemented' | 'partial' | 'planned'

/** Where the command would live in our shell (not a 1:1 Fusion ribbon clone). */
export type CommandShellWorkspace = 'design' | 'assemble' | 'manufacture' | 'utilities'

/** Logical ribbon / tab grouping (Fusion-like buckets). */
export type CommandRibbonGroup =
  | 'sketch_create'
  | 'sketch_modify'
  | 'sketch_constraint'
  | 'sketch_dimension'
  | 'solid_create'
  | 'solid_modify'
  | 'solid_pattern'
  | 'surface'
  | 'sheet_metal'
  | 'plastic'
  | 'assemble'
  | 'assemble_joint'
  | 'manufacture_setup'
  | 'manufacture_2d'
  | 'manufacture_3d'
  | 'drawing'
  | 'inspect'
  | 'manage'

export type FusionStyleCommand = {
  id: string
  /** User-visible name */
  label: string
  ribbon: CommandRibbonGroup
  workspace: CommandShellWorkspace
  status: CommandParityStatus
  /** Fusion-style ribbon hint for users (e.g. CREATE, MODIFY) */
  fusionRibbon?: string
  notes?: string
}

/** Ribbon dropdown options shared by command palette and Utilities → Commands catalog. */
export const COMMAND_CATALOG_RIBBON_FILTER_OPTIONS: { id: CommandRibbonGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'Any ribbon' },
  { id: 'sketch_create', label: 'Sketch · Create' },
  { id: 'sketch_modify', label: 'Sketch · Modify' },
  { id: 'sketch_constraint', label: 'Sketch · Constraints' },
  { id: 'sketch_dimension', label: 'Sketch · Dimensions' },
  { id: 'solid_create', label: 'Solid · Create' },
  { id: 'solid_modify', label: 'Solid · Modify' },
  { id: 'solid_pattern', label: 'Solid · Pattern' },
  { id: 'surface', label: 'Surface' },
  { id: 'sheet_metal', label: 'Sheet metal' },
  { id: 'plastic', label: 'Plastic' },
  { id: 'assemble', label: 'Assemble' },
  { id: 'assemble_joint', label: 'Joints' },
  { id: 'manufacture_setup', label: 'Mfg · Setup' },
  { id: 'manufacture_2d', label: 'Mfg · 2D' },
  { id: 'manufacture_3d', label: 'Mfg · 3D' },
  { id: 'drawing', label: 'Drawing' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'manage', label: 'Manage' }
]

function c(
  id: string,
  label: string,
  ribbon: CommandRibbonGroup,
  workspace: CommandShellWorkspace,
  status: CommandParityStatus,
  fusionRibbon?: string,
  notes?: string
): FusionStyleCommand {
  return { id, label, ribbon, workspace, status, fusionRibbon, notes }
}

/** Full inventory — expand over time; search UI reads this list. */
export const FUSION_STYLE_COMMAND_CATALOG: FusionStyleCommand[] = [
  // —— Sketch CREATE (Fusion: SKETCH / CREATE) ——
  c(
    'sk_line',
    'Line',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two-click open segment (point-ID polyline, 2 vertices)'
  ),
  c(
    'sk_arc_3pt',
    'Arc (three point)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'v2 arc + optional closed profile (chord); kernel loop tessellation matches Three preview'
  ),
  c(
    'sk_arc_center',
    'Arc (center)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Center → start (radius) → end; minor arc stored as v2 three-point arc (trim/kernel unchanged)'
  ),
  c('sk_circle_center', 'Circle (center)', 'sketch_create', 'design', 'implemented', 'CREATE', '2D circle entity'),
  c(
    'sk_circle_2pt',
    'Circle (two point)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two clicks = diameter; stored as `circle` entity (center midpoint, r = half chord)'
  ),
  c(
    'sk_circle_3pt',
    'Circle (three point)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Three non-collinear picks → circumcircle; stored as `circle` entity'
  ),
  c('sk_rect', 'Rectangle', 'sketch_create', 'design', 'implemented', 'CREATE', 'Axis-aligned rect'),
  c(
    'sk_rect_3pt',
    'Rectangle (three point)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two clicks = first edge (width + angle); third = height; same `rect` entity as drag'
  ),
  c(
    'sk_slot_center',
    'Slot (center to center)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two cap-center picks + third for width → `slot` entity (stadium loop for kernel / extrude)'
  ),
  c(
    'sk_slot_overall',
    'Slot (overall)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two tip picks (overall axis length) + width → `slot` with length = overall − width'
  ),
  c(
    'sk_polygon',
    'Polygon',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Regular N-gon (3–128 sides): center + corner → closed point-ID `polyline`'
  ),
  c(
    'sk_ellipse',
    'Ellipse',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Center → major axis end → third pick sets minor extent (ellipse entity; kernel loop tessellated)'
  ),
  c(
    'sk_spline_fit',
    'Spline (fit points)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Catmull–Rom through knot point IDs; constraints/solver2d apply to those points only (no spline-specific energy)'
  ),
  c(
    'sk_spline_cp',
    'Spline (control points)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Uniform cubic B-spline from control point IDs; constraints target control vertices only; curve does not pass through all controls'
  ),
  c(
    'sk_fillet_sk',
    'Fillet (sketch)',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Point-ID polyline: two consecutive edges at a corner; radius in ribbon; tessellated arc (closed loop stays extrudable)'
  ),
  c(
    'sk_chamfer_sk',
    'Chamfer (sketch)',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Point-ID polyline: two consecutive edges at a corner; leg length L along each edge from vertex'
  ),
  c(
    'sk_point',
    'Point',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Click adds UUID in `points` (no entity); visible on canvas; constraints / dims can reference'
  ),
  c('sk_polyline', 'Polyline', 'sketch_create', 'design', 'implemented', 'CREATE', 'Close loop for profile'),
  c(
    'sk_offset',
    'Offset',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Closed point-ID polyline → miter offset copy (Sketch ribbon Δ mm); palette scrolls to offset controls'
  ),
  c(
    'sk_project',
    'Project / Include',
    'sketch_create',
    'design',
    'partial',
    'CREATE',
    'Click mesh in 3D → orthogonal projection to sketch plane → Commit (≥2) adds open polyline; not true edge topology / curve trim'
  ),
  c(
    'sk_mirror_sk',
    'Mirror (sketch)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two picks define mirror axis; reflects points + primitive centers; with point selection, mirrors selection only'
  ),
  c(
    'sk_pattern_sk',
    'Pattern (sketch)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Linear: Pat # + ΔX/ΔY along k×Δ. Circular: pivot + total° + start°, step = total°÷Pat # (matches kernel pattern_circular). Whole sketch.'
  ),
  c(
    'sk_move_sk',
    'Move (sketch)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Two-click translation; with sketch points selected, moves selection only'
  ),
  c(
    'sk_rotate_sk',
    'Rotate (sketch)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Pivot + ribbon angle (deg); with points selected, rotates selection only'
  ),
  c(
    'sk_scale_sk',
    'Scale (sketch)',
    'sketch_create',
    'design',
    'implemented',
    'CREATE',
    'Pivot + scale factor; with points selected, scales selection only'
  ),
  c(
    'sk_trim',
    'Trim',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Polyline or arc target; polyline cutter = infinite line, arc cutter = full circle; click picks side to remove'
  ),
  c(
    'sk_extend',
    'Extend',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Two-click extend: pick boundary edge/arc, then target open polyline edge end'
  ),
  c(
    'sk_break',
    'Break',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Click edge to break into two disconnected entities (open polyline/arc)'
  ),
  c(
    'sk_split',
    'Split',
    'sketch_modify',
    'design',
    'implemented',
    'MODIFY',
    'Click edge to split at point (polyline edge insert, arc split into two arcs)'
  ),

  // —— Sketch CONSTRAINTS ——
  c('co_coincident', 'Coincident', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS'),
  c('co_collinear', 'Collinear', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Three points, solver'),
  c('co_concentric', 'Concentric', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Two circle/arc entities share center'),
  c('co_equal', 'Equal', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Two segments, solver'),
  c('co_fix', 'Fix / Unfix', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Fix point'),
  c('co_horizontal', 'Horizontal', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS'),
  c('co_vertical', 'Vertical', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS'),
  c('co_parallel', 'Parallel', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Two segments, solver'),
  c('co_perpendicular', 'Perpendicular', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Two segments, solver'),
  c(
    'co_tangent',
    'Tangent',
    'sketch_constraint',
    'design',
    'implemented',
    'CONSTRAINTS',
    'Line segment + arc start/end; line direction ⟂ radius at tangency (solver)'
  ),
  c('co_smooth', 'Smooth (G2)', 'sketch_constraint', 'design', 'planned', 'CONSTRAINTS'),
  c(
    'co_symmetric',
    'Symmetric',
    'sketch_constraint',
    'design',
    'implemented',
    'CONSTRAINTS',
    'P2 = reflect(P1) across axis line La—Lb (solver)'
  ),
  c('co_midpoint', 'Midpoint', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'M = midpoint of A—B, solver'),
  c('co_polygon', 'Polygon', 'sketch_constraint', 'design', 'planned', 'CONSTRAINTS'),
  c('co_distance', 'Distance / length', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Driven by parameters map'),
  c('co_radius', 'Radius', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Circle/arc radius driven by parameter key'),
  c('co_diameter', 'Diameter', 'sketch_constraint', 'design', 'implemented', 'CONSTRAINTS', 'Circle/arc diameter driven by parameter key'),
  c(
    'co_angle',
    'Angle',
    'sketch_constraint',
    'design',
    'implemented',
    'CONSTRAINTS',
    'Two segments; target angle in degrees via parameters map + solver'
  ),

  // —— Sketch DIMENSIONS ——
  c(
    'dim_linear',
    'Linear dimension',
    'sketch_dimension',
    'design',
    'implemented',
    'CREATE',
    'Canvas readout; optional parameterKey shows parameters[key]; driving length uses co_distance + same parameterKey in solver — not auto from dim row alone'
  ),
  c(
    'dim_aligned',
    'Aligned dimension',
    'sketch_dimension',
    'design',
    'implemented',
    'CREATE',
    'Two-point annotation; optional parameterKey for driven display'
  ),
  c(
    'dim_angular',
    'Angular dimension',
    'sketch_dimension',
    'design',
    'implemented',
    'CREATE',
    'Two-segment angle; optional parameterKey'
  ),
  c(
    'dim_radial',
    'Radial dimension',
    'sketch_dimension',
    'design',
    'implemented',
    'CREATE',
    'Circle/arc/ellipse; optional parameterKey'
  ),
  c(
    'dim_diameter',
    'Diameter dimension',
    'sketch_dimension',
    'design',
    'implemented',
    'CREATE',
    'Circle/arc/ellipse; optional parameterKey'
  ),

  // —— Solid CREATE ——
  c('so_extrude', 'Extrude', 'solid_create', 'design', 'implemented', 'CREATE', 'Single profile depth'),
  c('so_revolve', 'Revolve', 'solid_create', 'design', 'implemented', 'CREATE', 'Axis line X = const'),
  c(
    'so_sweep',
    'Sweep',
    'solid_create',
    'design',
    'partial',
    'CREATE',
    'Kernel `sweep_profile_path` partial: segment-wise translation sweep along polyline path (no profile orientation follow yet)'
  ),
  c(
    'so_loft',
    'Loft',
    'solid_create',
    'design',
    'implemented',
    'CREATE',
    '2–16 closed profiles (order), uniform loft step → kernel segment lofts + union (`multi+union-chain` when n≥3) + Three ruled strips; manifest `loftStrategy`'
  ),
  c('so_rib', 'Rib', 'solid_create', 'design', 'planned', 'CREATE'),
  c('so_web', 'Web', 'solid_create', 'design', 'planned', 'CREATE'),
  c(
    'so_coil',
    'Coil',
    'solid_create',
    'design',
    'partial',
    'CREATE',
    'Kernel `coil_cut` partial: stacked ring-cut surrogate with pitch/turns/depth; ≤1024 ring instances in build; not true helical section sweep'
  ),
  c(
    'so_pipe',
    'Pipe',
    'solid_create',
    'design',
    'partial',
    'CREATE',
    'Kernel `pipe_path` partial: circular section along polyline path with optional wall thickness; no tangent/orientation follow yet'
  ),
  c(
    'so_thicken',
    'Thicken / Offset surface',
    'solid_create',
    'design',
    'partial',
    'CREATE',
    'Kernel `thicken_scale` surrogate (isotropic scale about body center); not true face-offset/thicken'
  ),

  // —— Solid MODIFY ——
  c(
    'so_fillet',
    'Fillet',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel: `part/features.json` → `kernelOps` → `fillet_all` + directional `fillet_select` (±X/±Y/±Z)'
  ),
  c(
    'so_chamfer',
    'Chamfer',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel: `kernelOps` → `chamfer_all` + directional `chamfer_select` (±X/±Y/±Z)'
  ),
  c(
    'so_shell',
    'Shell',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel: shell_inward (openDirection ±X/±Y/±Z, default +Z) via features.json / Design ribbon'
  ),
  c(
    'so_hole',
    'Hole',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel `hole_from_profile` (profileIndex, depth + depthMm or through_all, zStart); full hole wizard semantics still planned'
  ),
  c(
    'so_thread',
    'Thread',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel `thread_cosmetic` ring-groove approximation (radius/pitch/length/depth), not a true helical thread; ring count capped at 256 in build'
  ),
  c(
    'so_combine',
    'Combine (boolean)',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel: primitives + `boolean_combine_profile` (union/subtract/intersect from profileIndex + extrude depth) in `kernelOps` (CadQuery); profileIndex range-checked vs payload profiles pre-OCC'
  ),
  c(
    'so_split',
    'Split body',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel `split_keep_halfspace` (axis, offsetMm, keep positive/negative); samples include negative keep + offset; full split-body management still planned'
  ),
  c(
    'so_move_copy',
    'Move / Copy body',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel `transform_translate` (ΔX/ΔY/ΔZ) with optional keepOriginal union-copy'
  ),
  c(
    'so_press_pull',
    'Press pull',
    'solid_modify',
    'design',
    'partial',
    'MODIFY',
    'Kernel `press_pull_profile` signed delta on profileIndex (+ union, - cut); face-pick/direct-manipulate UX still planned'
  ),

  // —— Solid PATTERN ——
  c(
    'so_pattern_rect',
    'Rectangular pattern',
    'solid_pattern',
    'design',
    'partial',
    'PATTERN',
    'Sketch linear pattern; kernel `pattern_rectangular` on B-rep (`kernelOps`)'
  ),
  c(
    'so_pattern_circ',
    'Circular pattern',
    'solid_pattern',
    'design',
    'partial',
    'PATTERN',
    'Kernel `pattern_circular` (+Z pivot, count/total°/start°) — Design ribbon + circ pattern'
  ),
  c(
    'so_pattern_path',
    'Path pattern',
    'solid_pattern',
    'design',
    'partial',
    'PATTERN',
    'Kernel `pattern_path` on sketch polyline points (sampled along path length, translation-only); optional `closedPath` includes last→first segment; linear translation in 3D is `pattern_linear_3d`'
  ),
  c(
    'so_mirror_body',
    'Mirror (body)',
    'solid_pattern',
    'design',
    'partial',
    'PATTERN',
    'Kernel `mirror_union_plane` (YZ/XZ/XY + origin) — Design ribbon + mirror ∪'
  ),
  c('so_mirror_sketch_plane', 'Mirror (sketch plane)', 'solid_pattern', 'design', 'partial', 'PATTERN', 'Mirror across Y axis in sketch'),

  // —— Surface / advanced ——
  c('su_extrude', 'Extrude surface', 'surface', 'design', 'planned', 'CREATE'),
  c('su_revolve', 'Revolve surface', 'surface', 'design', 'planned', 'CREATE'),
  c(
    'su_loft',
    'Loft surface',
    'surface',
    'design',
    'implemented',
    'CREATE',
    'Same kernel path as solid loft (2–16 profiles); no separate surface-only body type yet'
  ),
  c('su_sweep', 'Sweep surface', 'surface', 'design', 'planned', 'CREATE'),
  c('su_patch', 'Patch', 'surface', 'design', 'planned', 'CREATE'),
  c('su_trim', 'Trim surface', 'surface', 'design', 'planned', 'MODIFY'),
  c('su_extend', 'Extend surface', 'surface', 'design', 'planned', 'MODIFY'),
  c('su_stitch', 'Stitch', 'surface', 'design', 'planned', 'MODIFY'),
  c('su_thicken', 'Thicken', 'surface', 'design', 'planned', 'MODIFY'),

  // —— Sheet metal / plastic (Fusion tabs) ——
  c(
    'sm_flange',
    'Flange / tab (boss)',
    'sheet_metal',
    'design',
    'partial',
    'CREATE',
    'Kernel `sheet_tab_union` + Design ribbon + sheet tab; axis-aligned boss on +Z — no bend k-factor yet'
  ),
  c('sm_fold', 'Fold', 'sheet_metal', 'design', 'planned', 'MODIFY', 'Kernel stub — not in CadQuery path'),
  c(
    'sm_flat_pattern',
    'Flat pattern',
    'sheet_metal',
    'design',
    'planned',
    'MODIFY',
    'Kernel stub — not in CadQuery path'
  ),
  c('pl_rule_fillet', 'Rule fillet (plastic)', 'plastic', 'design', 'planned', 'MODIFY'),
  c('pl_boss', 'Boss', 'plastic', 'design', 'planned', 'CREATE'),
  c('pl_lip_groove', 'Lip / groove', 'plastic', 'design', 'planned', 'CREATE'),

  // —— Assemble ——
  c('as_new_comp', 'New component', 'assemble', 'assemble', 'partial', 'ASSEMBLE', 'Add component row'),
  c(
    'as_insert',
    'Insert / duplicate component',
    'assemble',
    'assemble',
    'partial',
    'ASSEMBLE',
    'Assembly tab **Duplicate row** (new instance id; clears parent / motion link) + **Insert from project…** (pick JSON under project → relative `partPath`)'
  ),
  c(
    'as_external_ref',
    'External reference',
    'assemble',
    'assemble',
    'partial',
    'ASSEMBLE',
    'referenceTag, partNumber, externalComponentRef (PDM/ERP), parentId'
  ),
  c('as_joint_rigid', 'As-built / Rigid joint', 'assemble_joint', 'assemble', 'partial', 'JOINTS', 'Joint enum rigid'),
  c(
    'as_joint_slider',
    'Slider joint',
    'assemble_joint',
    'assemble',
    'partial',
    'JOINTS',
    'Optional slider preview mm + axis (world or **parent local** X/Y/Z; viewport stub)'
  ),
  c(
    'as_joint_revolute',
    'Revolute joint',
    'assemble_joint',
    'assemble',
    'partial',
    'JOINTS',
    'Optional revolute preview angle + axis (world or **parent local** X/Y/Z; viewport subtree stub)'
  ),
  c('as_joint_planar', 'Planar joint', 'assemble_joint', 'assemble', 'partial', 'JOINTS', 'Joint enum planar'),
  c(
    'as_joint_cylindrical',
    'Cylindrical joint',
    'assemble_joint',
    'assemble',
    'partial',
    'JOINTS',
    'Optional preview slide mm + spin ° on same axis (world or parent-local; viewport stub)'
  ),
  c('as_joint_ball', 'Ball joint', 'assemble_joint', 'assemble', 'partial', 'JOINTS', 'Joint enum ball (spherical)'),
  c(
    'as_joint_universal',
    'Universal (Cardan) joint',
    'assemble_joint',
    'assemble',
    'partial',
    'JOINTS',
    'Optional two-axis preview angles (axis1 then axis2; viewport stub — not a solver)'
  ),
  c(
    'as_motion_link',
    'Motion link / contact set',
    'assemble_joint',
    'assemble',
    'partial',
    'JOINTS',
    'linkedInstanceId + motionLinkKind mate/contact/align (stub; UI validation)'
  ),
  c(
    'as_bom',
    'BOM / export',
    'manage',
    'assemble',
    'implemented',
    'ASSEMBLE',
    'CSV → output/bom.csv (incl. **bomUnit** / **bomVendor** / **bomCostEach**, **instanceId**); **tree .txt** / **.json** via shared `buildHierarchicalBomText` / `buildBomHierarchyJsonText`; Assembly tab **Download** tree + CSV from editor; **preview** table **Thumb** column (STL raster, not in CSV); **Export** → output/ from saved file'
  ),
  c(
    'as_summary',
    'Assembly summary',
    'manage',
    'assemble',
    'implemented',
    'ASSEMBLE',
    'Live panel + copy + Export summary (.txt); IPC assembly:summary — meshPath, explode/motion flags, BOM by partPath, **part paths** / **part numbers** with 2+ active rows, **multiple grounded** warning, joints, **motion link stub** roll-ups (linkedInstanceId / motionLinkKind), ref + externalComponentRef tallies, BOM-notes count, parent **self-ref** + **cycle** flags, distinct PNs, same-transform pairs'
  ),
  c(
    'as_explode_motion_meta',
    'Explode & motion study metadata',
    'manage',
    'assemble',
    'partial',
    'ASSEMBLE',
    'assembly.json explodeView + motionStudy; Assembly tab 3D STL preview with explode slider + keyframe scrub/play (+Y °); joint preview stubs (slider/planar/revolute/universal/cylindrical/ball); not a kinematic solver'
  ),
  c(
    'as_interference',
    'Interference',
    'assemble',
    'assemble',
    'partial',
    'ASSEMBLE',
    'meshPath → binary STL: AABB + narrow phase + triangle SAT (capped); download JSON or save to output/{assembly}-interference.json; mesh load / budget notes'
  ),

  // —— Manufacture (CAM) ——
  c(
    'mf_setup',
    'Setup',
    'manufacture_setup',
    'manufacture',
    'partial',
    'SETUP',
    'Machine + stock + fixture note; work offset → G54–G59 in CNC post when generating CAM'
  ),
  c(
    'mf_op_2d_face',
    '2D contour / face',
    'manufacture_2d',
    'manufacture',
    'partial',
    '2D',
    'Shipped: cnc_contour + contourPoints + cam-runner validation. Stretch: richer sketch/projected-edge authoring — Manufacture UI hints; hard error when missing/invalid; no STL fallback — docs/MACHINES.md'
  ),
  c(
    'mf_op_2d_pocket',
    '2D pocket',
    'manufacture_2d',
    'manufacture',
    'partial',
    '2D',
    'Shipped: cnc_pocket + contourPoints + ramp/finish options. Stretch: deeper entry/path UX — Manufacture UI; hard error when missing/invalid; no STL fallback — docs/MACHINES.md'
  ),
  c(
    'mf_op_2d_drill',
    'Drilling',
    'manufacture_2d',
    'manufacture',
    'partial',
    '2D',
    'Shipped: cnc_drill + drillPoints + machine dialect (Grbl expanded default, G81/G82/G83). Stretch: per-controller peck/retract tuning — Manufacture UI + cam hints; hard error when geometry missing/invalid — docs/MACHINES.md'
  ),
  c(
    'mf_op_parallel',
    'Parallel finishing (3D)',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'cnc_parallel + CAM tab; G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_waterline',
    'Waterline / Z-level (3D)',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'cnc_waterline — OpenCAMLib Waterline in engines/cam when pip install opencamlib; else built-in parallel finish; G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_raster',
    'Raster finishing (3D)',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'cnc_raster — OCL PathDropCutter raster in engines/cam/ocl_toolpath.py when opencamlib; else mesh height-field + ortho bounds fallback; G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_contour',
    'Contour (3D)',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'Catalog label “3D”; runtime op is **cnc_contour** — 2D toolpath from **contourPoints** only (hard error if missing/invalid; no STL fallback). G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_pocket_3d',
    'Pocket (3D)',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'Catalog label “3D”; runtime op is **cnc_pocket** — 2D pocket from **contourPoints** only (hard error if missing/invalid; no STL fallback). G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_adaptive',
    'Adaptive clearing',
    'manufacture_3d',
    'manufacture',
    'partial',
    '3D',
    'cnc_adaptive — OpenCAMLib AdaptiveWaterline when available; else built-in parallel finish; G-code unverified — docs/MACHINES.md'
  ),
  c(
    'mf_op_pencil',
    'Pencil / rest machining',
    'manufacture_3d',
    'manufacture',
    'planned',
    '3D',
    'Deferred stretch: rest machining after adaptive/OCL stability — PARITY_REMAINING_ROADMAP Phase 6'
  ),
  c(
    'mf_turning',
    'Turning',
    'manufacture_3d',
    'manufacture',
    'planned',
    'TURNING',
    'Deferred stretch: lathe post + op taxonomy — large scope'
  ),
  c(
    'mf_additive',
    'Additive / FDM',
    'manufacture_3d',
    'manufacture',
    'partial',
    'ADDITIVE',
    'Utilities → Slice (CuraEngine) + `fdm_slice` op; named presets (`balanced` / `draft` / `fine`) in `cura-slice-defaults.ts` → `buildCuraSliceArgs` — Slice tab'
  ),
  c(
    'mf_simulate',
    'Simulation',
    'inspect',
    'manufacture',
    'partial',
    'INSPECT',
    'No in-app stock-removal or kinematics sim; Manufacture **stub** panel + Utilities CAM **G-code text cues** only (non-physical). External verification required — docs/VERIFICATION.md'
  ),

  // —— Drawings / documentation (stubs — no 2D drawing sheet pipeline yet) ——
  c(
    'dr_new_sheet',
    'New drawing sheet',
    'drawing',
    'utilities',
    'partial',
    'CREATE',
    'Primary sheet + optional **view placeholders** → `drawing/drawing.json`; exports list labels — no true projection'
  ),
  c(
    'dr_base_view',
    'Base view from model',
    'drawing',
    'utilities',
    'partial',
    'CREATE',
    'Project tab: **+ Base view slot** → **View from** axis + label; PDF/DXF list shows preview text — **no** projected model geometry'
  ),
  c(
    'dr_projected_view',
    'Projected view',
    'drawing',
    'utilities',
    'partial',
    'CREATE',
    'Project tab: **+ Projected view slot** → **parent** base view + **direction** + label; export lists preview text — **no** projected geometry'
  ),
  c(
    'dr_export_pdf',
    'Export drawing PDF',
    'drawing',
    'utilities',
    'partial',
    'FILE',
    'Title-block PDF (A4); **first sheet** name/scale + view rows (**base** / **projected** metadata) from manifest — **no** projected model geometry'
  ),
  c(
    'dr_export_dxf',
    'Export drawing DXF',
    'drawing',
    'utilities',
    'partial',
    'FILE',
    'Placeholder DXF; **first sheet** metadata + view rows in note — **no** projected geometry'
  ),

  // —— Utilities / inspect / manage ——
  c(
    'ut_measure',
    'Measure',
    'inspect',
    'design',
    'partial',
    'INSPECT',
    'Design 3D preview: **Measure**, Shift+click two points on the solid (mm). **Esc** clears. Preview mesh only — docs/VERIFICATION.md'
  ),
  c(
    'ut_section',
    'Section analysis',
    'inspect',
    'design',
    'partial',
    'INSPECT',
    'Design 3D preview: **Section**, Y clip slider (world +Y). **Esc** clears. Preview mesh only — docs/VERIFICATION.md'
  ),
  c(
    'ut_interference',
    'Interference',
    'inspect',
    'utilities',
    'partial',
    'INSPECT',
    'Palette switches to **Assemble** — run **Interference check** in the assembly panel; download JSON or save under output/ (same workflow as **as_interference**)'
  ),
  c('ut_material', 'Physical material', 'manage', 'utilities', 'planned', 'MANAGE'),
  c('ut_appearance', 'Appearance', 'manage', 'utilities', 'planned', 'MANAGE'),
  c(
    'ut_parameters',
    'Parameters',
    'manage',
    'design',
    'implemented',
    'MANAGE',
    'Design ribbon **Parameters** group: add/rename/delete keys; **Utilities → Project** export/merge `output/design-parameters.json` into sketch'
  ),
  c('ut_derive', 'Derive', 'manage', 'utilities', 'planned', 'MANAGE'),
  c('ut_scripts', 'Scripts & add-ins', 'manage', 'utilities', 'planned', 'TOOLS'),
  c(
    'ut_command_palette',
    'Command palette',
    'manage',
    'utilities',
    'implemented',
    'TOOLS',
    '**Ctrl+K** / **⌘K** — modal: Tab wrap, Home/End, **PgUp/PgDn** page through list, scroll active row, empty-search hint; **Utilities → Commands**: labeled filters, search `aria-describedby` stats, empty-filter message + **Reset filters**; switching **into Utilities** from another workspace focuses the tab strip'
  ),
  c(
    'ut_keyboard_shortcuts',
    'Keyboard shortcuts',
    'manage',
    'utilities',
    'implemented',
    'TOOLS',
    'Utilities → Shortcuts tab; Ctrl+Shift+? / ⌘⇧? when not typing; tables use **sr-only captions** per group; **Utilities** tab strip: ←→ / ↑↓ + Home/End when a tab is focused (**roving tabindex**)'
  ),

  // —— File / project (utilities workspace) ——
  c('ut_open', 'Open project', 'manage', 'utilities', 'implemented', 'FILE'),
  c('ut_new', 'New project', 'manage', 'utilities', 'implemented', 'FILE'),
  c('ut_save', 'Save', 'manage', 'utilities', 'implemented', 'FILE'),
  c(
    'ut_import_3d',
    'Import 3D model',
    'manage',
    'utilities',
    'implemented',
    'FILE',
    'Multi-select in dialog (Ctrl/Shift+click). STL, STEP/STP, OBJ, PLY, GLTF/GLB, 3MF, OFF, DAE → assets/; STEP → CadQuery; mesh → pip install trimesh'
  ),
  c(
    'ut_import_stl',
    'Import 3D model (palette alias)',
    'manage',
    'utilities',
    'implemented',
    'FILE',
    'Same dialog as Import 3D model'
  ),
  c(
    'ut_import_step',
    'Import STEP',
    'manage',
    'utilities',
    'implemented',
    'FILE',
    'Same unified dialog; Python + CadQuery required'
  ),
  c('ut_export_stl', 'Export STL (design)', 'manage', 'design', 'implemented', 'FILE'),
  c('ut_slice', 'Slice (FDM)', 'manufacture_3d', 'utilities', 'partial', 'MANUFACTURE'),
  c(
    'ut_cam',
    'Generate CAM',
    'manufacture_3d',
    'utilities',
    'partial',
    'MANUFACTURE',
    'First CNC op params → feeds/Z/stepover + OCL when installed; else parallel finish; G-code unverified — docs/MACHINES.md'
  ),
  c('ut_tools', 'Tool library', 'manage', 'utilities', 'implemented', 'MANAGE')
]

/** Command palette → Design workspace: updates sketch tool or constraint picker when dispatched. */
export const DESIGN_RIBBON_COMMAND_IDS = new Set<string>([
  'sk_rect',
  'sk_rect_3pt',
  'sk_slot_center',
  'sk_slot_overall',
  'sk_point',
  'sk_polygon',
  'sk_circle_center',
  'sk_circle_2pt',
  'sk_circle_3pt',
  'sk_polyline',
  'sk_line',
  'sk_arc_3pt',
  'sk_arc_center',
  'sk_ellipse',
  'sk_spline_fit',
  'sk_spline_cp',
  'sk_trim',
  'sk_extend',
  'sk_break',
  'sk_split',
  'sk_fillet_sk',
  'sk_chamfer_sk',
  'sk_offset',
  'sk_project',
  'sk_move_sk',
  'sk_rotate_sk',
  'sk_scale_sk',
  'sk_mirror_sk',
  'sk_pattern_sk',
  'sk_choose_plane',
  'dim_linear',
  'dim_aligned',
  'co_coincident',
  'co_distance',
  'co_fix',
  'co_horizontal',
  'co_vertical',
  'co_parallel',
  'co_perpendicular',
  'co_equal',
  'co_collinear',
  'co_midpoint',
  'co_angle',
  'co_tangent',
  'co_symmetric',
  'co_concentric',
  'co_radius',
  'co_diameter',
  'dim_radial',
  'dim_diameter',
  'dim_angular',
  'ut_parameters',
  'ut_measure',
  'ut_section'
])

export function catalogStats(catalog: FusionStyleCommand[] = FUSION_STYLE_COMMAND_CATALOG): Record<CommandParityStatus, number> {
  const out: Record<CommandParityStatus, number> = { implemented: 0, partial: 0, planned: 0 }
  for (const row of catalog) {
    out[row.status]++
  }
  return out
}

export function filterCatalog(
  catalog: FusionStyleCommand[],
  opts: {
    q?: string
    workspace?: CommandShellWorkspace | 'all'
    status?: CommandParityStatus | 'all'
    ribbon?: CommandRibbonGroup | 'all'
  }
): FusionStyleCommand[] {
  const q = opts.q?.trim().toLowerCase()
  return catalog.filter((row) => {
    if (opts.workspace && opts.workspace !== 'all' && row.workspace !== opts.workspace) return false
    if (opts.status && opts.status !== 'all' && row.status !== opts.status) return false
    if (opts.ribbon && opts.ribbon !== 'all' && row.ribbon !== opts.ribbon) return false
    if (q) {
      const hay = `${row.label} ${row.id} ${row.ribbon} ${row.fusionRibbon ?? ''} ${row.notes ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
