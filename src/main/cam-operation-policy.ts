import { getManufactureCamRunBlock } from '../shared/manufacture-cam-gate'

/**
 * Maps manufacture.json operation kinds to the STL-based CAM runner.
 * Keeps IPC backward-compatible: omit kind → parallel finish.
 * Non-CNC rows (`fdm_slice`, `export_stl`) are not runnable via `cam:run`.
 */
export function describeCamOperationKind(kind: string | undefined): {
  runnable: boolean
  error?: string
  hint?: string
} {
  const blocked = getManufactureCamRunBlock(kind)
  if (blocked) {
    return { runnable: false, error: blocked.error, hint: blocked.hint }
  }
  if (kind === 'cnc_parallel') {
    return {
      runnable: true,
      hint:
        '**Generate CAM** uses the built-in **parallel finish** from STL mesh bounds (no OpenCAMLib requirement for this op). G-code stays **unverified** until post/machine checks (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_adaptive') {
    return {
      runnable: true,
      hint:
        'When Python has OpenCAMLib (`pip install opencamlib`), **Generate CAM** runs **AdaptiveWaterline** on the STL and posts it; otherwise you get the built-in parallel finish from STL bounds. G-code stays unverified until post/machine checks (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_waterline') {
    return {
      runnable: true,
      hint:
        'When Python has OpenCAMLib, **Generate CAM** runs **Z-level waterline** on the STL and posts it; otherwise you get the built-in parallel finish from STL bounds. G-code stays unverified until post/machine checks (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_raster') {
    return {
      runnable: true,
      hint:
        '**Generate CAM** tries **OpenCAMLib PathDropCutter** XY raster (`engines/cam/ocl_toolpath.py` when `pip install opencamlib`); otherwise a **built-in 2.5D mesh height-field** raster, then an **orthogonal bounds** zigzag at fixed Z if the mesh yields no cuts. G-code stays **unverified** until post/machine checks (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_pencil') {
    return {
      runnable: true,
      hint:
        '**Pencil / rest cleanup:** same **OpenCAMLib raster** path as CNC raster but with a **tighter effective stepover** (`pencilStepoverFactor` × stepover, default 0.22, or optional `pencilStepoverMm`). Without OpenCAMLib, built-in mesh / bounds raster uses that tighter stepover too. Not true rest-material detection — G-code stays **unverified** (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_contour' || kind === 'cnc_pocket' || kind === 'cnc_drill') {
    return {
      runnable: true,
      hint:
        'Uses built-in 2D paths from operation geometry (`contourPoints` for contour/pocket, `drillPoints` for drilling). Contour supports side (`climb`/`conventional`) plus optional lead-in/out and optional multi-depth (`zStepMm` when `zPassMm` is negative, same step semantics as pocket). Pocket supports optional step-down (`zStepMm`), entry mode (`plunge`/`ramp` + `rampMm` + optional `rampMaxAngleDeg`, default 45° — XY run is lengthened within each segment to limit ramp steepness, with CAM hints if a span is too short), rough wall stock, and optional finish contour pass with side + lead-in/out (final depth or each depth). Drill cycles are machine-aware (Grbl defaults to expanded moves; other profiles default to G81, optional G82/G83 via params). Missing/invalid geometry is a hard error (no STL parallel fallback). G-code stays **unverified** until post/machine checks (docs/MACHINES.md).'
    }
  }
  return { runnable: true }
}
