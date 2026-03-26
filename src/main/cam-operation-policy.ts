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
  if (kind === 'cnc_4axis_wrapping') {
    return {
      runnable: true,
      hint:
        '**4-axis cylindrical wrapping** — routes to `engines/cam/axis4_toolpath.py` (pure Python, no OpenCAMLib required). Generates X Z A toolpath moves for the Carvera 4th-axis rotary attachment. Requires `axisCount: 4` on the machine profile. Set `cylinderDiameterMm`, `cylinderLengthMm`, `zPassMm`, `wrapMode` (`parallel`|`contour`) in operation params. **Run an air cut with spindle OFF before any real cut.** G-code is **unverified** — verify cylinder diameter, A WCS home, and clearances (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_4axis_indexed') {
    return {
      runnable: true,
      hint:
        '**4-axis indexed** — locks A at discrete angles (`indexAnglesDeg`) and machines a 3-axis pass at each stop. Useful for milling flat faces, keyways, or hex profiles on round stock. Requires `axisCount: 4` on the machine profile. **Run an air cut with spindle OFF before any real cut.** G-code is **unverified** (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_chamfer') {
    return {
      runnable: true,
      hint:
        '**2D Chamfer** — cuts a chamfer along a closed contour using a V-bit or chamfer mill. Requires `contourPoints: [x,y][]` and `chamferDepthMm`. `chamferAngleDeg` defaults to 45° (half-angle of tool). Feed/plunge from cut params. G-code is **unverified** until post/machine checks (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_thread_mill') {
    return {
      runnable: true,
      hint:
        '**Thread Milling** — helical thread entry along a bore or contour. Requires `contourPoints`, `threadPitchMm`, `threadDepthMm`, and `toolDiameterMm`. `threadDirection` defaults to right-hand (\'right\'). G-code is **unverified** (docs/MACHINES.md).'
    }
  }
  if (kind === 'cnc_laser') {
    return {
      runnable: false,
      error: 'Laser operations are not yet posted by the built-in CAM runner. Export G-code from dedicated laser software or Makera CAM and import via the Tools tab.',
      hint: '**Laser path** — set `laserMode` (\'vector\'|\'raster\'|\'fill\'), `laserPower` (0–100), `laserSpeed` mm/min, and `passes`. Contour points drive vector/fill mode.'
    }
  }
  if (kind === 'cnc_pcb_isolation' || kind === 'cnc_pcb_drill' || kind === 'cnc_pcb_contour') {
    return {
      runnable: true,
      hint:
        '**PCB operation** — isolation routing, drilling, or board outline. Set `contourPoints` (isolation/outline) or `drillPoints` (drilling), `zPassMm`, and tool params. PCB operations use the same 2D path engine as standard contour/drill ops. Material type should be set to `pcb` on the setup stock. G-code is **unverified** (docs/MACHINES.md).'
    }
  }
  return { runnable: true }
}
