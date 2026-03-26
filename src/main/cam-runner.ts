import { spawnBounded } from './subprocess-bounded'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MachineProfile } from '../shared/machine-schema'
import {
  computeNegativeZDepthPasses,
  generateContour2dLines,
  generateDrill2dLines,
  generateMeshHeightRasterLines,
  generateOrthoBoundsRasterLines,
  generatePocket2dLines,
  generateParallelFinishLines
} from './cam-local'
import { resolvePencilStepoverMm } from '../shared/cam-cut-params'
import { getEnginesRoot } from './paths'
import { renderPost } from './post-process'
import { collectBinaryStlTriangles, isLikelyAsciiStl, parseBinaryStl } from './stl'

function createCamDebugPhaseLogger(): (label: string) => void {
  const on = process.env.DEBUG_CAM === '1' || process.env.DEBUG_CAM === 'true'
  if (!on) return () => {}
  const t0 = Date.now()
  let last = t0
  return (label: string) => {
    const now = Date.now()
    console.error(`[DEBUG_CAM] ${label}: +${now - last}ms (total ${now - t0}ms)`)
    last = now
  }
}

export type CamJobConfig = {
  stlPath: string
  outputGcodePath: string
  machine: MachineProfile
  resourcesRoot: string
  appRoot: string
  zPassMm: number
  stepoverMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
  pythonPath: string
  /** manufacture.json operation kind — drives optional OpenCAMLib strategy */
  operationKind?: string
  /** Optional: emit G54–G59 after safety blocks in the post (from manufacture setup). */
  workCoordinateIndex?: number
  /** End mill diameter (mm) for OCL cutter; defaults to 6 */
  toolDiameterMm?: number
  /** Optional operation params from manufacture.json for 2D ops. */
  operationParams?: Record<string, unknown>
}

export type CamRunResult =
  | {
      ok: true
      gcode: string
      usedEngine: 'ocl' | 'builtin'
      engine: CamEngineOutcome
      hint?: string
    }
  | { ok: false; error: string; hint?: string }

export type CamFallbackReason =
  | 'invalid_numeric_params'
  | 'stl_missing'
  | 'config_error'
  | 'stl_read_error'
  | 'opencamlib_not_installed'
  | 'ocl_runtime_or_empty'
  | 'python_spawn_failed'
  | 'unknown_ocl_failure'

export type CamEngineOutcome = {
  requestedEngine: 'ocl' | 'builtin'
  usedEngine: 'ocl' | 'builtin'
  fallbackApplied: boolean
  fallbackReason?: CamFallbackReason
  fallbackDetail?: string
}

export type ReadStlBufferForCamResult =
  | { ok: true; buf: Buffer }
  | { ok: false; error: string; hint?: string }

/**
 * Load STL for mesh-based CAM. Validates binary layout; rejects missing, empty,
 * ASCII, and corrupt files before OpenCAMLib / built-in mesh paths run.
 */
export async function readStlBufferForCam(stlPath: string): Promise<ReadStlBufferForCamResult> {
  let buf: Buffer
  try {
    buf = await readFile(stlPath)
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
    if (code === 'ENOENT') {
      return {
        ok: false,
        error: 'CAM input mesh file was not found.',
        hint: `Expected a binary STL at the staged path. Use Make → Generate CAM to pick a file, or ensure the path exists. (${stlPath})`
      }
    }
    return {
      ok: false,
      error: 'Could not read the CAM input mesh file.',
      hint: e instanceof Error ? e.message : String(e)
    }
  }
  if (buf.length === 0) {
    return {
      ok: false,
      error: 'CAM input mesh file is empty.',
      hint: 'Re-export a binary STL from your CAD tool and try again.'
    }
  }
  if (isLikelyAsciiStl(buf)) {
    return {
      ok: false,
      error: 'ASCII STL is not supported for CAM.',
      hint: 'Convert or re-export as binary STL (this pipeline parses the binary layout only).'
    }
  }
  try {
    parseBinaryStl(buf)
  } catch (err) {
    return {
      ok: false,
      error: 'STL could not be parsed as a binary mesh.',
      hint: err instanceof Error ? err.message : 'File may be truncated or mislabeled.'
    }
  }
  return { ok: true, buf }
}

/** OpenCAMLib strategy string passed to `engines/cam/ocl_toolpath.py`. */
export function manufactureKindUsesOclStrategy(kind: string | undefined): 'waterline' | 'adaptive_waterline' | 'raster' | null {
  if (kind === 'cnc_waterline') return 'waterline'
  if (kind === 'cnc_adaptive' || kind === 'cnc_3d_rough') return 'adaptive_waterline'
  if (kind === 'cnc_raster' || kind === 'cnc_pencil' || kind === 'cnc_3d_finish') return 'raster'
  return null
}

/** Waterline / adaptive OpenCAMLib strategies only (excludes raster). */
export function manufactureKindUsesOclWaterline(
  kind: string | undefined
): 'waterline' | 'adaptive_waterline' | null {
  const s = manufactureKindUsesOclStrategy(kind)
  if (s === 'waterline' || s === 'adaptive_waterline') return s
  return null
}

type OclToolpathFile = {
  ok?: boolean
  toolpathLines?: string[]
  strategy?: string
}

export function resolveDrillCycleMode(input: {
  dialect: MachineProfile['dialect']
  operationParams?: Record<string, unknown>
}): 'g81' | 'g82' | 'g83' | 'expanded' {
  return resolveDrillCycleDecision(input).mode
}

export function resolveDrillCycleDecision(input: {
  dialect: MachineProfile['dialect']
  operationParams?: Record<string, unknown>
}): { mode: 'g81' | 'g82' | 'g83' | 'expanded'; hint?: string } {
  const p = input.operationParams ?? {}
  const raw = p['drillCycle']
  const peckMm = typeof p['peckMm'] === 'number' && Number.isFinite(p['peckMm']) ? p['peckMm'] : undefined
  const dwellMs = typeof p['dwellMs'] === 'number' && Number.isFinite(p['dwellMs']) ? p['dwellMs'] : undefined
  if (raw === 'expanded' || raw === 'g81' || raw === 'g82' || raw === 'g83') {
    if (raw === 'g83' && !(peckMm != null && peckMm > 0)) {
      return {
        mode: 'g81',
        hint: 'Drill cycle: requested G83 but peckMm is missing/invalid; falling back to G81.'
      }
    }
    if (raw === 'g82' && !(dwellMs != null && dwellMs > 0)) {
      return {
        mode: 'g81',
        hint: 'Drill cycle: requested G82 but dwellMs is missing/invalid; falling back to G81.'
      }
    }
    return { mode: raw, hint: `Drill cycle: using explicit override (${raw.toUpperCase()}).` }
  }
  if (input.dialect === 'grbl') {
    return {
      mode: 'expanded',
      hint: 'Drill cycle: grbl defaulted to expanded (G0/G1) unless you explicitly choose a canned cycle.'
    }
  }
  if (peckMm != null && peckMm > 0) {
    return { mode: 'g83', hint: `Drill cycle: auto-selected G83 from peckMm (${peckMm}).` }
  }
  if (dwellMs != null && dwellMs > 0) {
    return { mode: 'g82', hint: `Drill cycle: auto-selected G82 from dwellMs (${dwellMs}).` }
  }
  return { mode: 'g81', hint: 'Drill cycle: defaulted to G81.' }
}

/** Extra operator-facing lines merged into successful `cnc_drill` `hint` (depth / retract clarity). */
export function drillOperationHints(
  operationParams: Record<string, unknown> | undefined,
  job: { zPassMm: number; safeZMm: number }
): string[] {
  const p = operationParams ?? {}
  const hints: string[] = []
  const retractMm = typeof p['retractMm'] === 'number' && Number.isFinite(p['retractMm']) ? p['retractMm'] : undefined
  if (retractMm == null) {
    hints.push(
      `Drill: retract plane R uses safeZMm (${job.safeZMm.toFixed(1)} mm) because retractMm is unset — set retractMm for a different chip-clear height between holes.`
    )
  }
  hints.push(
    `Drill depth Z uses zPassMm (${job.zPassMm.toFixed(3)} mm) as hole bottom in the posted cycle; confirm sign vs fixture/WCS (docs/MACHINES.md).`
  )
  return hints
}

function rawPointArrayLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}

/**
 * Validates 2D op geometry before generating toolpaths. Returns user-facing
 * `error` + optional `hint` (also sent over `cam:run` on failure).
 */
export function validate2dOperationGeometry(
  operationKind: string | undefined,
  operationParams?: Record<string, unknown>
): { ok: true } | { ok: false; error: string; hint?: string } {
  const p = operationParams ?? {}
  if (operationKind === 'cnc_contour' || operationKind === 'cnc_pocket') {
    const rawKey = 'contourPoints'
    const rawCount = rawPointArrayLength(p[rawKey])
    const contour = point2dList(p[rawKey])
    if (contour.length >= 3) return { ok: true }
    if (rawCount === 0) {
      return {
        ok: false,
        error: 'Contour geometry missing.',
        hint: `Add ${rawKey}: at least three numeric [x,y] pairs in mm (Manufacture tab: derive from sketch or paste JSON). There is no STL fallback for this operation.`
      }
    }
    return {
      ok: false,
      error: 'Contour geometry invalid or incomplete.',
      hint:
        rawCount > contour.length
          ? `Some ${rawKey} entries were not valid [x,y] numbers; at least three usable points are required.`
          : `Need at least three valid points for contour/pocket geometry (self-intersecting or degenerate loops may also fail later).`
    }
  }
  if (operationKind === 'cnc_drill') {
    const rawKey = 'drillPoints'
    const rawCount = rawPointArrayLength(p[rawKey])
    const drill = point2dList(p[rawKey])
    if (drill.length >= 1) return { ok: true }
    if (rawCount === 0) {
      return {
        ok: false,
        error: 'Drill geometry missing.',
        hint: `Add ${rawKey}: at least one numeric [x,y] pair in mm (derive from sketch circles or paste JSON). There is no STL fallback for this operation.`
      }
    }
    return {
      ok: false,
      error: 'Drill geometry invalid.',
      hint: `No valid [x,y] drill positions could be read from ${rawKey}; check that every entry is a pair of finite numbers.`
    }
  }
  return { ok: true }
}

export function resolveContourPathOptions(operationParams?: Record<string, unknown>): {
  contourSide: 'climb' | 'conventional'
  leadInMm: number
  leadOutMm: number
} {
  const p = operationParams ?? {}
  const contourSide = p['contourSide'] === 'conventional' ? 'conventional' : 'climb'
  const leadInMm = typeof p['leadInMm'] === 'number' && Number.isFinite(p['leadInMm']) ? Math.max(0, p['leadInMm']) : 0
  const leadOutMm =
    typeof p['leadOutMm'] === 'number' && Number.isFinite(p['leadOutMm']) ? Math.max(0, p['leadOutMm']) : 0
  return { contourSide, leadInMm, leadOutMm }
}

export function shouldAppendFinalPocketFinishPass(input: { finishPass: boolean; finishEachDepth: boolean }): boolean {
  return input.finishPass && !input.finishEachDepth
}

const CAM_PYTHON_OUTPUT_MAX_BYTES = 8 * 1024 * 1024

async function runPythonScript(
  scriptRelative: string,
  cfgPath: string,
  pythonPath: string,
  appRoot: string,
  timeoutMs = 60_000
): Promise<{ code: number | null; stdout: string }> {
  const script = join(getEnginesRoot(), 'cam', scriptRelative)
  try {
    const r = await spawnBounded(pythonPath, [script, cfgPath], {
      cwd: appRoot,
      timeoutMs,
      maxBufferBytes: CAM_PYTHON_OUTPUT_MAX_BYTES
    })
    return { code: r.code, stdout: r.stdout + r.stderr }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('timed out')) {
      throw new Error(
        `Python script '${scriptRelative}' timed out after ${timeoutMs / 1000}s. ` +
          `Check that '${pythonPath}' is a valid Python 3 executable (set it in Utilities → Settings → Paths).`
      )
    }
    if (msg.includes('maxBufferBytes')) {
      throw new Error(
        `Python script '${scriptRelative}' produced excessive output; CAM aborted. ` +
          `If this persists, check for debug prints in the engine script.`
      )
    }
    throw e
  }
}

async function tryOclToolpath(job: CamJobConfig, strategy: string): Promise<{
  ok: boolean
  toolpathLines?: string[]
  stdout: string
  code: number | null
}> {
  const toolpathJsonPath = join(dirname(job.outputGcodePath), '_cam_toolpath.json')
  const cfgPath = join(getEnginesRoot(), 'cam', '_tmp_cam.json')
  await mkdir(dirname(cfgPath), { recursive: true })
  await writeFile(
    cfgPath,
    JSON.stringify({
      stlPath: job.stlPath,
      toolpathJsonPath,
      strategy,
      zPassMm: job.zPassMm,
      stepoverMm: job.stepoverMm,
      feedMmMin: job.feedMmMin,
      plungeMmMin: job.plungeMmMin,
      safeZMm: job.safeZMm,
      toolDiameterMm: job.toolDiameterMm ?? 6
    }),
    'utf-8'
  )

  let code: number | null = 1
  let stdout = ''
  try {
    const r = await runPythonScript('ocl_toolpath.py', cfgPath, job.pythonPath, job.appRoot)
    code = r.code
    stdout = r.stdout
  } catch {
    code = 1
    stdout = 'python_spawn_failed'
  }

  if (code !== 0) {
    return { ok: false, stdout, code }
  }

  try {
    const raw = await readFile(toolpathJsonPath, 'utf-8')
    const parsed = JSON.parse(raw) as OclToolpathFile
    const lines = parsed.toolpathLines
    if (parsed.ok && Array.isArray(lines) && lines.length > 0) {
      await unlink(toolpathJsonPath).catch(() => {})
      return { ok: true, toolpathLines: lines, stdout, code }
    }
  } catch {
    /* fall through */
  }

  return { ok: false, stdout, code }
}

/** Maps `ocl_toolpath.py` stdout (JSON error lines) to operator-facing fallback hints. Exported for tests. */
export function builtinOclFailureHint(stdout: string, operationKind: string | undefined): string | undefined {
  const raster = operationKind === 'cnc_raster' || operationKind === 'cnc_pencil'
  const waterline = operationKind === 'cnc_waterline'
  const adaptive = operationKind === 'cnc_adaptive'
  if (stdout.includes('invalid_numeric_params')) {
    return 'CAM job used invalid feed, tool, or stepover values; fix operation parameters and retry OpenCAMLib.'
  }
  if (stdout.includes('stl_missing')) {
    return raster
      ? 'OpenCAMLib config pointed at a missing STL path; using built-in mesh or orthogonal bounds raster.'
      : waterline
        ? 'OpenCAMLib config pointed at a missing STL path; using built-in parallel finish from STL bounds (Waterline intent).'
        : adaptive
          ? 'OpenCAMLib config pointed at a missing STL path; using built-in parallel finish from STL bounds (Adaptive clearing intent).'
          : 'OpenCAMLib config pointed at a missing STL path; using built-in parallel finish from STL bounds.'
  }
  if (
    stdout.includes('config_not_found') ||
    stdout.includes('config_read_error') ||
    stdout.includes('config_not_utf8') ||
    stdout.includes('invalid_config_json') ||
    stdout.includes('invalid_config_shape') ||
    stdout.includes('config_missing_keys')
  ) {
    return waterline
      ? 'OpenCAMLib helper could not read or parse its temp config JSON (internal CAM wiring); using built-in parallel finish (Waterline intent).'
      : adaptive
        ? 'OpenCAMLib helper could not read or parse its temp config JSON (internal CAM wiring); using built-in parallel finish (Adaptive clearing intent).'
        : 'OpenCAMLib helper could not read or parse its temp config JSON (internal CAM wiring); using built-in fallback toolpaths.'
  }
  if (stdout.includes('stl_read_error')) {
    return raster
      ? 'OpenCAMLib could not read the STL (corrupt or unsupported file); using built-in mesh or orthogonal bounds raster.'
      : waterline
        ? 'OpenCAMLib could not read the STL (corrupt or unsupported file); using built-in parallel finish from STL bounds (Waterline intent).'
        : adaptive
          ? 'OpenCAMLib could not read the STL (corrupt or unsupported file); using built-in parallel finish from STL bounds (Adaptive clearing intent).'
          : 'OpenCAMLib could not read the STL (corrupt or unsupported file); using built-in parallel finish from STL bounds.'
  }
  if (stdout.includes('opencamlib_not_installed')) {
    return raster
      ? 'Install Python 3.7–3.11 and pip install opencamlib for OpenCAMLib PathDropCutter raster; using built-in mesh or orthogonal bounds raster.'
      : waterline
        ? 'Install Python 3.7–3.11 and pip install opencamlib for OpenCAMLib Waterline; using built-in parallel finish from STL bounds.'
        : adaptive
          ? 'Install Python 3.7–3.11 and pip install opencamlib for OpenCAMLib AdaptiveWaterline; using built-in parallel finish from STL bounds.'
          : 'Install Python 3.7–3.11 and pip install opencamlib for OpenCAMLib Waterline or AdaptiveWaterline; using built-in parallel finish from STL bounds.'
  }
  if (stdout.includes('ocl_empty_toolpath') || stdout.includes('ocl_runtime_error')) {
    return raster
      ? 'OpenCAMLib raster failed (missing/invalid STL, PathDropCutter error, or empty CL points); using built-in mesh or orthogonal bounds raster.'
      : waterline
        ? 'OpenCAMLib Waterline did not produce a toolpath (missing/invalid STL or OCL error); using built-in parallel finish from STL bounds.'
        : adaptive
          ? 'OpenCAMLib AdaptiveWaterline did not produce a toolpath (missing/invalid STL or OCL error); using built-in parallel finish from STL bounds.'
          : 'OpenCAMLib did not produce a toolpath (missing/invalid STL or OCL error); using built-in parallel finish from STL bounds.'
  }
  if (stdout === 'python_spawn_failed') {
    return raster
      ? 'Could not spawn Python for OpenCAMLib; using built-in mesh or orthogonal bounds raster.'
      : waterline
        ? 'Could not spawn Python for OpenCAMLib; using built-in parallel finish from STL bounds (Waterline intent).'
        : adaptive
          ? 'Could not spawn Python for OpenCAMLib; using built-in parallel finish from STL bounds (Adaptive clearing intent).'
          : 'Could not spawn Python for OpenCAMLib; using built-in parallel finish from STL bounds.'
  }
  return undefined
}

/** Normalized OCL failure category used by IPC/renderer fallback messaging. */
export function resolveOclFallbackReason(stdout: string): CamFallbackReason | undefined {
  if (stdout.includes('invalid_numeric_params')) return 'invalid_numeric_params'
  if (stdout.includes('stl_missing')) return 'stl_missing'
  if (
    stdout.includes('config_not_found') ||
    stdout.includes('config_read_error') ||
    stdout.includes('config_not_utf8') ||
    stdout.includes('invalid_config_json') ||
    stdout.includes('invalid_config_shape') ||
    stdout.includes('config_missing_keys')
  ) {
    return 'config_error'
  }
  if (stdout.includes('stl_read_error')) return 'stl_read_error'
  if (stdout.includes('opencamlib_not_installed')) return 'opencamlib_not_installed'
  if (stdout.includes('ocl_empty_toolpath') || stdout.includes('ocl_runtime_error')) return 'ocl_runtime_or_empty'
  if (stdout === 'python_spawn_failed') return 'python_spawn_failed'
  return undefined
}

const UNVERIFIED =
  'G-code is unverified until you check post, units, and clearances for your machine (docs/MACHINES.md).'

function toolpathHasXYCutMoves(lines: string[]): boolean {
  return lines.some((l) => /^G1 X-?[\d.]+ Y-?[\d.]+ Z-?[\d.]+ F\d/.test(l))
}

function point2d(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const x = v[0]
  const y = v[1]
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) return null
  return [x, y]
}

function point2dList(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return []
  const out: [number, number][] = []
  for (const item of v) {
    const p = point2d(item)
    if (p) out.push(p)
  }
  return out
}

/**
 * Whether the operation kind routes to the 4-axis Python engine (`axis4_toolpath.py`).
 * These ops require `axisCount >= 4` on the machine profile.
 */
export function manufactureKindUses4AxisEngine(kind: string | undefined): boolean {
  return kind === 'cnc_4axis_wrapping' || kind === 'cnc_4axis_indexed'
}

/**
 * CAM pipeline: for `cnc_waterline` / `cnc_adaptive` / `cnc_raster` / `cnc_pencil`, try OpenCAMLib → toolpath lines → post.
 * `cnc_pencil` uses the **raster** OCL strategy with a tighter stepover (`resolvePencilStepoverMm`).
 * `cnc_4axis_wrapping` / `cnc_4axis_indexed` route to the dedicated `axis4_toolpath.py` engine.
 * Fallbacks: parallel finish (waterline/adaptive) or mesh / ortho raster (raster + pencil); other kinds use parallel finish.
 */
export async function runCamPipeline(job: CamJobConfig): Promise<CamRunResult> {
  const dbg = createCamDebugPhaseLogger()
  dbg('runCamPipeline:start')
  await mkdir(dirname(job.outputGcodePath), { recursive: true })

  // ── 4-axis operations ──────────────────────────────────────────────────────
  if (manufactureKindUses4AxisEngine(job.operationKind)) {
    const p = job.operationParams ?? {}
    const axis4Strategy = job.operationKind === 'cnc_4axis_wrapping' ? '4axis_wrapping' : '4axis_indexed'

    // Validate machine supports 4-axis
    const axisCount = (job.machine as { axisCount?: number }).axisCount ?? 3
    if (axisCount < 4) {
      return {
        ok: false,
        error: `Operation '${job.operationKind}' requires a machine with axisCount ≥ 4.`,
        hint: `The selected machine profile '${job.machine.name}' is configured as a ${axisCount}-axis machine. Switch to the 'Makera Carvera (4th Axis)' profile or another profile with axisCount: 4.`
      }
    }

    // Write axis4 config JSON
    const axis4CfgPath = job.outputGcodePath.replace(/\.gcode$/i, '-axis4-cfg.json')
    const axis4OutPath = job.outputGcodePath.replace(/\.gcode$/i, '-axis4-out.json')

    const axis4Cfg: Record<string, unknown> = {
      strategy: axis4Strategy,
      toolpathJsonPath: axis4OutPath,
      cylinderDiameterMm: typeof p['cylinderDiameterMm'] === 'number' ? p['cylinderDiameterMm'] : 50,
      cylinderLengthMm: typeof p['cylinderLengthMm'] === 'number' ? p['cylinderLengthMm'] : 100,
      zPassMm: job.zPassMm,
      stepoverDeg: typeof p['stepoverDeg'] === 'number' ? p['stepoverDeg'] : 5,
      feedMmMin: job.feedMmMin,
      plungeMmMin: job.plungeMmMin,
      safeZMm: job.safeZMm,
      toolDiameterMm: job.toolDiameterMm ?? 3.175,
      aAxisOrientation: (job.machine as { aAxisOrientation?: string }).aAxisOrientation ?? 'x',
      wrapMode: typeof p['wrapMode'] === 'string' ? p['wrapMode'] : 'parallel',
      ...(p['contourPoints'] ? { contourPoints: p['contourPoints'] } : {}),
      ...(p['indexAnglesDeg'] ? { indexAnglesDeg: p['indexAnglesDeg'] } : {})
    }
    await writeFile(axis4CfgPath, JSON.stringify(axis4Cfg), 'utf-8')

    let pyResult: { code: number | null; stdout: string }
    try {
      dbg('4axis:python_start')
      pyResult = await runPythonScript('axis4_toolpath.py', axis4CfgPath, job.pythonPath, job.appRoot)
      dbg('4axis:python_end')
    } catch (spawnErr) {
      const spawnMsg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr)
      return {
        ok: false,
        error: spawnMsg.includes('timed out') ? spawnMsg : `Failed to spawn Python for 4-axis toolpath: ${spawnMsg}`,
        hint: `Check that '${job.pythonPath}' is a valid Python 3 executable. On Windows use 'python' (not 'python3') or set the full path in Utilities → Settings → Paths.`
      }
    }

    if (pyResult.code !== 0) {
      let detail = pyResult.stdout.trim()
      try {
        const parsed = JSON.parse(pyResult.stdout.split('\n').find(l => l.trim().startsWith('{')) ?? '{}')
        detail = parsed.detail ?? parsed.error ?? detail
      } catch { /* ignore */ }
      return {
        ok: false,
        error: `4-axis engine failed (exit ${pyResult.code}).`,
        hint: detail || 'Check Python path, cylinder diameter, and operation params in manufacture.json.'
      }
    }

    let axis4Lines: string[] = []
    try {
      const outJson = await readFile(axis4OutPath, 'utf-8')
      const parsed = JSON.parse(outJson) as { ok: boolean; toolpathLines?: string[] }
      if (parsed.ok && Array.isArray(parsed.toolpathLines)) {
        axis4Lines = parsed.toolpathLines
      }
    } catch (e) {
      return {
        ok: false,
        error: 'Could not read 4-axis toolpath output.',
        hint: e instanceof Error ? e.message : String(e)
      }
    }

    if (axis4Lines.length === 0) {
      return {
        ok: false,
        error: '4-axis toolpath is empty.',
        hint: 'Check cylinderDiameterMm, cylinderLengthMm, and zPassMm. For indexed mode ensure indexAnglesDeg is a non-empty array.'
      }
    }

    dbg('4axis:post_start')
    const gcode = await renderPost(job.resourcesRoot, job.machine, axis4Lines, {
      workCoordinateIndex: job.workCoordinateIndex
    })
    await writeFile(job.outputGcodePath, gcode, 'utf-8')
    dbg('4axis:done')
    return {
      ok: true,
      gcode,
      usedEngine: 'builtin',
      engine: { requestedEngine: 'builtin', usedEngine: 'builtin', fallbackApplied: false },
      hint: `4-axis toolpath (${axis4Strategy}) posted. ${UNVERIFIED} Run an air cut with spindle OFF before any real cut. Confirm cylinder diameter and A WCS home (docs/MACHINES.md).`
    }
  }

  if (job.operationKind === 'cnc_contour' || job.operationKind === 'cnc_pocket' || job.operationKind === 'cnc_drill') {
    const valid = validate2dOperationGeometry(job.operationKind, job.operationParams)
    if (!valid.ok) {
      return { ok: false, error: valid.error, hint: valid.hint }
    }
    const p = job.operationParams ?? {}
    let lines: string[] = []
    let pocketResultHints: string[] = []
    let drillResultHints: string[] = []
    if (job.operationKind === 'cnc_contour') {
      const contour = point2dList(p['contourPoints'])
      const { contourSide, leadInMm, leadOutMm } = resolveContourPathOptions(p)
      const zStepContour =
        typeof p['zStepMm'] === 'number' && Number.isFinite(p['zStepMm']) ? Math.max(0.01, p['zStepMm']) : undefined
      const contourOpts = {
        contourPoints: contour,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm,
        contourSide,
        leadInMm,
        leadOutMm
      }
      if (job.zPassMm < 0 && zStepContour != null) {
        const depths = computeNegativeZDepthPasses(job.zPassMm, zStepContour)
        lines = depths.flatMap((z) => generateContour2dLines({ ...contourOpts, zPassMm: z }))
      } else {
        lines = generateContour2dLines({ ...contourOpts, zPassMm: job.zPassMm })
      }
      if (lines.length === 0) {
        return {
          ok: false,
          error: 'Contour toolpath is empty.',
          hint:
            'Check contourPoints form a closed, non-degenerate polygon (≥3 distinct points, non-zero area) in setup WCS; zPassMm must reach stock; safe height and feeds must be valid. Open or self-intersecting loops produce no moves.'
        }
      }
    } else if (job.operationKind === 'cnc_pocket') {
      const contour = point2dList(p['contourPoints'])
      const wallStockMm = typeof p['wallStockMm'] === 'number' && Number.isFinite(p['wallStockMm']) ? Math.max(0, p['wallStockMm']) : 0
      const zStepMm = typeof p['zStepMm'] === 'number' && Number.isFinite(p['zStepMm']) ? Math.max(0.01, p['zStepMm']) : undefined
      const entryMode = p['entryMode'] === 'ramp' ? 'ramp' : 'plunge'
      const rampMm = typeof p['rampMm'] === 'number' && Number.isFinite(p['rampMm']) ? Math.max(0.01, p['rampMm']) : undefined
      const rampMaxAngleDeg =
        typeof p['rampMaxAngleDeg'] === 'number' && Number.isFinite(p['rampMaxAngleDeg'])
          ? p['rampMaxAngleDeg']
          : undefined
      const finishPass = p['finishPass'] !== false
      const finishEachDepth = p['finishEachDepth'] === true
      const { contourSide, leadInMm, leadOutMm } = resolveContourPathOptions(p)
      const pocket = generatePocket2dLines({
        contourPoints: contour,
        stepoverMm: job.stepoverMm,
        zPassMm: job.zPassMm,
        zStepMm,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm,
        wallStockMm,
        finishEachDepth,
        entryMode,
        rampMm,
        rampMaxAngleDeg
      })
      lines = pocket.lines
      pocketResultHints = pocket.hints
      if (shouldAppendFinalPocketFinishPass({ finishPass, finishEachDepth })) {
        lines.push(
          ...generateContour2dLines({
            contourPoints: contour,
            zPassMm: job.zPassMm,
            feedMmMin: job.feedMmMin,
            plungeMmMin: job.plungeMmMin,
            safeZMm: job.safeZMm,
            contourSide,
            leadInMm,
            leadOutMm
          })
        )
      }
      if (lines.length === 0) {
        return {
          ok: false,
          error: 'Pocket toolpath is empty.',
          hint:
            'Common causes: tool diameter too large for the pocket, contour too tight for stepover, invalid ramp settings, self-intersecting or open contours, or geometry the offsetter cannot offset. Try smaller toolDiameterMm / stepover or simplify contourPoints.'
        }
      }
    } else {
      const drillPoints = point2dList(p['drillPoints'])
      const retractMm = typeof p['retractMm'] === 'number' && Number.isFinite(p['retractMm']) ? p['retractMm'] : undefined
      const peckMm = typeof p['peckMm'] === 'number' && Number.isFinite(p['peckMm']) ? p['peckMm'] : undefined
      const dwellMs = typeof p['dwellMs'] === 'number' && Number.isFinite(p['dwellMs']) ? p['dwellMs'] : undefined
      const drillCycleDecision = resolveDrillCycleDecision({ dialect: job.machine.dialect, operationParams: p })
      lines = generateDrill2dLines({
        drillPoints,
        zPassMm: job.zPassMm,
        feedMmMin: job.feedMmMin,
        safeZMm: job.safeZMm,
        retractMm,
        peckMm,
        dwellMs,
        cycleMode: drillCycleDecision.mode
      })
      drillResultHints = drillCycleDecision.hint ? [drillCycleDecision.hint] : []
      drillResultHints.push(...drillOperationHints(p, { zPassMm: job.zPassMm, safeZMm: job.safeZMm }))
      if (lines.length === 0) {
        return {
          ok: false,
          error: 'Drill toolpath is empty.',
          hint: 'Check drillPoints, zPassMm (depth), safeZMm, and retractMm; all must be consistent so the cycle can emit moves.'
        }
      }
    }
    dbg('2d:post_start')
    const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
      workCoordinateIndex: job.workCoordinateIndex
    })
    await writeFile(job.outputGcodePath, gcode, 'utf-8')
    dbg('2d:done')
    const base2dHint =
      '2D path posted from operation geometry params (`contourPoints` / `drillPoints`). G-code is unverified until post/machine checks (docs/MACHINES.md).'
    return {
      ok: true,
      gcode,
      usedEngine: 'builtin',
      engine: {
        requestedEngine: 'builtin',
        usedEngine: 'builtin',
        fallbackApplied: false
      },
      hint: [base2dHint, ...pocketResultHints, ...drillResultHints].filter(Boolean).join(' ')
    }
  }

  dbg('stl:read_start')
  const stlLoad = await readStlBufferForCam(job.stlPath)
  dbg('stl:read_done')
  if (!stlLoad.ok) return stlLoad
  const meshBuf = stlLoad.buf

  const camJob =
    job.operationKind === 'cnc_pencil'
      ? {
          ...job,
          stepoverMm: resolvePencilStepoverMm({
            baseStepoverMm: job.stepoverMm,
            toolDiameterMm: job.toolDiameterMm ?? 6,
            operationParams: job.operationParams
          })
        }
      : job.operationKind === 'cnc_3d_finish'
      ? {
          // 3D finish: use finishStepoverMm if provided (overrides stepoverMm for tighter passes)
          ...job,
          stepoverMm:
            typeof job.operationParams?.finishStepoverMm === 'number' && job.operationParams.finishStepoverMm > 0
              ? job.operationParams.finishStepoverMm
              : job.stepoverMm
        }
      : job

  const oclStrategy = manufactureKindUsesOclStrategy(camJob.operationKind)
  if (oclStrategy) {
    dbg('ocl:start')
    const ocl = await tryOclToolpath(camJob, oclStrategy)
    dbg(ocl.ok && ocl.toolpathLines && ocl.toolpathLines.length > 0 ? 'ocl:success' : 'ocl:fallback')
    if (ocl.ok && ocl.toolpathLines && ocl.toolpathLines.length > 0) {
      dbg('ocl:post_start')
      const gcode = await renderPost(job.resourcesRoot, job.machine, ocl.toolpathLines, {
        workCoordinateIndex: job.workCoordinateIndex
      })
      await writeFile(job.outputGcodePath, gcode, 'utf-8')
      dbg('ocl:done')
      const stratLabel =
        oclStrategy === 'adaptive_waterline'
          ? 'AdaptiveWaterline'
          : oclStrategy === 'raster'
            ? job.operationKind === 'cnc_pencil'
              ? 'PathDropCutter raster (pencil / tight stepover)'
              : 'PathDropCutter raster'
            : 'waterline'
      return {
        ok: true,
        gcode,
        usedEngine: 'ocl',
        engine: {
          requestedEngine: 'ocl',
          usedEngine: 'ocl',
          fallbackApplied: false
        },
        hint: `OpenCAMLib ${stratLabel} toolpath posted for your machine profile. ${UNVERIFIED}`
      }
    }
    const fallbackReason = resolveOclFallbackReason(ocl.stdout) ?? 'unknown_ocl_failure'
    const hint = builtinOclFailureHint(ocl.stdout, job.operationKind)
    const bounds = parseBinaryStl(meshBuf)

    if (oclStrategy === 'raster') {
      dbg('fallback:mesh_raster_start')
      const mesh = collectBinaryStlTriangles(meshBuf)
      const sampleStepMm = Math.max(0.2, Math.min(camJob.stepoverMm, 2))
      let lines = generateMeshHeightRasterLines({
        triangles: mesh.triangles,
        minX: bounds.min[0],
        maxX: bounds.max[0],
        minY: bounds.min[1],
        maxY: bounds.max[1],
        stepoverMm: camJob.stepoverMm,
        sampleStepMm,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm
      })
      dbg('fallback:mesh_raster_end')
      const extras: string[] = []
      if (mesh.truncated) {
        extras.push(`STL sampled with first ${mesh.triangles.length} triangles only (cap).`)
      }
      if (!toolpathHasXYCutMoves(lines)) {
        lines = generateOrthoBoundsRasterLines({
          bounds,
          zPassMm: job.zPassMm,
          stepoverMm: camJob.stepoverMm,
          feedMmMin: job.feedMmMin,
          plungeMmMin: job.plungeMmMin,
          safeZMm: job.safeZMm
        })
        extras.push(
          'Mesh height-field produced no XY cuts (empty mesh, ASCII STL, or samples off-surface); using orthogonal bounds zigzag at fixed Z from params.'
        )
      } else {
        extras.push(
          'Built-in 2.5D mesh height-field XY raster (upper envelope; no cutter-radius compensation or undercut handling).'
        )
      }
      if (job.operationKind === 'cnc_pencil') {
        extras.push('Pencil op: built-in raster uses reduced stepover vs standard raster.')
      }
      dbg('fallback:raster_post_start')
      const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
        workCoordinateIndex: job.workCoordinateIndex
      })
      await writeFile(job.outputGcodePath, gcode, 'utf-8')
      dbg('fallback:raster_done')
      const tail = extras.length ? ` ${extras.join(' ')}` : ''
      return {
        ok: true,
        gcode,
        usedEngine: 'builtin',
        engine: {
          requestedEngine: 'ocl',
          usedEngine: 'builtin',
          fallbackApplied: true,
          fallbackReason,
          fallbackDetail: extras.join(' ')
        },
        hint: [hint, tail.trim(), UNVERIFIED].filter(Boolean).join(' ')
      }
    }

    dbg('fallback:parallel_finish_start')
    const lines = generateParallelFinishLines({
      bounds,
      zPassMm: job.zPassMm,
      stepoverMm: job.stepoverMm,
      feedMmMin: job.feedMmMin,
      plungeMmMin: job.plungeMmMin,
      safeZMm: job.safeZMm
    })
    dbg('fallback:parallel_finish_end')
    const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
      workCoordinateIndex: job.workCoordinateIndex
    })
    await writeFile(job.outputGcodePath, gcode, 'utf-8')
    dbg('fallback:parallel_done')
    return {
      ok: true,
      gcode,
      usedEngine: 'builtin',
      engine: {
        requestedEngine: 'ocl',
        usedEngine: 'builtin',
        fallbackApplied: true,
        fallbackReason
      },
      hint: [hint, UNVERIFIED].filter(Boolean).join(' ')
    }
  }

  dbg('builtin_parallel:start')
  const bounds = parseBinaryStl(meshBuf)
  const lines = generateParallelFinishLines({
    bounds,
    zPassMm: job.zPassMm,
    stepoverMm: job.stepoverMm,
    feedMmMin: job.feedMmMin,
    plungeMmMin: job.plungeMmMin,
    safeZMm: job.safeZMm
  })
  dbg('builtin_parallel:post_start')
  const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
    workCoordinateIndex: job.workCoordinateIndex
  })
  await writeFile(job.outputGcodePath, gcode, 'utf-8')
  dbg('builtin_parallel:done')
  return {
    ok: true,
    gcode,
    usedEngine: 'builtin',
    engine: {
      requestedEngine: 'builtin',
      usedEngine: 'builtin',
      fallbackApplied: false
    },
    hint: `Built-in parallel finish from STL bounding box (no OpenCAMLib). ${UNVERIFIED}`
  }
}
