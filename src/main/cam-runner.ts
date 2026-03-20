import { spawn } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MachineProfile } from '../shared/machine-schema'
import {
  generateContour2dLines,
  generateDrill2dLines,
  generateMeshHeightRasterLines,
  generateOrthoBoundsRasterLines,
  generatePocket2dLines,
  generateParallelFinishLines
} from './cam-local'
import { getEnginesRoot } from './paths'
import { renderPost } from './post-process'
import { collectBinaryStlTriangles, isLikelyAsciiStl, parseBinaryStl } from './stl'

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
  | { ok: true; gcode: string; usedEngine: 'ocl' | 'builtin'; hint?: string }
  | { ok: false; error: string; hint?: string }

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
  if (kind === 'cnc_adaptive') return 'adaptive_waterline'
  if (kind === 'cnc_raster') return 'raster'
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

async function runPythonScript(
  scriptRelative: string,
  cfgPath: string,
  pythonPath: string,
  appRoot: string
): Promise<{ code: number | null; stdout: string }> {
  const script = join(getEnginesRoot(), 'cam', scriptRelative)
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [script, cfgPath], {
      cwd: appRoot,
      shell: false
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code, stdout: stdout + stderr })
    })
  })
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
  const raster = operationKind === 'cnc_raster'
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
 * CAM pipeline: for `cnc_waterline` / `cnc_adaptive` / `cnc_raster`, try OpenCAMLib → toolpath lines → post.
 * Fallbacks: parallel finish (waterline/adaptive) or mesh / ortho raster (`cnc_raster`); other kinds use parallel finish.
 */
export async function runCamPipeline(job: CamJobConfig): Promise<CamRunResult> {
  await mkdir(dirname(job.outputGcodePath), { recursive: true })

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
      lines = generateContour2dLines({
        contourPoints: contour,
        zPassMm: job.zPassMm,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm,
        contourSide,
        leadInMm,
        leadOutMm
      })
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
    const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
      workCoordinateIndex: job.workCoordinateIndex
    })
    await writeFile(job.outputGcodePath, gcode, 'utf-8')
    const base2dHint =
      '2D path posted from operation geometry params (`contourPoints` / `drillPoints`). G-code is unverified until post/machine checks (docs/MACHINES.md).'
    return {
      ok: true,
      gcode,
      usedEngine: 'builtin',
      hint: [base2dHint, ...pocketResultHints, ...drillResultHints].filter(Boolean).join(' ')
    }
  }

  const stlLoad = await readStlBufferForCam(job.stlPath)
  if (!stlLoad.ok) return stlLoad
  const meshBuf = stlLoad.buf

  const oclStrategy = manufactureKindUsesOclStrategy(job.operationKind)
  if (oclStrategy) {
    const ocl = await tryOclToolpath(job, oclStrategy)
    if (ocl.ok && ocl.toolpathLines && ocl.toolpathLines.length > 0) {
      const gcode = await renderPost(job.resourcesRoot, job.machine, ocl.toolpathLines, {
        workCoordinateIndex: job.workCoordinateIndex
      })
      await writeFile(job.outputGcodePath, gcode, 'utf-8')
      const stratLabel =
        oclStrategy === 'adaptive_waterline'
          ? 'AdaptiveWaterline'
          : oclStrategy === 'raster'
            ? 'PathDropCutter raster'
            : 'waterline'
      return {
        ok: true,
        gcode,
        usedEngine: 'ocl',
        hint: `OpenCAMLib ${stratLabel} toolpath posted for your machine profile. ${UNVERIFIED}`
      }
    }
    const hint = builtinOclFailureHint(ocl.stdout, job.operationKind)
    const bounds = parseBinaryStl(meshBuf)

    if (oclStrategy === 'raster') {
      const mesh = collectBinaryStlTriangles(meshBuf)
      const sampleStepMm = Math.max(0.2, Math.min(job.stepoverMm, 2))
      let lines = generateMeshHeightRasterLines({
        triangles: mesh.triangles,
        minX: bounds.min[0],
        maxX: bounds.max[0],
        minY: bounds.min[1],
        maxY: bounds.max[1],
        stepoverMm: job.stepoverMm,
        sampleStepMm,
        feedMmMin: job.feedMmMin,
        plungeMmMin: job.plungeMmMin,
        safeZMm: job.safeZMm
      })
      const extras: string[] = []
      if (mesh.truncated) {
        extras.push(`STL sampled with first ${mesh.triangles.length} triangles only (cap).`)
      }
      if (!toolpathHasXYCutMoves(lines)) {
        lines = generateOrthoBoundsRasterLines({
          bounds,
          zPassMm: job.zPassMm,
          stepoverMm: job.stepoverMm,
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
      const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
        workCoordinateIndex: job.workCoordinateIndex
      })
      await writeFile(job.outputGcodePath, gcode, 'utf-8')
      const tail = extras.length ? ` ${extras.join(' ')}` : ''
      return {
        ok: true,
        gcode,
        usedEngine: 'builtin',
        hint: [hint, tail.trim(), UNVERIFIED].filter(Boolean).join(' ')
      }
    }

    const lines = generateParallelFinishLines({
      bounds,
      zPassMm: job.zPassMm,
      stepoverMm: job.stepoverMm,
      feedMmMin: job.feedMmMin,
      plungeMmMin: job.plungeMmMin,
      safeZMm: job.safeZMm
    })
    const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
      workCoordinateIndex: job.workCoordinateIndex
    })
    await writeFile(job.outputGcodePath, gcode, 'utf-8')
    return { ok: true, gcode, usedEngine: 'builtin', hint }
  }

  const bounds = parseBinaryStl(meshBuf)
  const lines = generateParallelFinishLines({
    bounds,
    zPassMm: job.zPassMm,
    stepoverMm: job.stepoverMm,
    feedMmMin: job.feedMmMin,
    plungeMmMin: job.plungeMmMin,
    safeZMm: job.safeZMm
  })
  const gcode = await renderPost(job.resourcesRoot, job.machine, lines, {
    workCoordinateIndex: job.workCoordinateIndex
  })
  await writeFile(job.outputGcodePath, gcode, 'utf-8')
  return {
    ok: true,
    gcode,
    usedEngine: 'builtin',
    hint: `Built-in parallel finish from STL bounding box (no OpenCAMLib). ${UNVERIFIED}`
  }
}
