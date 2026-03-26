import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, ImportHistoryEntry, ProjectFile } from '../shared/project-schema'
import type { MachineProfile } from '../shared/machine-schema'
import type { CpsImportSummary } from '../main/machine-cps-import'
import type {
  AssemblyComponent,
  AssemblyFile,
  AssemblyInterferenceReport,
  AssemblySummaryReport
} from '../shared/assembly-schema'
import type { DesignFileV2 } from '../shared/design-schema'
import type { ManufactureFile } from '../shared/manufacture-schema'
import type { KernelManifest } from '../shared/kernel-manifest-schema'
import type { PartFeaturesFile } from '../shared/part-features-schema'
import type { ToolLibraryFile } from '../shared/tool-schema'
import type { DrawingFile } from '../shared/drawing-sheet-schema'
import type { MeshImportPlacement, MeshImportTransform, MeshImportUpAxis } from '../shared/mesh-import-placement'
import type { MaterialRecord } from '../shared/material-schema'

export type Api = {
  appGetVersion: () => Promise<string>
  machinesList: () => Promise<MachineProfile[]>
  machinesCatalog: () => Promise<{ machines: MachineProfile[]; diagnostics: Array<{ source: string; file: string; error: string }> }>
  machinesSaveUser: (profile: MachineProfile) => Promise<MachineProfile>
  machinesDeleteUser: (machineId: string) => Promise<boolean>
  machinesImportJson: (text: string) => Promise<MachineProfile>
  machinesImportFile: (filePath: string) => Promise<MachineProfile>
  machinesExportUser: (machineId: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
  machinesImportCpsFile: (filePath: string) => Promise<CpsImportSummary>
  machinesPickAndImportCps: () => Promise<CpsImportSummary | null>
  settingsGet: () => Promise<AppSettings>
  settingsSet: (partial: Partial<AppSettings>) => Promise<AppSettings>
  projectOpenDir: () => Promise<string | null>
  projectRead: (dir: string) => Promise<ProjectFile>
  projectCreate: (payload: { dir: string; name: string; machineId: string }) => Promise<ProjectFile>
  projectSave: (dir: string, project: ProjectFile) => Promise<void>
  dialogOpenFile: (
    filters: { name: string; extensions: string[] }[],
    defaultPath?: string
  ) => Promise<string | null>
  /** Multi-select file dialog; empty array if canceled. */
  dialogOpenFiles: (
    filters: { name: string; extensions: string[] }[],
    defaultPath?: string
  ) => Promise<string[]>
  drawingExport: (payload: {
    kind: 'pdf' | 'dxf'
    projectName?: string
    projectDir?: string
  }) => Promise<
    | { ok: true; path: string }
    | { ok: false; canceled?: boolean; error: string }
  >
  stlStage: (projectDir: string, stlPath: string) => Promise<string>
  stlTransformForCam: (payload: {
    stlPath: string
    transform: {
      position: { x: number; y: number; z: number }
      rotation: { x: number; y: number; z: number }
      scale: { x: number; y: number; z: number }
    }
  }) => Promise<string>
  sliceCura: (payload: {
    stlPath: string
    outPath: string
    curaEnginePath: string
    definitionsPath?: string
    definitionPath?: string
    slicePreset?: string | null
    /** Merged Cura `-s` map; when set, overrides preset-only args. */
    curaEngineSettings?: Record<string, string>
  }) => Promise<{ ok: boolean; stderr?: string; stdout?: string }>
  camRun: (payload: {
    stlPath: string
    outPath: string
    machineId: string
    zPassMm: number
    stepoverMm: number
    feedMmMin: number
    plungeMmMin: number
    safeZMm: number
    pythonPath: string
    operationKind?: string
    workCoordinateIndex?: number
    toolDiameterMm?: number
    operationParams?: Record<string, unknown>
  }) => Promise<
    | {
        ok: true
        gcode?: string
        usedEngine: 'ocl' | 'builtin'
        engine: {
          requestedEngine: 'ocl' | 'builtin'
          usedEngine: 'ocl' | 'builtin'
          fallbackApplied: boolean
          fallbackReason?:
            | 'invalid_numeric_params'
            | 'stl_missing'
            | 'config_error'
            | 'stl_read_error'
            | 'opencamlib_not_installed'
            | 'ocl_runtime_or_empty'
            | 'python_spawn_failed'
            | 'unknown_ocl_failure'
          fallbackDetail?: string
        }
        hint?: string
      }
    | { ok: false; error: string; hint?: string }
  >
  cadImportStl: (
    projectDir: string,
    stlPath: string
  ) => Promise<{ ok: true; stlPath: string } | { ok: false; error: string; detail?: string }>
  cadImportStep: (
    projectDir: string,
    stepPath: string,
    pythonPath: string
  ) => Promise<
    | { ok: true; stlPath: string }
    | { ok: false; error: string; detail?: string }
  >
  /** Unified mesh import (STL, STEP, trimesh formats) → project assets STL + `importHistory` report. */
  assetsImportMesh: (
    projectDir: string,
    sourcePath: string,
    pythonPath: string,
    placement?: { placement?: MeshImportPlacement; upAxis?: MeshImportUpAxis; transform?: MeshImportTransform }
  ) => Promise<
    | { ok: true; stlPath: string; relativePath: string; report: ImportHistoryEntry }
    | { ok: false; error: string; detail?: string }
  >
  /** Phase 1: CadQuery B-rep STEP + STL from design/sketch.json */
  kernelBuildPart: (
    projectDir: string,
    pythonPath: string
  ) => Promise<
    | { ok: true; stepPath: string; stlPath: string; manifest: KernelManifest }
    | { ok: false; error: string; detail?: string; manifest: KernelManifest }
  >
  comparePreviewKernelPlacement: (
    projectDir: string,
    kernelStlPath: string,
    previewStlBase64: string
  ) => Promise<
    | { ok: true; parity: 'ok' | 'mismatch'; detail: string; maxDeltaMm: number }
    | { ok: false; error: string; detail?: string }
  >
  toolsRead: (projectDir: string) => Promise<ToolLibraryFile>
  toolsSave: (projectDir: string, lib: ToolLibraryFile) => Promise<void>
  toolsImport: (
    projectDir: string,
    payload: { kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'; content: string }
  ) => Promise<ToolLibraryFile>
  /** Merge tools from a path (CSV, JSON, `.hsmlib` / gzipped XML, `.tpgz`, `.tp.xml`). */
  toolsImportFile: (projectDir: string, filePath: string) => Promise<ToolLibraryFile>
  /** Per-machine tool library in app userData (keyed by machine id). */
  machineToolsRead: (machineId: string) => Promise<ToolLibraryFile>
  machineToolsSave: (machineId: string, lib: ToolLibraryFile) => Promise<ToolLibraryFile>
  machineToolsImport: (
    machineId: string,
    payload: { kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'; content: string }
  ) => Promise<ToolLibraryFile>
  machineToolsImportFile: (machineId: string, filePath: string) => Promise<ToolLibraryFile>
  /** Merge project `tools.json` into the machine-scoped library (dedupes by name+diameter like other merges). */
  machineToolsMigrateFromProject: (machineId: string, projectDir: string) => Promise<ToolLibraryFile>
  shellOpenPath: (p: string) => Promise<void>
  readTextFile: (p: string) => Promise<string>
  meshPreviewStlBase64: (
    sourcePath: string,
    pythonPath: string
  ) => Promise<{ ok: true; base64: string } | { ok: false; error: string; detail?: string }>
  designLoad: (projectDir: string) => Promise<DesignFileV2 | null>
  /** Parsed `part/kernel-manifest.json` or null if missing/unreadable. */
  designReadKernelManifest: (projectDir: string) => Promise<KernelManifest | null>
  /** Binary `output/kernel-part.stl` as base64 for Design 3D inspect (kernel-accurate mesh). */
  designReadKernelStlBase64: (
    projectDir: string
  ) => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
  designSave: (projectDir: string, json: string) => Promise<void>
  designExportParameters: (projectDir: string) => Promise<{ path: string; keyCount: number }>
  designMergeParameters: (projectDir: string, json: string) => Promise<{ mergedKeyCount: number }>
  assemblyLoad: (projectDir: string) => Promise<AssemblyFile>
  assemblySave: (projectDir: string, json: string) => Promise<void>
  assemblyExportBom: (projectDir: string) => Promise<string>
  assemblyExportBomHierarchical: (projectDir: string) => Promise<string>
  assemblyExportBomHierarchyJson: (projectDir: string) => Promise<string>
  assemblySaveInterferenceReport: (projectDir: string, json: string) => Promise<string>
  assemblyInterferenceCheck: (projectDir: string) => Promise<AssemblyInterferenceReport>
  assemblyInterferenceCheckSimulated: (projectDir: string, asm: AssemblyFile) => Promise<AssemblyInterferenceReport>
  assemblySummary: (projectDir: string) => Promise<AssemblySummaryReport>
  assemblySolve: (asm: AssemblyFile) => Promise<{
    ok: true
    transforms: { id: string; transform: AssemblyComponent['transform'] }[]
    diagnostics: { violations: unknown[]; clampedDofs: string[]; residuals: number[] }
  }>
  assemblySimulate: (asm: AssemblyFile, sampleCount?: number) => Promise<{
    ok: true
    sampleCount: number
    poses: { sample: number; transforms: { id: string; transform: AssemblyComponent['transform'] }[] }[]
    diagnostics: { violations: unknown[]; clampedDofs: string[]; residuals: number[] }
  }>
  assemblyReadStlBase64: (
    projectDir: string,
    meshPath: string
  ) => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
  featuresLoad: (projectDir: string) => Promise<PartFeaturesFile>
  featuresSave: (projectDir: string, json: string) => Promise<void>
  manufactureLoad: (projectDir: string) => Promise<ManufactureFile>
  manufactureSave: (projectDir: string, json: string) => Promise<void>
  drawingLoad: (projectDir: string) => Promise<DrawingFile>
  drawingSave: (projectDir: string, json: string) => Promise<void>
  modelExportStl: (
    projectDir: string,
    filename: string,
    base64: string
  ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>

  // ── Post-processor management ─────────────────────────────────────────────

  postsList: () => Promise<
    Array<{ filename: string; path: string; source: 'bundled' | 'user'; preview: string }>
  >
  postsSave: (filename: string, content: string) => Promise<{
    filename: string; path: string; source: 'bundled' | 'user'; preview: string
  }>
  postsRead: (filename: string) => Promise<string>
  postsUploadFile: (filePath: string) => Promise<{
    filename: string; path: string; source: 'bundled' | 'user'; preview: string
  }>
  postsPickAndUpload: () => Promise<{
    filename: string; path: string; source: 'bundled' | 'user'; preview: string
  } | null>

  // ── Material library ──────────────────────────────────────────────────────

  materialsList: () => Promise<MaterialRecord[]>
  materialsSave: (record: MaterialRecord) => Promise<MaterialRecord>
  materialsDelete: (id: string) => Promise<boolean>
  materialsImportJson: (jsonText: string) => Promise<MaterialRecord[]>
  materialsImportFile: (filePath: string) => Promise<MaterialRecord[]>
  materialsPickAndImport: () => Promise<MaterialRecord[] | null>

  // ── File system helpers ────────────────────────────────────────────────────

  /**
   * Read any local file and return its contents as a base64-encoded string.
   * Use this in the renderer instead of fetch('file://...') which Chromium blocks.
   */
  fsReadBase64: (filePath: string) => Promise<string>
  /** Show a native save-file dialog; returns the chosen path or null if cancelled. */
  dialogSaveFile: (
    filters: { name: string; extensions: string[] }[],
    defaultPath?: string
  ) => Promise<string | null>
  /** Write UTF-8 text to a file path (obtained from dialogSaveFile or elsewhere). */
  fsWriteText: (filePath: string, content: string) => Promise<void>

  // ── Moonraker / Creality K2 Plus network push ──────────────────────────────

  /**
   * Upload a G-code file to a Moonraker (Klipper) printer over HTTP and
   * optionally start the print. Uses the Creality K2 Plus Moonraker REST API.
   *
   * @param payload.printerUrl  e.g. "http://192.168.1.50" or "http://k2plus.local"
   * @param payload.gcodePath   Absolute path to the generated .gcode file on disk
   * @param payload.startAfterUpload  If true, send POST /printer/print/start
   */
  moonrakerPush: (payload: {
    gcodePath: string
    printerUrl: string
    uploadPath?: string
    startAfterUpload?: boolean
    timeoutMs?: number
  }) => Promise<
    | { ok: true; filename: string; uploadedPath: string; printStarted: boolean; printerUrl: string }
    | { ok: false; error: string; detail?: string }
  >

  /** Poll current print state from a Moonraker printer. */
  moonrakerStatus: (
    printerUrl: string,
    timeoutMs?: number
  ) => Promise<
    | {
        ok: true
        state: 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error' | 'unknown'
        filename?: string
        progress?: number
        etaSeconds?: number
        rawState?: string
      }
    | { ok: false; error: string; detail?: string }
  >

  /** Cancel the current print job via Moonraker. */
  moonrakerCancel: (
    printerUrl: string,
    timeoutMs?: number
  ) => Promise<{ ok: boolean; error?: string }>
}

const api: Api = {
  appGetVersion: () => ipcRenderer.invoke('app:getVersion'),
  machinesList: () => ipcRenderer.invoke('machines:list'),
  machinesCatalog: () => ipcRenderer.invoke('machines:catalog'),
  machinesSaveUser: (profile) => ipcRenderer.invoke('machines:saveUser', profile),
  machinesDeleteUser: (machineId) => ipcRenderer.invoke('machines:deleteUser', machineId),
  machinesImportJson: (text) => ipcRenderer.invoke('machines:importJson', text),
  machinesImportFile: (filePath) => ipcRenderer.invoke('machines:importFile', filePath),
  machinesExportUser: (machineId) => ipcRenderer.invoke('machines:exportUser', machineId),
  machinesImportCpsFile: (filePath) => ipcRenderer.invoke('machines:importCpsFile', filePath),
  machinesPickAndImportCps: () => ipcRenderer.invoke('machines:pickAndImportCps'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (partial) => ipcRenderer.invoke('settings:set', partial),
  projectOpenDir: () => ipcRenderer.invoke('project:openDir'),
  projectRead: (dir) => ipcRenderer.invoke('project:read', dir),
  projectCreate: (payload) => ipcRenderer.invoke('project:create', payload),
  projectSave: (dir, project) => ipcRenderer.invoke('project:save', dir, project),
  dialogOpenFile: (filters, defaultPath) =>
    ipcRenderer.invoke('dialog:openFile', filters, defaultPath),
  dialogOpenFiles: (filters, defaultPath) => ipcRenderer.invoke('dialog:openFiles', filters, defaultPath),
  drawingExport: (payload) => ipcRenderer.invoke('drawing:export', payload),
  stlStage: (projectDir, stlPath) => ipcRenderer.invoke('stl:stage', projectDir, stlPath),
  stlTransformForCam: (payload) => ipcRenderer.invoke('stl:transformForCam', payload),
  sliceCura: (payload) => ipcRenderer.invoke('slice:cura', payload),
  camRun: (payload) => ipcRenderer.invoke('cam:run', payload),
  cadImportStl: (projectDir, stlPath) => ipcRenderer.invoke('cad:importStl', projectDir, stlPath),
  cadImportStep: (projectDir, stepPath, pythonPath) =>
    ipcRenderer.invoke('cad:importStep', projectDir, stepPath, pythonPath),
  assetsImportMesh: (projectDir, sourcePath, pythonPath, placement) =>
    ipcRenderer.invoke('assets:importMesh', projectDir, sourcePath, pythonPath, placement ?? {}),
  kernelBuildPart: (projectDir, pythonPath) => ipcRenderer.invoke('cad:kernelBuild', projectDir, pythonPath),
  comparePreviewKernelPlacement: (projectDir, kernelStlPath, previewStlBase64) =>
    ipcRenderer.invoke('cad:comparePreviewKernel', projectDir, kernelStlPath, previewStlBase64),
  toolsRead: (projectDir) => ipcRenderer.invoke('tools:read', projectDir),
  toolsSave: (projectDir, lib) => ipcRenderer.invoke('tools:save', projectDir, lib),
  toolsImport: (projectDir, payload) => ipcRenderer.invoke('tools:import', projectDir, payload),
  toolsImportFile: (projectDir, filePath) => ipcRenderer.invoke('tools:importFile', projectDir, filePath),
  machineToolsRead: (machineId) => ipcRenderer.invoke('machineTools:read', machineId),
  machineToolsSave: (machineId, lib) => ipcRenderer.invoke('machineTools:save', machineId, lib),
  machineToolsImport: (machineId, payload) => ipcRenderer.invoke('machineTools:import', machineId, payload),
  machineToolsImportFile: (machineId, filePath) =>
    ipcRenderer.invoke('machineTools:importFile', machineId, filePath),
  machineToolsMigrateFromProject: (machineId, projectDir) =>
    ipcRenderer.invoke('machineTools:migrateFromProject', machineId, projectDir),
  shellOpenPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  readTextFile: (p) => ipcRenderer.invoke('file:readText', p),
  meshPreviewStlBase64: (sourcePath, pythonPath) => ipcRenderer.invoke('mesh:previewStlBase64', sourcePath, pythonPath),
  designLoad: (projectDir) => ipcRenderer.invoke('design:load', projectDir),
  designReadKernelManifest: (projectDir) => ipcRenderer.invoke('design:readKernelManifest', projectDir),
  designReadKernelStlBase64: (projectDir) => ipcRenderer.invoke('design:readKernelStlBase64', projectDir),
  designSave: (projectDir, json) => ipcRenderer.invoke('design:save', projectDir, json),
  designExportParameters: (projectDir) => ipcRenderer.invoke('design:exportParameters', projectDir),
  designMergeParameters: (projectDir, json) => ipcRenderer.invoke('design:mergeParameters', projectDir, json),
  modelExportStl: (projectDir, filename, base64) =>
    ipcRenderer.invoke('model:exportStl', { projectDir, filename, base64 }),
  assemblyLoad: (projectDir) => ipcRenderer.invoke('assembly:load', projectDir),
  assemblySave: (projectDir, json) => ipcRenderer.invoke('assembly:save', projectDir, json),
  assemblyExportBom: (projectDir) => ipcRenderer.invoke('assembly:exportBom', projectDir),
  assemblyExportBomHierarchical: (projectDir) => ipcRenderer.invoke('assembly:exportBomHierarchical', projectDir),
  assemblyExportBomHierarchyJson: (projectDir) => ipcRenderer.invoke('assembly:exportBomHierarchyJson', projectDir),
  assemblySaveInterferenceReport: (projectDir, json) =>
    ipcRenderer.invoke('assembly:saveInterferenceReport', projectDir, json),
  assemblyInterferenceCheck: (projectDir) => ipcRenderer.invoke('assembly:interferenceCheck', projectDir),
  assemblyInterferenceCheckSimulated: (projectDir, asm) =>
    ipcRenderer.invoke('assembly:interferenceCheckSimulated', projectDir, asm),
  assemblySummary: (projectDir) => ipcRenderer.invoke('assembly:summary', projectDir),
  assemblySolve: (asm) => ipcRenderer.invoke('assembly:solve', asm),
  assemblySimulate: (asm, sampleCount) => ipcRenderer.invoke('assembly:simulate', asm, sampleCount),
  assemblyReadStlBase64: (projectDir, meshPath) =>
    ipcRenderer.invoke('assembly:readStlBase64', projectDir, meshPath),
  featuresLoad: (projectDir) => ipcRenderer.invoke('features:load', projectDir),
  featuresSave: (projectDir, json) => ipcRenderer.invoke('features:save', projectDir, json),
  manufactureLoad: (projectDir) => ipcRenderer.invoke('manufacture:load', projectDir),
  manufactureSave: (projectDir, json) => ipcRenderer.invoke('manufacture:save', projectDir, json),
  drawingLoad: (projectDir) => ipcRenderer.invoke('drawing:load', projectDir),
  drawingSave: (projectDir, json) => ipcRenderer.invoke('drawing:save', projectDir, json),

  // ── Post-processor management ──────────────────────────────────────────────
  postsList: () => ipcRenderer.invoke('posts:list'),
  postsSave: (filename, content) => ipcRenderer.invoke('posts:save', filename, content),
  postsRead: (filename) => ipcRenderer.invoke('posts:read', filename),
  postsUploadFile: (filePath) => ipcRenderer.invoke('posts:uploadFile', filePath),
  postsPickAndUpload: () => ipcRenderer.invoke('posts:pickAndUpload'),

  // ── Material library ──────────────────────────────────────────────────────
  materialsList: () => ipcRenderer.invoke('materials:list'),
  materialsSave: (record) => ipcRenderer.invoke('materials:save', record),
  materialsDelete: (id) => ipcRenderer.invoke('materials:delete', id),
  materialsImportJson: (jsonText) => ipcRenderer.invoke('materials:importJson', jsonText),
  materialsImportFile: (filePath) => ipcRenderer.invoke('materials:importFile', filePath),
  materialsPickAndImport: () => ipcRenderer.invoke('materials:pickAndImport'),

  // ── File system helpers ────────────────────────────────────────────────────
  fsReadBase64: (filePath) => ipcRenderer.invoke('fs:readBase64', filePath),
  dialogSaveFile: (filters, defaultPath) => ipcRenderer.invoke('dialog:saveFile', filters, defaultPath),
  fsWriteText: (filePath, content) => ipcRenderer.invoke('file:writeText', filePath, content),

  // ── Moonraker / Creality K2 Plus network push ──────────────────────────────
  moonrakerPush: (payload) => ipcRenderer.invoke('moonraker:push', payload),
  moonrakerStatus: (printerUrl, timeoutMs) => ipcRenderer.invoke('moonraker:status', printerUrl, timeoutMs),
  moonrakerCancel: (printerUrl, timeoutMs) => ipcRenderer.invoke('moonraker:cancel', printerUrl, timeoutMs)
}

contextBridge.exposeInMainWorld('fab', api)
