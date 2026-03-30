import { spawnBounded } from './subprocess-bounded'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MachineProfile } from '../shared/machine-schema'
import {
  buildPriorRoughFloorSamplerFromGcode,
  computeNegativeZDepthPasses,
  generateContour2dLines,
  generateDrill2dLines,
  generateMeshHeightRasterLines,
  generateOrthoBoundsRasterLines,
  generatePocket2dLines,
  generateParallelFinishLines
} from './cam-local'
import { resolvePencilStepoverMm } from '../shared/cam-cut-params'
import {
  rotaryMachinableXSpanMm,
  rotaryMeshStockAlignmentHint,
  rasterRestGapFromStockAndMeshMinZ,
  suggestedZPassMmFromStockAndMeshMinZ
} from '../shared/cam-setup-defaults'
import {
  formatMachineEnvelopeHintForPostedGcode,
  formatRotaryRadialHintForPostedGcode
} from '../shared/cam-machine-envelope'
import { resolve3dFinishStepoverMm } from '../shared/cam-scallop-stepover'
import { getEnginesRoot } from './paths'
import { applyCamToolpathGuardrails } from './cam-toolpath-guardrails'
import { renderPost } from './post-process'
import {
  collectAsciiStlTriangles,
  collectBinaryStlTriangles,
  isBinaryStlLayout,
  isLikelyAsciiStl,
  parseBinaryStl
} from './stl'
import { generateCylindricalMeshRasterLines } from './cam-axis4-cylindrical-raster'

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
  /** Shop rotary job: stock length (mm), chuck depth, clamp buffer — passed to axis4_toolpath.py. */
  rotaryStockLengthMm?: number
  /** Shop rotary job: stock diameter (mm), same as job stock Y — used when set instead of operation params. */
  rotaryStockDiameterMm?: number
  rotaryChuckDepthMm?: number
  rotaryClampOffsetMm?: number
  /** Manufacture/Shop setup: stock height (mm) for auto raster rest below mesh (WCS Z0 = stock top). */
  stockBoxZMm?: number
  /** Optional full box for future XY voxel/sim (mm). */
  stockBoxXMm?: number
  stockBoxYMm?: number
  /**
   * Optional prior posted G-code (same WCS as current job). When `operationParams.usePriorPostedGcodeRest === true`,
   * built-in mesh raster uses a coarse min-Z floor from feed moves to skip pencil/rest cleanup where roughing already passed the surface.
   */
  priorPostedGcode?: string
  /**
   * When false, omit STL X min/max clamp for 4-axis machinable span (avoids empty span if mesh WCS ≠ stock).
   * Operation param `useMeshMachinableXClamp: false` also disables.
   */
  useMeshMachinableXClamp?: boolean
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
  if (isLikelyAsciiStl(buf) && !isBinaryStlLayout(buf)) {
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

function rasterRestStockMmFromParams(p: Record<string, unknown> | undefined): number | undefined {
  if (!p) return undefined
  const v = p['rasterRestStockMm']
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return undefined
}

function meshAnalyticPriorRoughStockMmFromParams(p: Record<string, unknown> | undefined): number | undefined {
  if (!p) return undefined
  const v = p['meshAnalyticPriorRoughStockMm']
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  return undefined
}

function priorRoughFloorSamplerForMeshRaster(
  job: CamJobConfig,
  bounds: { min: [number, number, number]; max: [number, number, number] }
): ReturnType<typeof buildPriorRoughFloorSamplerFromGcode> | undefined {
  const p = job.operationParams as Record<string, unknown> | undefined
  if (p?.['usePriorPostedGcodeRest'] !== true) return undefined
  const g = job.priorPostedGcode?.trim()
  if (!g) return undefined
  const roughDia =
    typeof p['priorRoughToolDiameterMm'] === 'number' && Number.isFinite(p['priorRoughToolDiameterMm']) && p['priorRoughToolDiameterMm'] > 0
      ? (p['priorRoughToolDiameterMm'] as number)
      : job.toolDiameterMm ?? 6
  const toolRadiusMm = roughDia * 0.5
  return buildPriorRoughFloorSamplerFromGcode({
    gcode: g,
    minX: bounds.min[0],
    maxX: bounds.max[0],
    minY: bounds.min[1],
    maxY: bounds.max[1],
    toolRadiusMm
  }) ?? undefined
}

function effectiveRasterRestStockMm(job: CamJobConfig, meshMinZMm: number): number | undefined {
  const p = job.operationParams as Record<string, unknown> | undefined
  const explicit = rasterRestStockMmFromParams(p)
  if (explicit != null) return explicit
  if (p?.['autoRasterRestFromSetup'] === false) return undefined
  const sz = job.stockBoxZMm
  if (sz == null || !(sz > 0)) return undefined
  return rasterRestGapFromStockAndMeshMinZ(sz, meshMinZMm)
}

function postedGcodeEnvelopeHint(machine: MachineProfile, gcode: string, rotaryStockDiameterMm?: number): string {
  if (machine.kind !== 'cnc') return ''
  let h = formatMachineEnvelopeHintForPostedGcode(gcode, machine.workAreaMm)
  const ac = machine.axisCount ?? 3
  if (ac >= 4 && rotaryStockDiameterMm != null && rotaryStockDiameterMm > 0) {
    h += formatRotaryRadialHintForPostedGcode(gcode, rotaryStockDiameterMm)
  }
  return h
}

function rotaryTravelHintForPostedGcode(operationKind: string | undefined, gcode: string): string {
  if (!operationKind?.includes('4axis')) return ''
  const re = /\bA\s*(-?\d+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  let maxAbs = 0
  while ((m = re.exec(gcode)) != null) {
    const v = Math.abs(Number.parseFloat(m[1]!))
    if (v > maxAbs) maxAbs = v
  }
  if (maxAbs < 1e-6) return ''
  if (maxAbs > 720) {
    return ` Large A-axis travel (~${maxAbs.toFixed(0)}° in program); confirm post/controller wrap and soft limits (docs/MACHINES.md).`
  }
  return ''
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
 * `axis4_toolpath.py` uses **negative** `zPassMm` as radial depth into the cylinder
 * (`cutZ = radius + zPass`). Positive values place the tool **outside** the stock (air).
 * Shared CAM resolution can still yield positive `zPassMm` (e.g. cut-param defaults),
 * so we treat positive magnitudes as “depth into stock” and zero as a small default cut.
 */
export function normalizeAxis4RadialZPassMm(zPassMm: number): number {
  if (zPassMm < -1e-9) return zPassMm
  if (zPassMm > 1e-9) return -Math.abs(zPassMm)
  return -1
}

function iterAxis4ZDepthsMm(zPassMm: number, zStepMm: number): number[] {
  const zp = zPassMm
  const zs = Math.max(0, zStepMm)
  if (zp >= -1e-9) return [zp]
  if (zs <= 1e-6) return [zp]
  const out: number[] = []
  let d = -zs
  while (d > zp + 1e-6) {
    out.push(d)
    d -= zs
  }
  out.push(zp)
  return out
}

function computeAxis4ZDepthsMm(
  zPassMm: number,
  zStepMm: number,
  cylinderRadiusMm: number,
  useMeshRadial: boolean,
  meshRadialMaxMm?: number
): number[] {
  const zp = zPassMm
  const r = Math.max(1e-6, cylinderRadiusMm)
  const mr = meshRadialMaxMm ?? 0
  if (!useMeshRadial || !(mr > 0) || mr >= r - 1e-6) {
    return iterAxis4ZDepthsMm(zp, zStepMm)
  }
  const zShallow = mr - r
  if (zShallow <= zp + 1e-6) return iterAxis4ZDepthsMm(zp, zStepMm)
  const zs = Math.max(0, zStepMm)
  if (zs <= 1e-6) return [zp]
  const out: number[] = []
  let d = zShallow
  while (d > zp + 1e-6) {
    out.push(d)
    d -= zs
  }
  out.push(zp)
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
export async function runCamPipeline(initialJob: CamJobConfig): Promise<CamRunResult> {
  const dbg = createCamDebugPhaseLogger()
  dbg('runCamPipeline:start')
  await mkdir(dirname(initialJob.outputGcodePath), { recursive: true })
  const gr = applyCamToolpathGuardrails(initialJob)
  let job = gr.job
  const guardHint = gr.notes.length ? ` Applied guardrails: ${gr.notes.join('; ')}.` : ''

  // ── 4-axis operations ──────────────────────────────────────────────────────
  if (manufactureKindUses4AxisEngine(job.operationKind)) {
    const p = job.operationParams ?? {}
    const axis4Strategy = job.operationKind === 'cnc_4axis_wrapping' ? '4axis_wrapping' : '4axis_indexed'
    const rawWrap = String(p['wrapMode'] ?? 'parallel').toLowerCase()

    let contourClosureHint = ''
    if (job.operationKind === 'cnc_4axis_wrapping' && rawWrap === 'contour') {
      const cpts = point2dList(p['contourPoints'])
      if (cpts.length < 2) {
        return {
          ok: false,
          error: '4-axis contour wrapping requires contourPoints (at least two [x, y] points in mm).',
          hint: 'Add contourPoints to the operation, apply a sketch contour from the Manufacture plan, or switch wrap mode to Parallel / Raster / Silhouette rough. See docs/CAM_4TH_AXIS_REFERENCE.md.'
        }
      }
      if (cpts.length >= 3) {
        const [fx, fy] = cpts[0]!
        const [lx, ly] = cpts[cpts.length - 1]!
        const gap = Math.hypot(lx - fx, ly - fy)
        if (gap > 0.5) {
          contourClosureHint = ` Contour wrap: polyline is not closed (endpoints ${gap.toFixed(2)} mm apart) — close the loop in WCS for predictable unwrap.`
        }
      }
    }

    const axisCount = (job.machine as { axisCount?: number }).axisCount ?? 3
    if (axisCount < 4) {
      return {
        ok: false,
        error: `Operation '${job.operationKind}' requires a machine with axisCount ≥ 4.`,
        hint: `The selected machine profile '${job.machine.name}' is configured as a ${axisCount}-axis machine. Switch to the 'Makera Carvera (4th Axis)' profile or another profile with axisCount: 4.`
      }
    }

    const axis4CfgPath = job.outputGcodePath.replace(/\.gcode$/i, '-axis4-cfg.json')
    const axis4OutPath = job.outputGcodePath.replace(/\.gcode$/i, '-axis4-out.json')

    const stockL = job.rotaryStockLengthMm
    const stockD = job.rotaryStockDiameterMm
    const pCylLen =
      typeof p['cylinderLengthMm'] === 'number' && Number.isFinite(p['cylinderLengthMm']) && p['cylinderLengthMm'] > 0
        ? p['cylinderLengthMm']
        : undefined
    const pCylDia =
      typeof p['cylinderDiameterMm'] === 'number' &&
      Number.isFinite(p['cylinderDiameterMm']) &&
      p['cylinderDiameterMm'] > 0
        ? p['cylinderDiameterMm']
        : undefined

    let cylinderLengthMm = 100
    if (stockL != null && Number.isFinite(stockL) && stockL > 0) cylinderLengthMm = stockL
    else if (pCylLen != null) cylinderLengthMm = pCylLen

    let cylD = 50
    if (stockD != null && Number.isFinite(stockD) && stockD > 0) cylD = stockD
    else if (pCylDia != null) cylD = pCylDia
    const stepDegFromMm = (job.stepoverMm / (Math.PI * Math.max(cylD, 1e-6))) * 360
    const stepoverDeg =
      typeof p['stepoverDeg'] === 'number' && Number.isFinite(p['stepoverDeg']) && p['stepoverDeg'] > 0
        ? p['stepoverDeg']
        : Math.max(1, Math.min(90, stepDegFromMm))

    let zStepMm =
      typeof p['zStepMm'] === 'number' && Number.isFinite(p['zStepMm']) && p['zStepMm'] > 0 ? p['zStepMm'] : 0
    const normZPass = normalizeAxis4RadialZPassMm(job.zPassMm)
    if (!(zStepMm > 0) && Math.abs(normZPass) > 0.3) {
      zStepMm = Math.min(2, Math.max(0.25, Math.abs(normZPass) / 4))
    }

    const chuckDepthMm =
      job.rotaryChuckDepthMm ??
      (typeof p['chuckDepthMm'] === 'number' && Number.isFinite(p['chuckDepthMm']) && p['chuckDepthMm'] >= 0
        ? p['chuckDepthMm']
        : 0)
    const clampOffsetMm =
      job.rotaryClampOffsetMm ??
      (typeof p['clampOffsetMm'] === 'number' && Number.isFinite(p['clampOffsetMm']) && p['clampOffsetMm'] >= 0
        ? p['clampOffsetMm']
        : 0)

    const wrapAxRaw = typeof p['wrapAxis'] === 'string' ? p['wrapAxis'].toLowerCase() : ''
    const machA = String((job.machine as { aAxisOrientation?: string }).aAxisOrientation ?? 'x').toLowerCase()
    const aAxisOrientation = wrapAxRaw === 'x' || wrapAxRaw === 'y' ? wrapAxRaw : machA === 'y' ? 'y' : 'x'

    const useMeshXClamp = job.useMeshMachinableXClamp !== false && p['useMeshMachinableXClamp'] !== false

    let meshMachinableXMinMm: number | undefined
    let meshMachinableXMaxMm: number | undefined
    let meshRadialMaxMm: number | undefined
    try {
      const stlBuf = await readFile(job.stlPath)
      if (isBinaryStlLayout(stlBuf)) {
        const mb = parseBinaryStl(stlBuf)
        meshMachinableXMinMm = mb.min[0]
        meshMachinableXMaxMm = mb.max[0]
        const yzCorners: [number, number][] = [
          [mb.min[1], mb.min[2]],
          [mb.min[1], mb.max[2]],
          [mb.max[1], mb.min[2]],
          [mb.max[1], mb.max[2]]
        ]
        meshRadialMaxMm = Math.max(...yzCorners.map(([y, z]) => Math.hypot(y, z)))
      }
    } catch {
      /* optional — pattern-only 4-axis if STL missing */
    }

    const cylR = cylD / 2

    const toolD = job.toolDiameterMm ?? 3.175
    const userBands = p['axialBandCount']
    let axialBandCount = 1
    if (typeof userBands === 'number' && Number.isFinite(userBands) && userBands >= 1) {
      axialBandCount = Math.min(24, Math.max(1, Math.floor(userBands)))
    } else if (
      useMeshXClamp &&
      meshMachinableXMinMm != null &&
      meshMachinableXMaxMm != null &&
      meshMachinableXMaxMm > meshMachinableXMinMm + 1e-3
    ) {
      const span = meshMachinableXMaxMm - meshMachinableXMinMm
      if (span > toolD * 2.5) {
        axialBandCount = Math.min(10, Math.max(2, Math.round(span / Math.max(toolD * 4, 10))))
      }
    }

    const stockLenForMach =
      stockL != null && Number.isFinite(stockL) && stockL > 0 ? stockL : cylinderLengthMm
    const spanMach = rotaryMachinableXSpanMm(stockLenForMach, chuckDepthMm, clampOffsetMm)
    let mach_x_s = spanMach.machXStartMm
    let mach_x_e = Math.min(cylinderLengthMm, spanMach.machXEndMm)
    if (
      useMeshXClamp &&
      meshMachinableXMinMm != null &&
      meshMachinableXMaxMm != null &&
      meshMachinableXMaxMm > meshMachinableXMinMm + 1e-3
    ) {
      mach_x_s = Math.max(mach_x_s, meshMachinableXMinMm)
      mach_x_e = Math.min(mach_x_e, meshMachinableXMaxMm)
    }

    let alignHint = ''
    if (
      meshMachinableXMinMm != null &&
      meshMachinableXMaxMm != null &&
      meshMachinableXMaxMm > meshMachinableXMinMm
    ) {
      const h = rotaryMeshStockAlignmentHint({
        stockLengthMm: stockLenForMach,
        meshMinX: meshMachinableXMinMm,
        meshMaxX: meshMachinableXMaxMm
      })
      if (h) alignHint = ` ${h}`
    }

    const normAxis4ZPass = normalizeAxis4RadialZPassMm(job.zPassMm)
    const zDepths = computeAxis4ZDepthsMm(
      normAxis4ZPass,
      zStepMm,
      cylR,
      p['useMeshRadialZBands'] === true &&
        meshRadialMaxMm != null &&
        Number.isFinite(meshRadialMaxMm) &&
        meshRadialMaxMm > 0,
      meshRadialMaxMm
    )

    const radialExtentHint =
      meshRadialMaxMm != null &&
      Number.isFinite(meshRadialMaxMm) &&
      meshRadialMaxMm > cylR + 0.5
        ? ` Rotary: STL extends ~${meshRadialMaxMm.toFixed(1)} mm from the X axis but job cylinder radius is ${cylR.toFixed(
            1
          )} mm (Ø${cylD.toFixed(1)}). Toolpaths only cut inside that cylinder — increase rotary stock Ø (≥ ~${(2 * meshRadialMaxMm).toFixed(1)} mm) or rescale/reorient the STL (docs/CAM_4TH_AXIS_REFERENCE.md).`
        : ''

    // ── Mesh-aware TS heightmap engine for ALL 4-axis ops (not just raster) ──
    // Contour mode uses explicit contour points (not mesh) → always Python.
    // All other wrapping & indexed modes: try TS mesh-aware engine first,
    // fall back to Python only when STL is unavailable or TS produces no cuts.
    const useContourMode = job.operationKind === 'cnc_4axis_wrapping' && rawWrap === 'contour'

    let axis4Lines: string[] | null = null
    if (!useContourMode && mach_x_e > mach_x_s + 0.05) {
      try {
        const stlBuf = await readFile(job.stlPath)
        const { triangles, truncated } = isBinaryStlLayout(stlBuf)
          ? collectBinaryStlTriangles(stlBuf, 120_000)
          : isLikelyAsciiStl(stlBuf)
            ? collectAsciiStlTriangles(stlBuf, 120_000)
            : collectBinaryStlTriangles(stlBuf, 120_000)
        if (triangles.length > 0) {
          const maxCells =
            typeof p['cylindricalRasterMaxCells'] === 'number' &&
            Number.isFinite(p['cylindricalRasterMaxCells']) &&
            p['cylindricalRasterMaxCells'] >= 100
              ? Math.min(200_000, Math.floor(p['cylindricalRasterMaxCells'] as number))
              : undefined
          const finishAl =
            typeof p['rotaryFinishAllowanceMm'] === 'number' && Number.isFinite(p['rotaryFinishAllowanceMm'])
              ? Math.max(0, p['rotaryFinishAllowanceMm'] as number)
              : undefined
          const overcutMm =
            typeof p['overcutMm'] === 'number' && Number.isFinite(p['overcutMm']) && p['overcutMm'] >= 0
              ? p['overcutMm']
              : undefined
          // For silhouette_rough, use coarser angular stepover
          const effectiveStepoverDeg =
            rawWrap === 'silhouette_rough' || rawWrap === 'silhouette'
              ? Math.max(5, Math.min(90, stepoverDeg * 2.5))
              : stepoverDeg
          const lines = generateCylindricalMeshRasterLines({
            triangles,
            cylinderRadiusMm: cylD,
            machXStartMm: mach_x_s,
            machXEndMm: mach_x_e,
            stepoverDeg: effectiveStepoverDeg,
            stepXMm: Math.max(0.25, job.stepoverMm),
            zDepthsMm: zDepths,
            feedMmMin: job.feedMmMin,
            plungeMmMin: job.plungeMmMin,
            safeZMm: job.safeZMm,
            finishAllowanceMm: finishAl,
            maxCells,
            toolDiameterMm: toolD,
            overcutMm
          })
          // Validate output: must have both plunge moves (G1 Z) AND cutting moves (G1 X)
          const g1xCount = lines.filter((l) => /^G1\s+X[\d.-]/i.test(l)).length
          const hasG1z = lines.some((l) => /^G1\s+Z[\d.-]/i.test(l))
          if (hasG1z && g1xCount >= 4) {
            axis4Lines = lines
            if (truncated) {
              alignHint +=
                ' Cylindrical raster used a truncated STL triangle budget — simplify mesh or see docs/CAM_4TH_AXIS_REFERENCE.md.'
            }
          }
        }
      } catch (meshRasterErr) {
        // Log but don't block — fall through to Python engine
        dbg(`4axis:ts_mesh_raster_error: ${meshRasterErr instanceof Error ? meshRasterErr.message : String(meshRasterErr)}`)
      }
    }

    // ── Python fallback: contour mode, or when STL unavailable/TS produced no cuts ──
    if (axis4Lines == null) {
      const pyWrapMode =
        rawWrap === 'contour'
          ? 'contour'
          : rawWrap === 'silhouette_rough' || rawWrap === 'silhouette'
            ? 'silhouette_rough'
            : 'parallel'

      const pyOvercutMm =
        typeof p['overcutMm'] === 'number' && Number.isFinite(p['overcutMm']) && p['overcutMm'] >= 0
          ? p['overcutMm']
          : undefined
      const axis4Cfg: Record<string, unknown> = {
        strategy: axis4Strategy,
        toolpathJsonPath: axis4OutPath,
        cylinderDiameterMm: cylD,
        cylinderLengthMm,
        zPassMm: normalizeAxis4RadialZPassMm(job.zPassMm),
        zStepMm,
        stepoverDeg,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm,
        toolDiameterMm: job.toolDiameterMm ?? 3.175,
        aAxisOrientation,
        wrapMode: pyWrapMode,
        stockLengthMm: stockL ?? cylinderLengthMm,
        chuckDepthMm,
        clampOffsetMm,
        stlPath: job.stlPath,
        ...(pyOvercutMm != null ? { overcutMm: pyOvercutMm } : {}),
        ...(p['contourPoints'] ? { contourPoints: p['contourPoints'] } : {}),
        ...(p['indexAnglesDeg'] ? { indexAnglesDeg: p['indexAnglesDeg'] } : {}),
        ...(useMeshXClamp &&
        meshMachinableXMinMm != null &&
        meshMachinableXMaxMm != null &&
        meshMachinableXMaxMm > meshMachinableXMinMm
          ? { meshMachinableXMinMm, meshMachinableXMaxMm }
          : {}),
        axialBandCount,
        ...(p['useMeshRadialZBands'] === true &&
        meshRadialMaxMm != null &&
        Number.isFinite(meshRadialMaxMm) &&
        meshRadialMaxMm > 0
          ? { useMeshRadialZBands: true, meshRadialMaxMm }
          : {})
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
          const parsed = JSON.parse(pyResult.stdout.split('\n').find((l) => l.trim().startsWith('{')) ?? '{}')
          detail = (parsed as { detail?: string; error?: string }).detail ?? (parsed as { error?: string }).error ?? detail
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          error: `4-axis engine failed (exit ${pyResult.code}).`,
          hint: detail || 'Check Python path, cylinder diameter, and operation params in manufacture.json.'
        }
      }

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
    }

    if (axis4Lines == null || axis4Lines.length === 0) {
      return {
        ok: false,
        error: '4-axis toolpath is empty.',
        hint: 'Check cylinderDiameterMm, cylinderLengthMm, and zPassMm. For contour mode add contourPoints. For indexed mode ensure indexAnglesDeg is a non-empty array. If mesh raster found no hits, verify STL WCS vs stock or use Parallel mode.'
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
      hint: `4-axis toolpath (${axis4Strategy}${rawWrap === 'raster' && axis4Lines.some((l) => l.includes('MESH raster')) ? ', mesh raster' : ''}) posted. ${UNVERIFIED} Run an air cut with spindle OFF before any real cut. Confirm cylinder diameter and A WCS home (docs/MACHINES.md).${postedGcodeEnvelopeHint(job.machine, gcode, job.rotaryStockDiameterMm ?? cylD)}${rotaryTravelHintForPostedGcode(job.operationKind, gcode)}${guardHint}${alignHint}${contourClosureHint}${radialExtentHint}`
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
      hint:
        [base2dHint, ...pocketResultHints, ...drillResultHints].filter(Boolean).join(' ') +
        postedGcodeEnvelopeHint(job.machine, gcode) +
        guardHint
    }
  }

  dbg('stl:read_start')
  const stlLoad = await readStlBufferForCam(job.stlPath)
  dbg('stl:read_done')
  if (!stlLoad.ok) return stlLoad
  const meshBuf = stlLoad.buf
  const boundsEarly = parseBinaryStl(meshBuf)
  const pAutoDoc = job.operationParams as Record<string, unknown> | undefined
  if (pAutoDoc?.['autoDocFromSetupMesh'] === true && job.stockBoxZMm != null && job.stockBoxZMm > 0) {
    const sug = suggestedZPassMmFromStockAndMeshMinZ(job.stockBoxZMm, boundsEarly.min[2])
    if (sug != null) {
      const grDoc = applyCamToolpathGuardrails({ ...job, zPassMm: sug })
      job = grDoc.job
    }
  }

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
          ...job,
          stepoverMm: resolve3dFinishStepoverMm({
            toolDiameterMm: job.toolDiameterMm ?? 6,
            baseStepoverMm: job.stepoverMm,
            operationParams: job.operationParams
          }).stepoverMm
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
        hint: `OpenCAMLib ${stratLabel} toolpath posted for your machine profile. ${UNVERIFIED}${postedGcodeEnvelopeHint(job.machine, gcode)}${guardHint}`
      }
    }
    const fallbackReason = resolveOclFallbackReason(ocl.stdout) ?? 'unknown_ocl_failure'
    const hint = builtinOclFailureHint(ocl.stdout, job.operationKind)
    const bounds = boundsEarly

    if (oclStrategy === 'raster') {
      dbg('fallback:mesh_raster_start')
      const mesh = collectBinaryStlTriangles(meshBuf)
      const sampleStepMm = Math.max(0.2, Math.min(camJob.stepoverMm, 2))
      const rest = effectiveRasterRestStockMm(job, bounds.min[2])
      const priorFloor = priorRoughFloorSamplerForMeshRaster(job, bounds)
      const analyticRough = meshAnalyticPriorRoughStockMmFromParams(job.operationParams as Record<string, unknown>)
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
        safeZMm: job.safeZMm,
        ...(rest != null ? { rasterRestStockMm: rest } : {}),
        ...(priorFloor ? { priorRoughFloorSampler: priorFloor } : {}),
        ...(analyticRough != null ? { meshAnalyticPriorRoughStockMm: analyticRough } : {})
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
      if (priorFloor) {
        extras.push(
          'Prior posted G-code rest floor (MVP): feed moves from priorPostedGcode used to skip mesh points already machined past the surface (+ raster rest). Same WCS required.'
        )
      }
      if (analyticRough != null && !priorFloor) {
        extras.push(
          `Analytic rough stock (meshAnalyticPriorRoughStockMm=${analyticRough} mm) simulates a prior rest floor on mesh raster fallback when no usePriorPostedGcodeRest sampler — 2.5D heuristic only.`
        )
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
        hint: [hint, tail.trim(), UNVERIFIED].filter(Boolean).join(' ') + postedGcodeEnvelopeHint(job.machine, gcode) + guardHint
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
      hint: [hint, UNVERIFIED].filter(Boolean).join(' ') + postedGcodeEnvelopeHint(job.machine, gcode) + guardHint
    }
  }

  dbg('builtin_parallel:start')
  const bounds = boundsEarly
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
    hint: `Built-in parallel finish from STL bounding box (no OpenCAMLib). ${UNVERIFIED}${postedGcodeEnvelopeHint(job.machine, gcode)}${guardHint}`
  }
}
