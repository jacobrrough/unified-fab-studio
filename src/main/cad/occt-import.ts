import { spawnBounded } from '../subprocess-bounded'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getEnginesRoot } from '../paths'
import { resolveUniqueFilenameInDir } from '../unique-asset-filename'

export type StepImportResult =
  | { ok: true; stlPath: string }
  | { ok: false; error: string; detail?: string }

/**
 * Convert STEP to STL via optional CadQuery script, then return path for CAM/slicer pipelines.
 */
export async function importStepToProjectStl(params: {
  stepPath: string
  projectAssetsDir: string
  pythonPath: string
  appRoot: string
}): Promise<StepImportResult> {
  await mkdir(params.projectAssetsDir, { recursive: true })
  const base = params.stepPath.split(/[/\\]/).pop()?.replace(/\.step$/i, '') ?? 'import'
  const outStl = await resolveUniqueFilenameInDir(params.projectAssetsDir, `${base}.stl`)
  const script = join(getEnginesRoot(), 'occt', 'step_to_stl.py')

  const { code, json } = await runPythonJson(params.pythonPath, [script, params.stepPath, outStl], params.appRoot)
  if (code !== 0 || !json?.ok) {
    return {
      ok: false,
      error: (json?.error as string) ?? 'step_import_failed',
      detail: json?.detail as string | undefined
    }
  }
  return { ok: true, stlPath: outStl }
}

/** STL is already mesh-ready — copy into project assets for a unified pipeline. */
export async function importStlToProjectAssets(stlPath: string, projectAssetsDir: string): Promise<{ ok: true; stlPath: string }> {
  await mkdir(projectAssetsDir, { recursive: true })
  const name = stlPath.split(/[/\\]/).pop() ?? 'model.stl'
  const dest = await resolveUniqueFilenameInDir(projectAssetsDir, name)
  await copyFile(stlPath, dest)
  return { ok: true, stlPath: dest }
}

const PYTHON_JSON_OUTPUT_MAX_BYTES = 8 * 1024 * 1024
/** Default wall-clock cap for CadQuery / mesh / kernel Python helpers (STEP can be slow). */
const PYTHON_JSON_DEFAULT_TIMEOUT_MS = 600_000

export async function runPythonJson(
  pythonPath: string,
  args: string[],
  cwd: string,
  opts?: { timeoutMs?: number | null; maxBufferBytes?: number }
): Promise<{ code: number | null; json?: Record<string, unknown> }> {
  const timeoutMs = opts?.timeoutMs !== undefined ? opts.timeoutMs : PYTHON_JSON_DEFAULT_TIMEOUT_MS
  try {
    const r = await spawnBounded(pythonPath, args, {
      cwd,
      timeoutMs: timeoutMs === null ? null : timeoutMs,
      maxBufferBytes: opts?.maxBufferBytes ?? PYTHON_JSON_OUTPUT_MAX_BYTES
    })
    const out = r.stdout + r.stderr
    let json: Record<string, unknown> | undefined
    try {
      const line = out.trim().split('\n').filter(Boolean).pop()
      if (line) json = JSON.parse(line) as Record<string, unknown>
    } catch {
      json = undefined
    }
    return { code: r.code, json }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      code: 1,
      json: { ok: false, error: 'python_run_failed', detail: msg }
    }
  }
}
