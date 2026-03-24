import { app, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { describeCamOperationKind } from './cam-operation-policy'
import { runCamPipeline } from './cam-runner'
import {
  deleteUserMachine,
  getMachineById,
  importMachineProfileFromFile,
  loadAllMachines,
  loadMachineCatalog,
  parseMachineProfileText,
  saveUserMachine
} from './machines'
import { loadMachineToolLibrary, saveMachineToolLibrary } from './machine-tool-library'
import { getResourcesRoot } from './paths'
import { sliceWithCuraEngine, stageStlForProject } from './slicer'
import {
  inferToolRecordsFromFileBuffer,
  mergeToolLibraries,
  parseFusionToolExport,
  parseFusionToolsCsv,
  parseToolsCsv,
  parseToolsJson
} from './tools-import'
import { formatZodError, isENOENT, parseJsonText } from '../shared/file-parse-errors'
import { emptyManufacture, manufactureFileSchema } from '../shared/manufacture-schema'
import { toolLibraryFileSchema, type ToolLibraryFile } from '../shared/tool-schema'
import { ZodError } from 'zod'
import type { MainIpcWindowContext } from './ipc-context'

export type { MainIpcWindowContext } from './ipc-context'

export function registerFabricationIpc(ctx: MainIpcWindowContext): void {
  ipcMain.handle('machines:list', async () => loadAllMachines())
  ipcMain.handle('machines:catalog', async () => loadMachineCatalog())
  ipcMain.handle('machines:saveUser', async (_e, profile: unknown) => saveUserMachine(profile as never))
  ipcMain.handle('machines:deleteUser', async (_e, machineId: string) => deleteUserMachine(machineId))
  ipcMain.handle('machines:importJson', async (_e, text: string) => {
    return saveUserMachine(parseMachineProfileText(text, 'pasted-profile'))
  })
  ipcMain.handle('machines:importFile', async (_e, filePath: string) => importMachineProfileFromFile(filePath))
  ipcMain.handle('machines:exportUser', async (_e, machineId: string) => {
    const win = ctx.getMainWindow()
    if (!win) return { ok: false as const, error: 'no_window' }
    const catalog = await loadMachineCatalog()
    const hit = catalog.machines.find((m) => m.id === machineId)
    if (!hit) return { ok: false as const, error: 'machine_not_found' }
    const r = await dialog.showSaveDialog(win, {
      title: 'Export machine profile',
      defaultPath: `${machineId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false as const, error: 'canceled' }
    await writeFile(r.filePath, JSON.stringify(hit, null, 2), 'utf-8')
    return { ok: true as const, path: r.filePath }
  })

  ipcMain.handle('stl:stage', async (_e, projectDir: string, stlPath: string) =>
    stageStlForProject(projectDir, stlPath)
  )

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
        curaEngineSettings?: Record<string, string>
      }
    ) => {
      return sliceWithCuraEngine({
        curaEnginePath: payload.curaEnginePath,
        inputStlPath: payload.stlPath,
        outputGcodePath: payload.outPath,
        definitionPath: payload.definitionPath,
        curaDefinitionsPath: payload.definitionsPath,
        slicePreset: payload.slicePreset,
        curaEngineSettings: payload.curaEngineSettings
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
        operationKind?: string
        workCoordinateIndex?: number
        toolDiameterMm?: number
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

  ipcMain.handle('machineTools:read', async (_e, machineId: string) => loadMachineToolLibrary(machineId))

  ipcMain.handle('machineTools:save', async (_e, machineId: string, lib: unknown) =>
    saveMachineToolLibrary(machineId, lib as ToolLibraryFile)
  )

  ipcMain.handle(
    'machineTools:import',
    async (
      _e,
      machineId: string,
      payload: { kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'; content: string }
    ) => {
      const cur = await loadMachineToolLibrary(machineId)
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

  ipcMain.handle('machineTools:importFile', async (_e, machineId: string, filePath: string) => {
    const cur = await loadMachineToolLibrary(machineId)
    const buf = await readFile(filePath)
    const extra = inferToolRecordsFromFileBuffer(basename(filePath), buf)
    return mergeToolLibraries(cur, extra)
  })

  ipcMain.handle('machineTools:migrateFromProject', async (_e, machineId: string, projectDir: string) => {
    const p = join(projectDir, 'tools.json')
    let projectLib: ToolLibraryFile
    try {
      projectLib = toolLibraryFileSchema.parse(JSON.parse(await readFile(p, 'utf-8')))
    } catch {
      projectLib = { version: 1, tools: [] }
    }
    const cur = await loadMachineToolLibrary(machineId)
    const merged = mergeToolLibraries(cur, projectLib.tools)
    return saveMachineToolLibrary(machineId, merged)
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
}
