import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { getAppVersion } from './app-runtime'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKernelPartFromProject } from './cad/build-kernel-part'
import { comparePlacementParityFromBounds } from './cad/kernel-placement-parity'
import { runDrawingExport, type DrawingExportPayload } from './drawing-export-service'
import { loadDrawingFile, saveDrawingFile } from './drawing-file-store'
import { importMeshViaRegistry } from './mesh-import-registry'
import { describeCamOperationKind } from './cam-operation-policy'
import { runCamPipeline } from './cam-runner'
import { loadAllMachines, getMachineById } from './machines'
import { getResourcesRoot } from './paths'
import { newProject, readProjectFile, writeProjectFile } from './project-store'
import { loadSettings, saveSettings } from './settings-store'
import { sliceWithCuraEngine, stageStlForProject } from './slicer'
import {
  inferToolRecordsFromFileBuffer,
  mergeToolLibraries,
  parseFusionToolExport,
  parseFusionToolsCsv,
  parseToolsCsv,
  parseToolsJson
} from './tools-import'
import { buildAssemblyInterferenceReport, safeProjectMeshPath } from './assembly-mesh-interference'
import { isLikelyAsciiStl, parseBinaryStl } from './stl'
import {
  assemblyFileSchema,
  buildAssemblyBomCsvLines,
  buildAssemblySummaryReport,
  buildBomHierarchyJsonText,
  buildHierarchicalBomText,
  emptyAssembly,
  parseAssemblyFile,
  type AssemblySummaryReport
} from '../shared/assembly-schema'
import {
  designFileSchemaV2,
  designParametersExportSchema,
  emptyDesign,
  mergeParametersIntoDesign,
  normalizeDesign,
  type DesignFileV2
} from '../shared/design-schema'
import { formatZodError, isENOENT, parseJsonText } from '../shared/file-parse-errors'
import { manufactureFileSchema, emptyManufacture } from '../shared/manufacture-schema'
import { defaultPartFeatures, partFeaturesFileSchema } from '../shared/part-features-schema'
import { parseDrawingFile } from '../shared/drawing-sheet-schema'
import { projectSchema } from '../shared/project-schema'
import { toolLibraryFileSchema, type ToolLibraryFile } from '../shared/tool-schema'
import { ZodError } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'Unified Fab Studio'
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    if (process.env.NODE_ENV !== 'production') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  createWindow()

  ipcMain.handle('machines:list', async () => loadAllMachines())

  ipcMain.handle('app:getVersion', async () => getAppVersion())

  ipcMain.handle('settings:get', async () => loadSettings())
  ipcMain.handle('settings:set', async (_e, partial: Record<string, unknown>) => {
    const cur = await loadSettings()
    const next = { ...cur, ...partial }
    await saveSettings(next)
    return next
  })

  ipcMain.handle('project:openDir', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('project:read', async (_e, dir: string) => readProjectFile(dir))

  ipcMain.handle('project:create', async (_e, payload: { dir: string; name: string; machineId: string }) => {
    const p = newProject(payload.name, payload.machineId)
    await writeProjectFile(payload.dir, p)
    return p
  })

  ipcMain.handle('project:save', async (_e, dir: string, project: unknown) => {
    const parsed = projectSchema.parse(project)
    await writeProjectFile(dir, parsed)
  })

  ipcMain.handle(
    'dialog:openFile',
    async (
      _e,
      filters: { name: string; extensions: string[] }[],
      defaultPath?: string
    ) => {
      const r = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: filters.length ? filters : [{ name: 'All', extensions: ['*'] }],
        ...(defaultPath != null && String(defaultPath).trim() !== ''
          ? { defaultPath: String(defaultPath).trim() }
          : {})
      })
      if (r.canceled || !r.filePaths[0]) return null
      return r.filePaths[0]
    }
  )

  ipcMain.handle('dialog:openFiles', async (_e, filters: { name: string; extensions: string[] }[]) => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: filters.length ? filters : [{ name: 'All', extensions: ['*'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return []
    return r.filePaths
  })

  ipcMain.handle('drawing:export', async (_e, payload: DrawingExportPayload) => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false as const, error: 'No window' }
    return runDrawingExport(win, payload)
  })

  ipcMain.handle('drawing:load', async (_e, projectDir: string) => loadDrawingFile(projectDir))

  ipcMain.handle('drawing:save', async (_e, projectDir: string, json: string) => {
    let data: unknown
    try {
      data = JSON.parse(json) as unknown
    } catch {
      throw new Error('drawing_save_invalid_json')
    }
    const file = parseDrawingFile(data)
    await saveDrawingFile(projectDir, file)
  })

  ipcMain.handle('stl:stage', async (_e, projectDir: string, stlPath: string) => stageStlForProject(projectDir, stlPath))

  ipcMain.handle(
    'slice:cura',
    async (
      _e,
      payload: {
        stlPath: string
        outPath: string
        curaEnginePath: string
        definitionsPath?: string
        definitionPath?: string
        slicePreset?: string | null
      }
    ) => {
      return sliceWithCuraEngine({
        curaEnginePath: payload.curaEnginePath,
        inputStlPath: payload.stlPath,
        outputGcodePath: payload.outPath,
        definitionPath: payload.definitionPath,
        curaDefinitionsPath: payload.definitionsPath,
        slicePreset: payload.slicePreset
      })
    }
  )

  ipcMain.handle(
    'cam:run',
    async (
      _e,
      payload: {
        stlPath: string
        outPath: string
        machineId: string
        zPassMm: number
        stepoverMm: number
        feedMmMin: number
        plungeMmMin: number
        safeZMm: number
        pythonPath: string
        /** manufacture.json operation kind — optional for backward compatibility */
        operationKind?: string
        /** manufacture setup work offset 1–6 → G54–G59 in post; optional */
        workCoordinateIndex?: number
        /** OCL cutter diameter (mm); optional, default applied in main */
        toolDiameterMm?: number
        /** Optional operation params forwarded from manufacture op. */
        operationParams?: Record<string, unknown>
      }
    ) => {
      try {
        const policy = describeCamOperationKind(payload.operationKind)
        if (!policy.runnable) {
          return {
            ok: false as const,
            error: policy.error ?? 'cam_not_supported',
            ...(policy.hint ? { hint: policy.hint } : {})
          }
        }
        const machine = await getMachineById(payload.machineId)
        if (!machine || machine.kind !== 'cnc') {
          return {
            ok: false as const,
            error: 'No CNC machine profile matches the selected machine ID.',
            hint: 'Choose a CNC machine in Manufacture setup (or project active machine). Make → Generate CAM requires a `kind: cnc` profile from resources/machines.'
          }
        }
        const resourcesRoot = getResourcesRoot()
        const appRoot = app.getAppPath()
        const result = await runCamPipeline({
          stlPath: payload.stlPath,
          outputGcodePath: payload.outPath,
          machine,
          resourcesRoot,
          appRoot,
          zPassMm: payload.zPassMm,
          stepoverMm: payload.stepoverMm,
          feedMmMin: payload.feedMmMin,
          plungeMmMin: payload.plungeMmMin,
          safeZMm: payload.safeZMm,
          pythonPath: payload.pythonPath,
          operationKind: payload.operationKind,
          workCoordinateIndex: payload.workCoordinateIndex,
          toolDiameterMm: payload.toolDiameterMm,
          operationParams: payload.operationParams
        })
        if (result.ok && policy.hint) {
          return { ...result, hint: [result.hint, policy.hint].filter(Boolean).join(' ') }
        }
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
          ok: false as const,
          error: msg,
          hint: 'Unexpected CAM failure — check staged STL path, output folder permissions, and machine post resources. If it persists, capture the message for a bug report.'
        }
      }
    }
  )

  ipcMain.handle('cad:importStl', async (_e, projectDir: string, stlPath: string) => {
    const r = await importMeshViaRegistry({
      projectDir,
      sourcePath: stlPath,
      pythonPath: 'python',
      appRoot: app.getAppPath()
    })
    if (!r.ok) return { ok: false as const, error: r.error, detail: r.detail }
    return { ok: true as const, stlPath: r.stlPath }
  })

  ipcMain.handle('cad:importStep', async (_e, projectDir: string, stepPath: string, pythonPath: string) => {
    const r = await importMeshViaRegistry({
      projectDir,
      sourcePath: stepPath,
      pythonPath: pythonPath || 'python',
      appRoot: app.getAppPath()
    })
    if (!r.ok) return { ok: false as const, error: r.error, detail: r.detail }
    return { ok: true as const, stlPath: r.stlPath }
  })

  ipcMain.handle(
    'assets:importMesh',
    async (_e, projectDir: string, sourcePath: string, pythonPath: string) => {
      return importMeshViaRegistry({
        projectDir,
        sourcePath,
        pythonPath: pythonPath || 'python',
        appRoot: app.getAppPath()
      })
    }
  )

  ipcMain.handle('cad:kernelBuild', async (_e, projectDir: string, pythonPath: string) => {
    return buildKernelPartFromProject({
      projectDir,
      pythonPath: pythonPath || 'python',
      appRoot: app.getAppPath()
    })
  })

  ipcMain.handle(
    'cad:comparePreviewKernel',
    async (_e, projectDir: string, kernelStlPath: string, previewStlBase64: string) => {
      try {
        const kernelBuf = await readFile(kernelStlPath)
        if (isLikelyAsciiStl(kernelBuf)) return { ok: false as const, error: 'kernel_ascii_stl_not_supported' }
        const previewBuf = Buffer.from(previewStlBase64, 'base64')
        if (isLikelyAsciiStl(previewBuf)) return { ok: false as const, error: 'preview_ascii_stl_not_supported' }
        const kernelBounds = parseBinaryStl(kernelBuf)
        const previewBounds = parseBinaryStl(previewBuf)
        const parity = comparePlacementParityFromBounds(previewBounds, kernelBounds)

        const manifestPath = join(projectDir, 'part', 'kernel-manifest.json')
        try {
          const raw = await readFile(manifestPath, 'utf-8')
          const current = JSON.parse(raw) as Record<string, unknown>
          const next = {
            ...current,
            placementParity: parity.parity,
            placementParityDetail: parity.detail,
            placementParityMaxDeltaMm: parity.maxDeltaMm
          }
          await writeFile(manifestPath, JSON.stringify(next, null, 2), 'utf-8')
        } catch {
          // Keep response useful even if manifest update fails.
        }
        return { ok: true as const, ...parity }
      } catch (e) {
        return {
          ok: false as const,
          error: 'placement_parity_failed',
          detail: e instanceof Error ? e.message : String(e)
        }
      }
    }
  )

  ipcMain.handle('tools:read', async (_e, projectDir: string) => {
    const p = join(projectDir, 'tools.json')
    try {
      const raw = await readFile(p, 'utf-8')
      return toolLibraryFileSchema.parse(JSON.parse(raw) as unknown)
    } catch {
      const empty: ToolLibraryFile = { version: 1, tools: [] }
      return empty
    }
  })

  ipcMain.handle('tools:save', async (_e, projectDir: string, lib: ToolLibraryFile) => {
    const p = join(projectDir, 'tools.json')
    await writeFile(p, JSON.stringify(lib, null, 2), 'utf-8')
  })

  ipcMain.handle(
    'tools:import',
    async (
      _e,
      projectDir: string,
      payload: { kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'; content: string }
    ) => {
      const p = join(projectDir, 'tools.json')
      let cur: ToolLibraryFile
      try {
        cur = toolLibraryFileSchema.parse(JSON.parse(await readFile(p, 'utf-8')))
      } catch {
        cur = { version: 1, tools: [] }
      }
      let extra = []
      if (payload.kind === 'csv') extra = parseToolsCsv(payload.content)
      else if (payload.kind === 'json') {
        const parsed = parseToolsJson(payload.content)
        return mergeToolLibraries(cur, parsed.tools)
      } else if (payload.kind === 'fusion_csv') {
        extra = parseFusionToolsCsv(payload.content)
      } else extra = parseFusionToolExport(payload.content)
      return mergeToolLibraries(cur, extra)
    }
  )

  ipcMain.handle('tools:importFile', async (_e, projectDir: string, filePath: string) => {
    const p = join(projectDir, 'tools.json')
    let cur: ToolLibraryFile
    try {
      cur = toolLibraryFileSchema.parse(JSON.parse(await readFile(p, 'utf-8')))
    } catch {
      cur = { version: 1, tools: [] }
    }
    const buf = await readFile(filePath)
    const extra = inferToolRecordsFromFileBuffer(basename(filePath), buf)
    return mergeToolLibraries(cur, extra)
  })

  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    await shell.openPath(p)
  })

  ipcMain.handle('file:readText', async (_e, p: string) => readFile(p, 'utf-8'))

  ipcMain.handle('design:load', async (_e, projectDir: string) => {
    const p = join(projectDir, 'design', 'sketch.json')
    try {
      const raw = await readFile(p, 'utf-8')
      const data = parseJsonText(raw, 'design/sketch.json')
      return normalizeDesign(data)
    } catch (e) {
      if (isENOENT(e)) return null
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'design/sketch.json'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('design:save', async (_e, projectDir: string, json: string) => {
    const p = join(projectDir, 'design', 'sketch.json')
    await mkdir(dirname(p), { recursive: true })
    try {
      const data = parseJsonText(json, 'design/sketch.json (save)')
      const parsed = designFileSchemaV2.parse(data)
      await writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch (e) {
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'design/sketch.json (save)'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('design:exportParameters', async (_e, projectDir: string) => {
    const p = join(projectDir, 'design', 'sketch.json')
    let design = normalizeDesign(emptyDesign())
    try {
      const raw = await readFile(p, 'utf-8')
      design = normalizeDesign(parseJsonText(raw, 'design/sketch.json'))
    } catch (e) {
      if (!isENOENT(e)) throw e instanceof Error ? e : new Error(String(e))
    }
    const out = join(projectDir, 'output', 'design-parameters.json')
    await mkdir(dirname(out), { recursive: true })
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'design/sketch.json',
      parameters: design.parameters
    }
    await writeFile(out, JSON.stringify(payload, null, 2), 'utf-8')
    return { path: out, keyCount: Object.keys(design.parameters).length }
  })

  ipcMain.handle('design:mergeParameters', async (_e, projectDir: string, json: string) => {
    const p = join(projectDir, 'design', 'sketch.json')
    let data: unknown
    try {
      data = parseJsonText(json, 'design-parameters-merge.json')
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'parameters_import_invalid_json')
    }
    const parsed = designParametersExportSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(formatZodError(parsed.error, 'design-parameters-merge.json'))
    }
    let design: DesignFileV2
    try {
      const raw = await readFile(p, 'utf-8')
      design = normalizeDesign(parseJsonText(raw, 'design/sketch.json'))
    } catch (e) {
      if (isENOENT(e)) {
        throw new Error('design_sketch_missing: save a design before merging parameters')
      }
      throw e instanceof Error ? e : new Error(String(e))
    }
    const incoming = parsed.data.parameters
    const merged = mergeParametersIntoDesign(design, incoming)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, JSON.stringify(merged, null, 2), 'utf-8')
    return { mergedKeyCount: Object.keys(incoming).length }
  })

  ipcMain.handle('assembly:load', async (_e, projectDir: string) => {
    const p = join(projectDir, 'assembly.json')
    try {
      const raw = await readFile(p, 'utf-8')
      const data = parseJsonText(raw, 'assembly.json')
      return parseAssemblyFile(data)
    } catch (e) {
      if (isENOENT(e)) return emptyAssembly()
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'assembly.json'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('assembly:save', async (_e, projectDir: string, json: string) => {
    const p = join(projectDir, 'assembly.json')
    try {
      const data = parseJsonText(json, 'assembly.json (save)')
      const parsed = assemblyFileSchema.parse(data)
      await writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch (e) {
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'assembly.json (save)'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('assembly:exportBom', async (_e, projectDir: string) => {
    const p = join(projectDir, 'assembly.json')
    let asm = emptyAssembly()
    try {
      asm = parseAssemblyFile(JSON.parse(await readFile(p, 'utf-8')))
    } catch {
      /* default */
    }
    const out = join(projectDir, 'output', 'bom.csv')
    await mkdir(dirname(out), { recursive: true })
    const lines = buildAssemblyBomCsvLines(asm)
    await writeFile(out, lines.join('\n'), 'utf-8')
    return out
  })

  ipcMain.handle('assembly:exportBomHierarchical', async (_e, projectDir: string) => {
    const p = join(projectDir, 'assembly.json')
    let asm = emptyAssembly()
    try {
      asm = parseAssemblyFile(JSON.parse(await readFile(p, 'utf-8')))
    } catch {
      /* default */
    }
    const out = join(projectDir, 'output', 'bom-hierarchical.txt')
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, buildHierarchicalBomText(asm), 'utf-8')
    return out
  })

  ipcMain.handle('assembly:exportBomHierarchyJson', async (_e, projectDir: string) => {
    const p = join(projectDir, 'assembly.json')
    let asm = emptyAssembly()
    try {
      asm = parseAssemblyFile(JSON.parse(await readFile(p, 'utf-8')))
    } catch {
      /* default */
    }
    const out = join(projectDir, 'output', 'bom-hierarchy.json')
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, buildBomHierarchyJsonText(asm), 'utf-8')
    return out
  })

  ipcMain.handle('assembly:saveInterferenceReport', async (_e, projectDir: string, json: string) => {
    let data: unknown
    try {
      data = JSON.parse(json)
    } catch {
      throw new Error('interference_report_invalid_json')
    }
    if (data === null || typeof data !== 'object') {
      throw new Error('interference_report_not_object')
    }
    let asm = emptyAssembly()
    try {
      asm = parseAssemblyFile(JSON.parse(await readFile(join(projectDir, 'assembly.json'), 'utf-8')))
    } catch {
      /* default */
    }
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    const out = join(projectDir, 'output', `${name}-interference.json`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, JSON.stringify(data, null, 2), 'utf-8')
    return out
  })

  ipcMain.handle('assembly:interferenceCheck', async (_e, projectDir: string) => {
    let asm = emptyAssembly()
    try {
      const raw = await readFile(join(projectDir, 'assembly.json'), 'utf-8')
      asm = parseAssemblyFile(JSON.parse(raw) as unknown)
    } catch {
      /* default */
    }
    return buildAssemblyInterferenceReport(projectDir, asm)
  })

  ipcMain.handle('assembly:summary', async (_e, projectDir: string): Promise<AssemblySummaryReport> => {
    let asm = emptyAssembly()
    try {
      const raw = await readFile(join(projectDir, 'assembly.json'), 'utf-8')
      asm = parseAssemblyFile(JSON.parse(raw) as unknown)
    } catch {
      /* default */
    }
    return buildAssemblySummaryReport(asm)
  })

  ipcMain.handle(
    'assembly:readStlBase64',
    async (_e, projectDir: string, meshPath: string): Promise<{ ok: true; base64: string } | { ok: false; error: string }> => {
      const abs = safeProjectMeshPath(projectDir, meshPath)
      if (!abs) return { ok: false, error: 'invalid_or_unsafe_mesh_path' }
      try {
        const buf = await readFile(abs)
        if (isLikelyAsciiStl(buf)) return { ok: false, error: 'ascii_stl_not_supported_in_viewport' }
        return { ok: true, base64: buf.toString('base64') }
      } catch {
        return { ok: false, error: 'read_failed' }
      }
    }
  )

  ipcMain.handle('features:load', async (_e, projectDir: string) => {
    const p = join(projectDir, 'part', 'features.json')
    try {
      const raw = await readFile(p, 'utf-8')
      const data = parseJsonText(raw, 'part/features.json')
      return partFeaturesFileSchema.parse(data)
    } catch (e) {
      if (isENOENT(e)) return defaultPartFeatures()
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'part/features.json'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('features:save', async (_e, projectDir: string, json: string) => {
    const p = join(projectDir, 'part', 'features.json')
    await mkdir(dirname(p), { recursive: true })
    try {
      const data = parseJsonText(json, 'part/features.json (save)')
      const parsed = partFeaturesFileSchema.parse(data)
      await writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch (e) {
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'part/features.json (save)'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('manufacture:load', async (_e, projectDir: string) => {
    const p = join(projectDir, 'manufacture.json')
    try {
      const raw = await readFile(p, 'utf-8')
      const data = parseJsonText(raw, 'manufacture.json')
      return manufactureFileSchema.parse(data)
    } catch (e) {
      if (isENOENT(e)) return emptyManufacture()
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'manufacture.json'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle('manufacture:save', async (_e, projectDir: string, json: string) => {
    const p = join(projectDir, 'manufacture.json')
    try {
      const data = parseJsonText(json, 'manufacture.json (save)')
      const parsed = manufactureFileSchema.parse(data)
      await writeFile(p, JSON.stringify(parsed, null, 2), 'utf-8')
    } catch (e) {
      if (e instanceof ZodError) throw new Error(formatZodError(e, 'manufacture.json (save)'))
      throw e instanceof Error ? e : new Error(String(e))
    }
  })

  ipcMain.handle(
    'model:exportStl',
    async (_e, payload: { projectDir: string; filename: string; base64: string }) => {
      const name = basename(payload.filename.replace(/\\/g, '/'))
      if (!name.toLowerCase().endsWith('.stl')) {
        return { ok: false as const, error: 'invalid_filename' }
      }
      if (name.includes('..') || /[<>:"|?*]/.test(name)) {
        return { ok: false as const, error: 'invalid_filename' }
      }
      const dest = join(payload.projectDir, 'assets', name)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, Buffer.from(payload.base64, 'base64'))
      return { ok: true as const, path: dest }
    }
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
