import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, ImportHistoryEntry, ProjectFile } from '../shared/project-schema'
import type { MachineProfile } from '../shared/machine-schema'
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

export type Api = {
  appGetVersion: () => Promise<string>
  machinesList: () => Promise<MachineProfile[]>
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
    pythonPath: string
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
  shellOpenPath: (p: string) => Promise<void>
  readTextFile: (p: string) => Promise<string>
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
}

const api: Api = {
  appGetVersion: () => ipcRenderer.invoke('app:getVersion'),
  machinesList: () => ipcRenderer.invoke('machines:list'),
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
  sliceCura: (payload) => ipcRenderer.invoke('slice:cura', payload),
  camRun: (payload) => ipcRenderer.invoke('cam:run', payload),
  cadImportStl: (projectDir, stlPath) => ipcRenderer.invoke('cad:importStl', projectDir, stlPath),
  cadImportStep: (projectDir, stepPath, pythonPath) =>
    ipcRenderer.invoke('cad:importStep', projectDir, stepPath, pythonPath),
  assetsImportMesh: (projectDir, sourcePath, pythonPath) =>
    ipcRenderer.invoke('assets:importMesh', projectDir, sourcePath, pythonPath),
  kernelBuildPart: (projectDir, pythonPath) => ipcRenderer.invoke('cad:kernelBuild', projectDir, pythonPath),
  comparePreviewKernelPlacement: (projectDir, kernelStlPath, previewStlBase64) =>
    ipcRenderer.invoke('cad:comparePreviewKernel', projectDir, kernelStlPath, previewStlBase64),
  toolsRead: (projectDir) => ipcRenderer.invoke('tools:read', projectDir),
  toolsSave: (projectDir, lib) => ipcRenderer.invoke('tools:save', projectDir, lib),
  toolsImport: (projectDir, payload) => ipcRenderer.invoke('tools:import', projectDir, payload),
  toolsImportFile: (projectDir, filePath) => ipcRenderer.invoke('tools:importFile', projectDir, filePath),
  shellOpenPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  readTextFile: (p) => ipcRenderer.invoke('file:readText', p),
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
  drawingSave: (projectDir, json) => ipcRenderer.invoke('drawing:save', projectDir, json)
}

contextBridge.exposeInMainWorld('fab', api)
