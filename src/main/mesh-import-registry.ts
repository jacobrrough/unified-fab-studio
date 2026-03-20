import { randomUUID } from 'node:crypto'
import { basename, extname, join, relative } from 'node:path'
import { MESH_IMPORT_FILE_EXTENSIONS, MESH_PYTHON_EXTENSIONS } from '../shared/mesh-import-formats'
import type { ImportHistoryEntry } from '../shared/project-schema'
import { importStepToProjectStl, importStlToProjectAssets, runPythonJson } from './cad/occt-import'
import { getEnginesRoot } from './paths'
import { resolveUniqueFilenameInDir } from './unique-asset-filename'

export type MeshImportRoute = 'stl' | 'step' | 'mesh_python'

export function meshImportRouteFromPath(filePath: string): MeshImportRoute | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.stl') return 'stl'
  if (ext === '.step' || ext === '.stp') return 'step'
  const short = ext.replace(/^\./, '')
  if (MESH_PYTHON_EXTENSIONS.has(short)) return 'mesh_python'
  return null
}

export const MESH_IMPORT_DIALOG_EXTENSIONS = [...MESH_IMPORT_FILE_EXTENSIONS]

export type MeshImportOk = {
  ok: true
  stlPath: string
  /** POSIX-style path relative to project root */
  relativePath: string
  report: ImportHistoryEntry
}

export type MeshImportErr = { ok: false; error: string; detail?: string }

export type MeshImportResult = MeshImportOk | MeshImportErr

function posixRel(projectDir: string, absolutePath: string): string {
  return relative(projectDir, absolutePath).replace(/\\/g, '/')
}

function buildReport(params: {
  projectDir: string
  stlPath: string
  sourcePath: string
  sourceFormat: string
  roundTripLevel: ImportHistoryEntry['roundTripLevel']
  warnings?: string[]
}): ImportHistoryEntry {
  return {
    id: randomUUID(),
    importedAt: new Date().toISOString(),
    sourceFormat: params.sourceFormat,
    sourceFileName: basename(params.sourcePath),
    assetRelativePath: posixRel(params.projectDir, params.stlPath),
    roundTripLevel: params.roundTripLevel,
    ...(params.warnings?.length ? { warnings: params.warnings } : {})
  }
}

/**
 * Unified import: STL copy, STEP→STL (CadQuery), mesh formats→STL (trimesh).
 */
export async function importMeshViaRegistry(params: {
  projectDir: string
  sourcePath: string
  pythonPath: string
  appRoot: string
}): Promise<MeshImportResult> {
  const route = meshImportRouteFromPath(params.sourcePath)
  if (!route) {
    return { ok: false, error: 'unsupported_mesh_format', detail: extname(params.sourcePath) }
  }

  const assets = join(params.projectDir, 'assets')
  const ext = extname(params.sourcePath).toLowerCase().replace(/^\./, '')

  if (route === 'stl') {
    const r = await importStlToProjectAssets(params.sourcePath, assets)
    const report = buildReport({
      projectDir: params.projectDir,
      stlPath: r.stlPath,
      sourcePath: params.sourcePath,
      sourceFormat: ext,
      roundTripLevel: 'mesh_only'
    })
    return {
      ok: true,
      stlPath: r.stlPath,
      relativePath: posixRel(params.projectDir, r.stlPath),
      report
    }
  }

  if (route === 'step') {
    const r = await importStepToProjectStl({
      stepPath: params.sourcePath,
      projectAssetsDir: assets,
      pythonPath: params.pythonPath || 'python',
      appRoot: params.appRoot
    })
    if (!r.ok) {
      return { ok: false, error: r.error, detail: r.detail }
    }
    const report = buildReport({
      projectDir: params.projectDir,
      stlPath: r.stlPath,
      sourcePath: params.sourcePath,
      sourceFormat: ext,
      roundTripLevel: 'partial',
      warnings: ['STEP tessellated to STL; parametric history is not preserved in UFS.']
    })
    return {
      ok: true,
      stlPath: r.stlPath,
      relativePath: posixRel(params.projectDir, r.stlPath),
      report
    }
  }

  const base = basename(params.sourcePath).replace(/\.[^.]+$/, '') || 'import'
  const outStl = await resolveUniqueFilenameInDir(assets, `${base}.stl`)
  const script = join(getEnginesRoot(), 'mesh', 'mesh_to_stl.py')
  const { code, json } = await runPythonJson(params.pythonPath || 'python', [script, params.sourcePath, outStl], params.appRoot)
  if (code !== 0 || !json?.ok) {
    return {
      ok: false,
      error: (json?.error as string) ?? 'mesh_import_failed',
      detail: json?.detail as string | undefined
    }
  }
  const report = buildReport({
    projectDir: params.projectDir,
    stlPath: outStl,
    sourcePath: params.sourcePath,
    sourceFormat: ext,
    roundTripLevel: 'mesh_only',
    warnings: ['Converted via trimesh → STL; verify units and orientation before CAM.']
  })
  return {
    ok: true,
    stlPath: outStl,
    relativePath: posixRel(params.projectDir, outStl),
    report
  }
}
