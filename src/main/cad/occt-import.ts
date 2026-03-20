import { spawn } from 'node:child_process'
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

export async function runPythonJson(
  pythonPath: string,
  args: string[],
  cwd: string
): Promise<{ code: number | null; json?: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, { cwd, shell: false })
    let out = ''
    child.stdout?.on('data', (d) => {
      out += d.toString()
    })
    child.stderr?.on('data', (d) => {
      out += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      let json: Record<string, unknown> | undefined
      try {
        const line = out.trim().split('\n').filter(Boolean).pop()
        if (line) json = JSON.parse(line) as Record<string, unknown>
      } catch {
        json = undefined
      }
      resolve({ code, json })
    })
  })
}
