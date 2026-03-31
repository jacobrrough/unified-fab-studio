import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { emptyAssembly, type AssemblyFile } from '../../shared/assembly-schema'
import type { MachineProfile } from '../../shared/machine-schema'
import { emptyManufacture, type ManufactureFile } from '../../shared/manufacture-schema'
import { MESH_IMPORT_FILE_EXTENSIONS, MESH_PYTHON_EXTENSIONS } from '../../shared/mesh-import-formats'
import type { MeshImportPlacement, MeshImportTransform, MeshImportUpAxis } from '../../shared/mesh-import-placement'
import type { AppSettings, ImportHistoryEntry, ProjectFile } from '../../shared/project-schema'
import {
  emptyDrawingFile,
  type DrawingFile,
  type DrawingSheet,
  type DrawingViewPlaceholder
} from '../../shared/drawing-sheet-schema'
import { mergeMachineFirstProjectTools } from '../../shared/tool-merge'
import type { ToolLibraryFile } from '../../shared/tool-schema'
import { resolveCamCutParams, resolveManufactureSetupForCam } from '../../shared/cam-cut-params'
import { rotaryDimsFromSetupStock, setupStockThicknessZMm } from '../../shared/cam-setup-defaults'
import { mergeCuraSliceInvocationSettings } from '../../shared/cura-slice-defaults'
import { resolveCamToolDiameterMm } from '../../shared/cam-tool-resolve'
import { getManufactureCamRunBlock } from '../../shared/manufacture-cam-gate'
import { resolveManufactureCamDrivingOperation } from '../../shared/manufacture-cam-driving-op'
import { evaluateManufactureReadiness } from '../../shared/manufacture-readiness'
import { formatLoadRejection } from '../../shared/file-parse-errors'
import {
  getAppDisplayName,
  getAppProductFromBuild,
  getAppWindowTitle,
  getSplashLead,
  resolveWorkspaceForProduct,
  workspacesForProduct
} from '../../shared/app-product'
import { CommandPalette } from '../commands/CommandPalette'
import { ShortcutsReferenceDialog } from '../commands/ShortcutsReferenceDialog'
import { createCommandPickHandler, openShortcutsReference } from '../commands/command-dispatch'
import { useShellKeyboardShortcuts } from '../commands/useShellKeyboardShortcuts'
import { dispatchDesignCommand } from '../design/design-command-bridge'
import { ManufactureWorkspace } from '../fabrication'
import { AssemblyWorkspace, DesignSessionProvider, DesignWorkspace } from '../modeling'
import { AppShell, type UtilityTab } from '../shell/AppShell'
import {
  readPersistedComboViewTab,
  readPersistedManufacturePanelTab,
  readPersistedUiShell,
  readPersistedUtilityTab,
  readPersistedWorkspace,
  writePersistedComboViewTab,
  readPersistedManufactureLastRunMode,
  readPersistedManufactureLastSourceStl,
  writePersistedManufacturePanelTab,
  writePersistedManufactureLastRunMode,
  writePersistedManufactureLastSourceStl,
  writePersistedUiShell,
  writePersistedUtilityTab,
  writePersistedWorkspace,
  type UiShellLayout
} from '../shell/workspaceMemory'
import { AppMenuBar } from '../shell/AppMenuBar'
import { BrowserPanel } from '../shell/BrowserPanel'
import { ComboViewPanel, type ComboViewTab } from '../shell/ComboViewPanel'
import { TasksPanel } from '../shell/TasksPanel'
import { PropertiesPanel } from '../shell/PropertiesPanel'
import { TimelineBar } from '../shell/TimelineBar'
import type { ShellBrowserSelection } from '../shell/browser-selection'
import type { Workspace } from '../shell/WorkspaceBar'
import { joinPath } from '../lib/path-join'
import { UtilitiesWorkspacePanels } from '../utilities/UtilitiesWorkspacePanels'
import { SplashScreen } from '../shell/SplashScreen'
import { SplashSettingsModal } from '../shell/SplashSettingsModal'
import { ImportMeshPlacementModal } from '../shell/ImportMeshPlacementModal'

const SHOW_PROPS_KEY = 'ufs_show_properties'

type PendingMeshImport =
  | {
      kind: 'existing'
      files: string[]
      py: string
      /** Splash: import into this folder before `projectDir` React state is set */
      targetProjectDir?: string
      targetProject?: ProjectFile
    }
  | {
      kind: 'new_project'
      files: string[]
      py: string
      safeFolderName: string
      stamp: string
      projectsRoot: string | undefined
      machineId: string
      firstLabel: string
    }

function sanitizeProjectFolderName(stem: string): string {
  const s = stem.trim() || 'import'
  const cleaned = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 48) || 'import'
}

function camFallbackReasonLabel(reason: string | undefined): string {
  switch (reason) {
    case 'opencamlib_not_installed':
      return 'OpenCAMLib is not installed for the selected Python'
    case 'python_spawn_failed':
      return 'Python could not be started for OpenCAMLib'
    case 'stl_missing':
      return 'the staged STL path was missing for OpenCAMLib'
    case 'stl_read_error':
      return 'OpenCAMLib could not read the STL'
    case 'invalid_numeric_params':
      return 'CAM numeric parameters were invalid for OpenCAMLib'
    case 'config_error':
      return 'OpenCAMLib config wiring failed'
    case 'ocl_runtime_or_empty':
      return 'OpenCAMLib returned no usable toolpath'
    case 'unknown_ocl_failure':
      return 'OpenCAMLib failed for an unknown reason'
    default:
      return 'fallback reason not specified'
  }
}

export function App() {
  const appProduct = getAppProductFromBuild()
  const allowedWorkspaces = workspacesForProduct(appProduct) as Workspace[]
  const appDisplayName = getAppDisplayName(appProduct)

  const [workspace, setWorkspaceInternal] = useState<Workspace>(() => {
    const product = getAppProductFromBuild()
    const defaultFallback: Workspace =
      product === 'cam' ? 'manufacture' : product === 'cad' ? 'design' : 'utilities'
    return resolveWorkspaceForProduct(readPersistedWorkspace(defaultFallback), product) as Workspace
  })

  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceInternal(resolveWorkspaceForProduct(w, appProduct) as Workspace)
  }, [appProduct])
  const [utilityTab, setUtilityTab] = useState<UtilityTab>(() => readPersistedUtilityTab('project'))
  const [manufacturePanelTab, setManufacturePanelTab] = useState(() => readPersistedManufacturePanelTab('plan'))
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [showProperties, setShowProperties] = useState(() => {
    try {
      return localStorage.getItem(SHOW_PROPS_KEY) !== '0'
    } catch {
      return true
    }
  })
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shellSelection, setShellSelection] = useState<ShellBrowserSelection>(null)

  const [machines, setMachines] = useState<MachineProfile[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectFile | null>(null)
  const [projectTools, setProjectTools] = useState<ToolLibraryFile | null>(null)
  const [machineTools, setMachineTools] = useState<ToolLibraryFile | null>(null)
  const [status, setStatus] = useState<string>('')

  const [sideAsm, setSideAsm] = useState<AssemblyFile | null>(null)
  const [sideMfg, setSideMfg] = useState<ManufactureFile | null>(null)

  const [sliceOut, setSliceOut] = useState<string>('')
  const [camOut, setCamOut] = useState<string>('')
  /** Successful `cam:run` hint only; failures embed hint in `camOut`. */
  const [camLastHint, setCamLastHint] = useState<string>('')
  const [importText, setImportText] = useState<string>('')
  const [drawingExportBusy, setDrawingExportBusy] = useState(false)
  const [drawingFile, setDrawingFile] = useState<DrawingFile>(() => emptyDrawingFile())
  const [designDiskRevision, setDesignDiskRevision] = useState(0)
  const [splashSettingsOpen, setSplashSettingsOpen] = useState(false)
  const [splashAppVersion, setSplashAppVersion] = useState<string | null>(null)
  const [uiShell, setUiShell] = useState<UiShellLayout>(() => readPersistedUiShell('fusion'))
  const [comboViewTab, setComboViewTab] = useState<ComboViewTab>(() => readPersistedComboViewTab('model'))
  const [pendingMeshImport, setPendingMeshImport] = useState<PendingMeshImport | null>(null)

  const fab = window.fab

  const tools = useMemo(() => {
    if (!projectTools) return null
    const mid = project?.activeMachineId?.trim()
    if (!mid || !machineTools) return projectTools
    return mergeMachineFirstProjectTools(machineTools, projectTools)
  }, [projectTools, machineTools, project?.activeMachineId])

  const patchDrawingFirstSheet = useCallback(
    (partial: {
      name?: string
      scale?: string
      sheetTemplateHint?: string
      meshProjectionTier?: 'A' | 'B' | 'C'
      viewPlaceholders?: DrawingViewPlaceholder[]
    }) => {
      setDrawingFile((df) => {
        const cur = df.sheets[0]
        const name = partial.name !== undefined ? partial.name : (cur?.name ?? '')
        const scale = partial.scale !== undefined ? partial.scale : (cur?.scale ?? '')
        const vps =
          partial.viewPlaceholders !== undefined ? partial.viewPlaceholders : cur?.viewPlaceholders
        const trimmedName = name.trim()
        const trimmedScale = scale.trim()
        let templateHint: string | undefined
        if (partial.sheetTemplateHint !== undefined) {
          const th = partial.sheetTemplateHint.trim()
          templateHint = th || undefined
        } else {
          templateHint = cur?.sheetTemplateHint
        }
        const meshTier =
          partial.meshProjectionTier !== undefined
            ? partial.meshProjectionTier
            : cur?.meshProjectionTier
        if (!trimmedName) {
          if (!cur) return df
          return { version: 1, sheets: df.sheets.slice(1) }
        }
        const id = cur?.id ?? crypto.randomUUID()
        const sheet: DrawingSheet = {
          id,
          name: trimmedName,
          scale: trimmedScale || undefined,
          ...(templateHint ? { sheetTemplateHint: templateHint } : {}),
          ...(meshTier ? { meshProjectionTier: meshTier } : {})
        }
        if (vps != null && vps.length > 0) {
          sheet.viewPlaceholders = vps
        }
        return {
          version: 1,
          sheets: [sheet, ...df.sheets.slice(1)]
        }
      })
    },
    []
  )

  const exportDesignParameters = useCallback(async () => {
    if (!projectDir) return
    try {
      const r = await fab.designExportParameters(projectDir)
      setStatus(`Exported parameters (${r.keyCount} keys) → ${r.path}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir])

  const importDesignParameters = useCallback(async () => {
    if (!projectDir) return
    const path = await fab.dialogOpenFile([{ name: 'JSON', extensions: ['json'] }])
    if (!path) return
    try {
      const text = await fab.readTextFile(path)
      const r = await fab.designMergeParameters(projectDir, text)
      setDesignDiskRevision((x) => x + 1)
      setStatus(`Merged ${r.mergedKeyCount} parameter key(s) into design/sketch.json`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir])

  const reloadSidecars = useCallback(async () => {
    if (!projectDir) {
      setSideAsm(null)
      setSideMfg(null)
      return
    }
    const [ar, mr] = await Promise.allSettled([fab.assemblyLoad(projectDir), fab.manufactureLoad(projectDir)])
    const errs: string[] = []
    if (ar.status === 'fulfilled') setSideAsm(ar.value)
    else {
      setSideAsm(emptyAssembly())
      errs.push(formatLoadRejection('assembly.json', ar.reason))
    }
    if (mr.status === 'fulfilled') setSideMfg(mr.value)
    else {
      setSideMfg(emptyManufacture())
      errs.push(formatLoadRejection('manufacture.json', mr.reason))
    }
    if (errs.length) setStatus(errs.join(' · '))
  }, [fab, projectDir])

  const refresh = useCallback(async () => {
    const m = await fab.machinesList()
    setMachines(m)
    const s = await fab.settingsGet()
    setSettings(s)
  }, [fab])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (projectDir) return
    void window.fab.appGetVersion().then(setSplashAppVersion).catch(() => setSplashAppVersion(null))
  }, [projectDir])

  useEffect(() => {
    if (projectDir) setSplashSettingsOpen(false)
  }, [projectDir])

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_PROPS_KEY, showProperties ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [showProperties])

  const openShortcutsReferenceHandler = useCallback(() => {
    openShortcutsReference(setShortcutsDialogOpen, setStatus)
  }, [])

  useShellKeyboardShortcuts({
    commandPaletteOpen,
    onToggleCommandPalette: () => setCommandPaletteOpen((o) => !o),
    onOpenShortcutsReference: openShortcutsReferenceHandler
  })

  useEffect(() => {
    document.title = getAppWindowTitle(appProduct)
  }, [appProduct])

  useEffect(() => {
    writePersistedWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    writePersistedUtilityTab(utilityTab)
  }, [utilityTab])

  useEffect(() => {
    writePersistedManufacturePanelTab(manufacturePanelTab)
  }, [manufacturePanelTab])

  useEffect(() => {
    writePersistedUiShell(uiShell)
  }, [uiShell])

  useEffect(() => {
    writePersistedComboViewTab(comboViewTab)
  }, [comboViewTab])

  useEffect(() => {
    if (!projectDir) {
      setProjectTools(null)
      return
    }
    void fab.toolsRead(projectDir).then(setProjectTools)
  }, [fab, projectDir])

  useEffect(() => {
    const mid = project?.activeMachineId?.trim()
    if (!projectDir || !mid) {
      setMachineTools(null)
      return
    }
    void fab.machineToolsRead(mid).then(setMachineTools)
  }, [fab, projectDir, project?.activeMachineId])

  useEffect(() => {
    void reloadSidecars()
  }, [reloadSidecars])

  useEffect(() => {
    if (!projectDir) {
      setDrawingFile(emptyDrawingFile())
      return
    }
    void fab
      .drawingLoad(projectDir)
      .then(setDrawingFile)
      .catch((e) => {
        setDrawingFile(emptyDrawingFile())
        setStatus(e instanceof Error ? e.message : String(e))
      })
  }, [fab, projectDir])

  useEffect(() => {
    if (workspace !== 'assemble' && workspace !== 'manufacture') {
      setShellSelection(null)
    }
  }, [workspace])

  const recordProjectOpened = useCallback(
    async (dir: string) => {
      const cur = await fab.settingsGet()
      const norm = (s: string) => s.replace(/[/\\]+$/, '').toLowerCase()
      const nd = norm(dir)
      const list = [dir, ...(cur.recentProjectPaths ?? []).filter((p) => norm(p) !== nd)].slice(0, 24)
      const next = await fab.settingsSet({ recentProjectPaths: list, lastProjectPath: dir })
      setSettings(next)
    },
    [fab]
  )

  async function openProjectFolder(): Promise<void> {
    const dir = await fab.projectOpenDir()
    if (!dir) return
    try {
      const p = await fab.projectRead(dir)
      setProjectDir(dir)
      setProject(p)
      setStatus(`Opened project: ${p.name}`)
      await recordProjectOpened(dir)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function openRecentProject(path: string): Promise<void> {
    try {
      const p = await fab.projectRead(path)
      setProjectDir(path)
      setProject(p)
      setStatus(`Opened project: ${p.name}`)
      await recordProjectOpened(path)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeRecentProject(path: string): Promise<void> {
    const cur = await fab.settingsGet()
    const norm = (s: string) => s.replace(/[/\\]+$/, '').toLowerCase()
    const list = (cur.recentProjectPaths ?? []).filter((p) => norm(p) !== norm(path))
    const next = await fab.settingsSet({ recentProjectPaths: list })
    setSettings(next)
    setStatus('Removed from recent projects.')
  }

  async function chooseProjectsRoot(): Promise<void> {
    const dir = await fab.projectOpenDir()
    if (!dir) return
    const next = await fab.settingsSet({ projectsRoot: dir })
    setSettings(next)
    setStatus(`Projects will be created under: ${dir}`)
  }

  async function clearProjectsRoot(): Promise<void> {
    const next = await fab.settingsSet({ projectsRoot: undefined })
    setSettings(next)
    setStatus('Default projects folder cleared — New project will ask for a folder again.')
  }

  async function createProject(): Promise<void> {
    const machineId = machines[0]?.id ?? 'creality-k2-plus'
    const root = settings?.projectsRoot?.trim()
    let dir: string | null = null
    if (root) {
      const folderName = `New-job-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
      dir = joinPath(root, folderName)
    } else {
      dir = await fab.projectOpenDir()
    }
    if (!dir) return
    try {
      const p = await fab.projectCreate({ dir, name: 'New job', machineId })
      setProjectDir(dir)
      setProject(p)
      setWorkspace('design')
      setStatus(
        root
          ? `Created project in ${dir}`
          : 'Created new project. Pick a sketch plane to start drawing.'
      )
      await recordProjectOpened(dir)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => dispatchDesignCommand('sk_choose_plane'))
      })
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * Pick mesh file(s), create a new project folder, import into assets/, open Design workspace.
   * Uses default projects folder when set; otherwise asks for a project folder (same as New project).
   */
  async function createProjectFromImport(): Promise<void> {
    const defaultPath = settings?.projectsRoot?.trim() || undefined
    const files = await fab.dialogOpenFiles(
      [
        {
          name: '3D models (STL, STEP, OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE)',
          extensions: [...MESH_IMPORT_FILE_EXTENSIONS]
        }
      ],
      defaultPath
    )
    if (!files.length) return
    const py = settings?.pythonPath?.trim() ?? 'python'
    const needsPy = files.some((f) => pathNeedsPythonForMeshImport(f))
    if (needsPy && !settings?.pythonPath?.trim()) {
      setStatus(
        'Set Python path (File → Settings) for STEP (CadQuery) and mesh formats OBJ / PLY / GLTF / GLB / 3MF / OFF / DAE (pip install trimesh).'
      )
      return
    }
    const firstLabel = meshImportFileLabel(files[0]!)
    const stem = firstLabel.replace(/\.[^.]+$/, '') || 'import'
    const safe = sanitizeProjectFolderName(stem)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const root = settings?.projectsRoot?.trim()
    const machineId = machines[0]?.id ?? 'creality-k2-plus'
    setPendingMeshImport({
      kind: 'new_project',
      files,
      py,
      safeFolderName: safe,
      stamp,
      projectsRoot: root,
      machineId,
      firstLabel
    })
  }

  async function saveProject(): Promise<void> {
    if (!projectDir || !project) return
    await fab.projectSave(projectDir, { ...project, updatedAt: new Date().toISOString() })
    setStatus('Saved.')
  }

  async function saveSettingsField(partial: Partial<AppSettings>): Promise<void> {
    const next = await fab.settingsSet(partial)
    setSettings(next)
  }

  async function runSlice(): Promise<void> {
    const readiness = evaluateManufactureReadiness({
      project,
      settings,
      machines,
      manufacture: sideMfg
    })
    if (!readiness.canSlice || !projectDir || !project || !settings?.curaEnginePath) {
      setStatus('Set CuraEngine path under File → Settings and open a project.')
      return
    }
    const fdmSourceRel = sideMfg?.operations.find((o) => !o.suppressed && o.kind === 'fdm_slice')?.sourceMesh?.trim()
    const remembered = readPersistedManufactureLastRunMode('cam') === 'slice' ? readPersistedManufactureLastSourceStl('') : ''
    const defaultStl = fdmSourceRel ? `${projectDir}\\${fdmSourceRel.replace(/\//g, '\\')}` : remembered || null
    let stl = defaultStl || (await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }]))
    if (!stl) return
    let staged: string
    try {
      staged = await fab.stlStage(projectDir, stl)
    } catch {
      stl = await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }])
      if (!stl) return
      staged = await fab.stlStage(projectDir, stl)
    }
    const out = `${projectDir}\\output\\k2_slice.gcode`
    const curaEngineSettings = Object.fromEntries(mergeCuraSliceInvocationSettings(settings))
    const r = await fab.sliceCura({
      stlPath: staged,
      outPath: out,
      curaEnginePath: settings.curaEnginePath,
      definitionsPath: settings.curaDefinitionsPath,
      definitionPath: settings.curaMachineDefinitionPath?.trim() || undefined,
      slicePreset: settings.curaSlicePreset ?? 'balanced',
      curaEngineSettings
    })
    if (!r.ok) {
      setSliceOut(r.stderr ?? 'Unknown slicer error')
      setStatus('Slice failed — see output.')
      return
    }
    try {
      const gcode = await fab.readTextFile(out)
      setSliceOut(gcode)
    } catch {
      setSliceOut(r.stdout ?? 'G-code written (could not read file).')
    }
    setStatus('Slice complete.')
    writePersistedManufactureLastRunMode('slice')
    writePersistedManufactureLastSourceStl(stl)
  }

  async function runCam(ctx?: { mfg: ManufactureFile; selectedOpIndex: number }): Promise<void> {
    const mfgPlan = ctx?.mfg ?? sideMfg
    const selectedIdx = ctx?.selectedOpIndex ?? 0
    const readiness = evaluateManufactureReadiness({
      project,
      settings,
      machines,
      manufacture: mfgPlan
    })
    if (!readiness.canCam || !projectDir || !project) {
      setStatus('CAM is not ready. Check machine and operation setup in Manufacture Plan.')
      return
    }
    const drive = mfgPlan ? resolveManufactureCamDrivingOperation(mfgPlan, selectedIdx) : { ok: false as const, error: 'No plan.', hint: '' }
    if (!drive.ok) {
      setCamLastHint('')
      setCamOut(`${drive.error}\n\n${drive.hint}`)
      setStatus('CAM skipped — no runnable CNC operation. See output panel.')
      return
    }
    const planDrive = drive.op
    const camBlock = getManufactureCamRunBlock(planDrive.kind)
    if (camBlock) {
      setCamLastHint('')
      setCamOut(`${camBlock.error}\n\n${camBlock.hint}`)
      setStatus('CAM skipped — selected operation cannot use Generate CAM. See output panel.')
      return
    }
    const camSourceRel = planDrive.sourceMesh?.trim()
    const remembered = readPersistedManufactureLastRunMode('cam') === 'cam' ? readPersistedManufactureLastSourceStl('') : ''
    const defaultStl = camSourceRel ? `${projectDir}\\${camSourceRel.replace(/\//g, '\\')}` : remembered || null
    let stl = defaultStl || (await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }]))
    if (!stl) return
    let staged: string
    try {
      staged = await fab.stlStage(projectDir, stl)
    } catch {
      stl = await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }])
      if (!stl) return
      staged = await fab.stlStage(projectDir, stl)
    }
    const machineId =
      machines.find((m) => m.kind === 'cnc' && m.id === project.activeMachineId)?.id ??
      machines.find((m) => m.kind === 'cnc')?.id
    if (!machineId) {
      setStatus('No CNC machine profile found.')
      return
    }
    const py = settings?.pythonPath ?? 'python'
    const out = `${projectDir}\\output\\cam.nc`
    const setupForCam = mfgPlan ? resolveManufactureSetupForCam(mfgPlan, machineId) : undefined
    const toolDiameterMm = resolveCamToolDiameterMm({ operation: planDrive, tools })
    const cut = resolveCamCutParams(planDrive, setupForCam)
    const stockZ = setupStockThicknessZMm(setupForCam?.stock)
    const st = setupForCam?.stock
    const boxX = st?.kind === 'box' && typeof st.x === 'number' && st.x > 0 ? st.x : undefined
    const boxY = st?.kind === 'box' && typeof st.y === 'number' && st.y > 0 ? st.y : undefined
    const rot =
      planDrive?.kind === 'cnc_4axis_roughing' || planDrive?.kind === 'cnc_4axis_finishing' || planDrive?.kind === 'cnc_4axis_contour' || planDrive?.kind === 'cnc_4axis_indexed'
        ? rotaryDimsFromSetupStock(setupForCam?.stock)
        : {}
    let priorPostedGcode: string | undefined
    const planParams = planDrive.params as Record<string, unknown> | undefined
    if (planParams?.['usePriorPostedGcodeRest'] === true && projectDir) {
      try {
        const priorPath = `${projectDir.replace(/\//g, '\\')}\\output\\cam.nc`
        priorPostedGcode = await fab.readTextFile(priorPath)
      } catch {
        priorPostedGcode = undefined
      }
    }
    const r = await fab.camRun({
      stlPath: staged,
      outPath: out,
      machineId,
      zPassMm: cut.zPassMm,
      stepoverMm: cut.stepoverMm,
      feedMmMin: cut.feedMmMin,
      plungeMmMin: cut.plungeMmMin,
      safeZMm: cut.safeZMm,
      pythonPath: py,
      operationKind: planDrive.kind,
      workCoordinateIndex: setupForCam?.workCoordinateIndex,
      ...(toolDiameterMm != null ? { toolDiameterMm } : {}),
      ...(planDrive.params && typeof planDrive.params === 'object' ? { operationParams: planDrive.params } : {}),
      ...(stockZ != null ? { stockBoxZMm: stockZ } : {}),
      ...(boxX != null && boxY != null ? { stockBoxXMm: boxX, stockBoxYMm: boxY } : {}),
      ...(rot.lengthMm != null ? { rotaryStockLengthMm: rot.lengthMm } : {}),
      ...(rot.diameterMm != null ? { rotaryStockDiameterMm: rot.diameterMm } : {}),
      ...(setupForCam?.rotaryChuckDepthMm != null &&
      Number.isFinite(setupForCam.rotaryChuckDepthMm) &&
      setupForCam.rotaryChuckDepthMm >= 0
        ? { rotaryChuckDepthMm: setupForCam.rotaryChuckDepthMm }
        : {}),
      ...(setupForCam?.rotaryClampOffsetMm != null &&
      Number.isFinite(setupForCam.rotaryClampOffsetMm) &&
      setupForCam.rotaryClampOffsetMm >= 0
        ? { rotaryClampOffsetMm: setupForCam.rotaryClampOffsetMm }
        : {}),
      ...(planParams?.['useMeshMachinableXClamp'] === false ? { useMeshMachinableXClamp: false } : {}),
      ...(priorPostedGcode?.trim() ? { priorPostedGcode } : {})
    })
    if (!r.ok) {
      setCamLastHint('')
      const detail = r.hint ? `${r.error}\n\n${r.hint}` : r.error
      setCamOut(detail)
      setStatus('CAM failed — see G-code output panel.')
      return
    }
    const lastRunSummary = r.engine.fallbackApplied
      ? `Engine: built-in fallback (after OpenCAMLib). Reason: ${camFallbackReasonLabel(r.engine.fallbackReason)}.`
      : `Engine: ${r.engine.usedEngine === 'ocl' ? 'OpenCAMLib' : 'built-in'}.`
    setCamLastHint([lastRunSummary, r.hint].filter(Boolean).join(' '))
    setCamOut(r.gcode ?? '')
    const engineMsg = r.engine.fallbackApplied
      ? `CAM used built-in fallback after OpenCAMLib attempt (${camFallbackReasonLabel(r.engine.fallbackReason)}).`
      : r.engine.usedEngine === 'ocl'
        ? 'CAM ran with OpenCAMLib.'
        : 'CAM ran with built-in engine.'
    const primary = r.hint ? `${engineMsg} ${r.hint}` : engineMsg
    setStatus(`${primary} Unverified for real machines — docs/MACHINES.md.`)
    writePersistedManufactureLastRunMode('cam')
    writePersistedManufactureLastSourceStl(stl)
    if (ctx?.mfg && projectDir) {
      try {
        await fab.manufactureSave(projectDir, JSON.stringify(ctx.mfg))
        await reloadSidecars()
      } catch {
        /* persist optional — CAM output already written */
      }
    }
  }

  function pathNeedsPythonForMeshImport(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'step' || ext === 'stp') return true
    return MESH_PYTHON_EXTENSIONS.has(ext)
  }

  function meshImportFileLabel(filePath: string): string {
    const s = filePath.replace(/\\/g, '/')
    return s.split('/').pop() ?? filePath
  }

  async function executeMeshImport(
    pending: PendingMeshImport,
    placement: MeshImportPlacement,
    upAxis: MeshImportUpAxis,
    transform: MeshImportTransform
  ): Promise<void> {
    const opts = { placement, upAxis, transform }
    if (pending.kind === 'existing') {
      const dir = pending.targetProjectDir ?? projectDir
      const baseProject = pending.targetProject ?? project
      const openedFromSplash = Boolean(pending.targetProjectDir && pending.targetProject)
      if (!dir || !baseProject) {
        setStatus('Open a project first (File → Open project folder).')
        return
      }
      const reports: ImportHistoryEntry[] = []
      const meshRelPaths: string[] = []
      const errors: string[] = []
      for (const f of pending.files) {
        const r = await fab.assetsImportMesh(dir, f, pending.py, opts)
        if (!r.ok) {
          errors.push(`${meshImportFileLabel(f)}: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`)
          continue
        }
        meshRelPaths.push(r.relativePath)
        reports.push(r.report)
      }
      if (errors.length && reports.length === 0) {
        setStatus(`Import failed — ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`)
        return
      }
      if (!reports.length) return
      const next: ProjectFile = {
        ...baseProject,
        meshes: [...new Set([...baseProject.meshes, ...meshRelPaths])],
        importHistory: [...(baseProject.importHistory ?? []), ...reports],
        updatedAt: new Date().toISOString()
      }
      setProject(next)
      try {
        await fab.projectSave(dir, next)
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e))
        return
      }
      if (openedFromSplash) {
        setProjectDir(dir)
        setWorkspace('design')
        await recordProjectOpened(dir)
      }
      const okMsg =
        reports.length === 1
          ? (() => {
              const rep = reports[0]!
              const w = rep.warnings?.length ? ` ${rep.warnings.join(' ')}` : ''
              return `Imported ${rep.sourceFileName} → ${rep.assetRelativePath}.${w}`
            })()
          : `Imported ${reports.length} file(s)${reports.length < pending.files.length ? ` (${pending.files.length - reports.length} failed)` : ''}.`
      const errTail = errors.length
        ? ` — failed: ${errors.slice(0, 2).join(' · ')}${errors.length > 2 ? '…' : ''}`
        : ''
      setStatus(`${okMsg}${errTail} Project saved.`)
      return
    }

    const { files, py, safeFolderName, stamp, projectsRoot, machineId, firstLabel } = pending
    const dir: string | null = projectsRoot
      ? joinPath(projectsRoot, `${safeFolderName}-${stamp}`)
      : await fab.projectOpenDir()
    if (!dir) return
    const projectName = `Imported: ${firstLabel}`
    try {
      const p = await fab.projectCreate({ dir, name: projectName, machineId })
      const reports: ImportHistoryEntry[] = []
      const meshRelPaths: string[] = []
      const errors: string[] = []
      for (const f of files) {
        const r = await fab.assetsImportMesh(dir, f, py, opts)
        if (!r.ok) {
          errors.push(`${meshImportFileLabel(f)}: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`)
          continue
        }
        meshRelPaths.push(r.relativePath)
        reports.push(r.report)
      }
      if (errors.length && reports.length === 0) {
        setProjectDir(dir)
        setProject(p)
        setWorkspace('design')
        await recordProjectOpened(dir)
        setStatus(
          `Import failed — ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}. Empty project created at ${dir}.`
        )
        return
      }
      if (reports.length === 0) return
      const next: ProjectFile = {
        ...p,
        meshes: [...new Set([...p.meshes, ...meshRelPaths])],
        importHistory: [...(p.importHistory ?? []), ...reports],
        updatedAt: new Date().toISOString()
      }
      await fab.projectSave(dir, next)
      setProjectDir(dir)
      setProject(next)
      await recordProjectOpened(dir)
      setWorkspace('design')
      const okMsg =
        reports.length === 1
          ? (() => {
              const rep = reports[0]!
              const w = rep.warnings?.length ? ` ${rep.warnings.join(' ')}` : ''
              return `Created project and imported ${rep.sourceFileName} → ${rep.assetRelativePath}.${w}`
            })()
          : `Created project and imported ${reports.length} file(s)${reports.length < files.length ? ` (${files.length - reports.length} failed)` : ''}.`
      const errTail = errors.length
        ? ` — failed: ${errors.slice(0, 2).join(' · ')}${errors.length > 2 ? '…' : ''}`
        : ''
      setStatus(`${okMsg}${errTail} Project saved.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function importModel3D(): Promise<void> {
    if (!projectDir) {
      setStatus('Open a project first (File → Open project folder).')
      return
    }
    if (!project) {
      setStatus('Project data not loaded — try opening the project folder again.')
      return
    }
    const defaultPath =
      projectDir.trim().length > 0 ? projectDir : settings?.projectsRoot?.trim() || undefined
    const files = await fab.dialogOpenFiles(
      [
        {
          name: '3D models (STL, STEP, OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE)',
          extensions: [...MESH_IMPORT_FILE_EXTENSIONS]
        }
      ],
      defaultPath
    )
    if (!files.length) return
    const py = settings?.pythonPath?.trim() ?? 'python'
    const needsPy = files.some((f) => pathNeedsPythonForMeshImport(f))
    if (needsPy && !settings?.pythonPath?.trim()) {
      setStatus(
        'Set Python path (File → Settings) for STEP (CadQuery) and mesh formats OBJ / PLY / GLTF / GLB / 3MF / OFF / DAE (pip install trimesh).'
      )
      return
    }
    setPendingMeshImport({ kind: 'existing', files, py })
  }

  /** Splash: pick mesh files and add them to a project folder (opens that project after import). */
  async function importMeshIntoProjectAtPath(resolvedProjectDir: string): Promise<void> {
    let p: ProjectFile
    try {
      p = await fab.projectRead(resolvedProjectDir)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
      return
    }
    const defaultPath =
      resolvedProjectDir.trim().length > 0 ? resolvedProjectDir : settings?.projectsRoot?.trim() || undefined
    const files = await fab.dialogOpenFiles(
      [
        {
          name: '3D models (STL, STEP, OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE)',
          extensions: [...MESH_IMPORT_FILE_EXTENSIONS]
        }
      ],
      defaultPath
    )
    if (!files.length) return
    const py = settings?.pythonPath?.trim() ?? 'python'
    const needsPy = files.some((f) => pathNeedsPythonForMeshImport(f))
    if (needsPy && !settings?.pythonPath?.trim()) {
      setStatus(
        'Set Python path (File → Settings) for STEP (CadQuery) and mesh formats OBJ / PLY / GLTF / GLB / 3MF / OFF / DAE (pip install trimesh).'
      )
      return
    }
    setPendingMeshImport({
      kind: 'existing',
      files,
      py,
      targetProjectDir: resolvedProjectDir,
      targetProject: p
    })
  }

  async function importTools(
    kind: 'csv' | 'json' | 'fusion' | 'fusion_csv',
    target: 'project' | 'machine' = 'project'
  ): Promise<void> {
    if (!projectDir) return
    if (target === 'machine') {
      const mid = project?.activeMachineId?.trim()
      if (!mid) {
        setStatus('Set an active machine on File → Project (Manufacture uses it for the machine tool library).')
        return
      }
      const merged = await fab.machineToolsImport(mid, { kind, content: importText })
      await fab.machineToolsSave(mid, merged)
      setMachineTools(merged)
      setStatus('Machine tool library updated.')
      return
    }
    const merged = await fab.toolsImport(projectDir, { kind, content: importText })
    setProjectTools(merged)
    await fab.toolsSave(projectDir, merged)
    setStatus('Project tool library (tools.json) updated.')
  }

  async function importToolLibraryFromFile(target: 'project' | 'machine' = 'project'): Promise<void> {
    if (!projectDir) return
    const path = await fab.dialogOpenFile([
      {
        name: 'Tool library',
        extensions: ['csv', 'json', 'hsmlib', 'tpgz', 'xml']
      },
      { name: 'All files', extensions: ['*'] }
    ])
    if (!path) return
    if (target === 'machine') {
      const mid = project?.activeMachineId?.trim()
      if (!mid) {
        setStatus('Set an active machine on File → Project first.')
        return
      }
      const merged = await fab.machineToolsImportFile(mid, path)
      await fab.machineToolsSave(mid, merged)
      setMachineTools(merged)
      const n = merged.tools.length
      setStatus(`Machine tool library updated from file (${n} tool${n === 1 ? '' : 's'}).`)
      return
    }
    const merged = await fab.toolsImportFile(projectDir, path)
    setProjectTools(merged)
    await fab.toolsSave(projectDir, merged)
    const n = merged.tools.length
    setStatus(`Project tool library updated from file (${n} tool${n === 1 ? '' : 's'}).`)
  }

  async function migrateProjectToolsToMachine(): Promise<void> {
    if (!projectDir || !project?.activeMachineId?.trim()) {
      setStatus('Open a project and set an active machine.')
      return
    }
    const mid = project.activeMachineId.trim()
    const merged = await fab.machineToolsMigrateFromProject(mid, projectDir)
    setMachineTools(merged)
    setStatus(`Copied project tools into machine library (${merged.tools.length} tools).`)
  }

  async function saveActiveMachineId(machineId: string): Promise<void> {
    if (!projectDir || !project) return
    const next = { ...project, activeMachineId: machineId, updatedAt: new Date().toISOString() }
    setProject(next)
    await fab.projectSave(projectDir, next)
    setStatus('Active machine saved.')
  }

  async function saveDrawingManifest(): Promise<void> {
    if (!projectDir) return
    try {
      await fab.drawingSave(projectDir, JSON.stringify(drawingFile))
      setStatus('Saved drawing/drawing.json')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function exportDrawing(kind: 'pdf' | 'dxf'): Promise<void> {
    setDrawingExportBusy(true)
    try {
      const r = await fab.drawingExport({
        kind,
        projectName: project?.name,
        projectDir: projectDir ?? undefined
      })
      if (r.ok) {
        setStatus(`${kind.toUpperCase()} saved — ${r.path}`)
        return
      }
      if (r.canceled) return
      setStatus(`Drawing export failed — ${r.error}`)
    } finally {
      setDrawingExportBusy(false)
    }
  }

  const docTitle = project?.name ?? 'No document'

  const camComplianceBanner = useMemo(() => {
    if (appProduct !== 'cam' || !projectDir || !settings || settings.camGcodeSafetyAcknowledged === true) {
      return null
    }
    return (
      <div className="app-shell-compliance" role="alert">
        <p className="app-shell-compliance__text">
          WorkTrackCAM: Generated G-code is not verified for your machine until you check the post, units, and clearances
          (see docs/MACHINES.md). Confirm in File → Settings.
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setWorkspace('utilities')
            setUtilityTab('settings')
          }}
        >
          Open File → Settings
        </button>
      </div>
    )
  }, [appProduct, projectDir, settings, setWorkspace, setUtilityTab])

  const handleCommandPick = useMemo(
    () =>
      createCommandPickHandler({
        setWorkspace,
        setUtilityTab,
        setManufacturePanelTab,
        setShortcutsDialogOpen,
        setStatus,
        setCommandPaletteOpen,
        openProjectFolder,
        createProject,
        createProjectFromImport,
        saveProject,
        importModel3D,
        exportDrawing
      }),
    [
      setWorkspace,
      openProjectFolder,
      createProject,
      createProjectFromImport,
      saveProject,
      importModel3D,
      exportDrawing
    ]
  )

  const headerActions = (
    <div className="app-file-actions">
      <button
        type="button"
        className="secondary"
        title="Search commands (Ctrl+K / ⌘K), browse recents, and open shortcuts with Ctrl+Shift+?"
        onClick={() => setCommandPaletteOpen(true)}
      >
        Commands
      </button>
      <button type="button" className="secondary" onClick={() => void openProjectFolder()}>
        Open…
      </button>
      <button type="button" className="secondary" onClick={() => void createProject()}>
        New…
      </button>
      <button
        type="button"
        className="secondary"
        title="Create a project folder and import STL / STEP / mesh into assets/"
        onClick={() => void createProjectFromImport()}
      >
        New from 3D…
      </button>
      <button type="button" className="primary" onClick={() => void saveProject()} disabled={!project}>
        Save
      </button>
    </div>
  )

  let workspaceBody: ReactNode
  if (!projectDir) {
    workspaceBody = null
  } else if (workspace === 'design') {
    workspaceBody = <DesignWorkspace onImport3D={() => void importModel3D()} />
  } else if (workspace === 'assemble') {
    workspaceBody = <AssemblyWorkspace projectDir={projectDir} onStatus={setStatus} onAfterSave={reloadSidecars} />
  } else if (workspace === 'manufacture') {
    workspaceBody = (
      <ManufactureWorkspace
        projectDir={projectDir}
        machines={machines}
        tools={tools}
        projectTools={projectTools}
        machineTools={machineTools}
        activeMachineId={project?.activeMachineId ?? null}
        onSaveActiveMachineId={saveActiveMachineId}
        onStatus={setStatus}
        onAfterSave={reloadSidecars}
        onAfterMeshImport={reloadSidecars}
        panelTab={manufacturePanelTab}
        onPanelTabChange={setManufacturePanelTab}
        settings={settings}
        project={project}
        sliceOut={sliceOut}
        camOut={camOut}
        camLastHint={camLastHint}
        importText={importText}
        onImportTextChange={setImportText}
        onSaveSettingsField={saveSettingsField}
        onRunSlice={runSlice}
        onRunCam={runCam}
        onImportTools={importTools}
        onImportToolLibraryFromFile={importToolLibraryFromFile}
        onMigrateProjectToolsToMachine={migrateProjectToolsToMachine}
        onGoSettings={() => {
          setWorkspace('utilities')
          setUtilityTab('settings')
        }}
        onGoProject={() => {
          setWorkspace('utilities')
          setUtilityTab('project')
        }}
      />
    )
  } else {
    workspaceBody = (
      <UtilitiesWorkspacePanels
        tab={utilityTab}
        machines={machines}
        settings={settings}
        project={project}
        projectDir={projectDir}
        projectsRoot={settings?.projectsRoot}
        recentProjectPaths={settings?.recentProjectPaths ?? []}
        drawingExportBusy={drawingExportBusy}
        onOpenProjectFolder={openProjectFolder}
        onCreateProject={createProject}
        onCreateProjectFromImport={createProjectFromImport}
        onSaveProject={saveProject}
        onProjectChange={setProject}
        onSaveSettingsField={saveSettingsField}
        onChooseProjectsRoot={chooseProjectsRoot}
        onClearProjectsRoot={clearProjectsRoot}
        onOpenRecentProject={openRecentProject}
        onRemoveRecentProject={removeRecentProject}
        onImportMesh={importModel3D}
        onExportDrawing={exportDrawing}
        drawingFile={drawingFile}
        onPatchDrawingFirstSheet={patchDrawingFirstSheet}
        onSaveDrawingManifest={saveDrawingManifest}
        onExportDesignParameters={exportDesignParameters}
        onImportDesignParameters={importDesignParameters}
      />
    )
  }

  const splashLastProjectDir = settings?.lastProjectPath?.trim() ?? ''

  return (
    <div className="app">
      <ShortcutsReferenceDialog open={shortcutsDialogOpen} onClose={() => setShortcutsDialogOpen(false)} />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onPick={handleCommandPick}
      />
      <ImportMeshPlacementModal
        open={pendingMeshImport != null}
        fileCount={pendingMeshImport?.files.length ?? 0}
        previewSourcePath={pendingMeshImport?.files[0]}
        previewPythonPath={pendingMeshImport?.py}
        onCancel={() => setPendingMeshImport(null)}
        onConfirm={(placement, upAxis, transform) => {
          const p = pendingMeshImport
          setPendingMeshImport(null)
          if (!p) return
          void executeMeshImport(p, placement, upAxis, transform)
        }}
      />
      {!projectDir ? (
        <>
          <SplashScreen
            brandName={appDisplayName}
            splashLead={getSplashLead(appProduct)}
            recentProjectPaths={settings?.recentProjectPaths ?? []}
            lastProjectPath={settings?.lastProjectPath}
            statusMessage={status}
            onOpenCommands={() => setCommandPaletteOpen(true)}
            onOpenSettings={() => setSplashSettingsOpen(true)}
            onOpenProject={openProjectFolder}
            onOpenRecent={openRecentProject}
            onRemoveRecent={removeRecentProject}
            onNewProject={createProject}
            onImport3DNewProject={createProjectFromImport}
            onImport3DIntoLastProject={
              splashLastProjectDir ? () => void importMeshIntoProjectAtPath(splashLastProjectDir) : undefined
            }
            onResumeLast={() => {
              const p = settings?.lastProjectPath?.trim()
              if (p) void openRecentProject(p)
            }}
          />
          <SplashSettingsModal
            open={splashSettingsOpen}
            onClose={() => setSplashSettingsOpen(false)}
            settings={settings}
            projectsRoot={settings?.projectsRoot}
            appVersion={splashAppVersion}
            onSaveSettingsField={saveSettingsField}
            onChooseProjectsRoot={chooseProjectsRoot}
            onClearProjectsRoot={clearProjectsRoot}
          />
        </>
      ) : (
        <DesignSessionProvider
          projectDir={projectDir}
          designDiskRevision={designDiskRevision}
          assetMeshRelPaths={project?.meshes}
          onStatus={setStatus}
          onExportedStl={(absolutePath) => {
            setProject((p) => {
              if (!p || !projectDir) return p
              const root = projectDir.replace(/[/\\]+$/, '')
              const nPath = absolutePath.replace(/\\/g, '/')
              const nRoot = root.replace(/\\/g, '/')
              const rel =
                nPath.toLowerCase().startsWith(nRoot.toLowerCase() + '/')
                  ? nPath.slice(nRoot.length + 1)
                  : absolutePath
              return {
                ...p,
                meshes: [...new Set([...p.meshes, rel])],
                updatedAt: new Date().toISOString()
              }
            })
          }}
        >
          <AppShell
            docTitle={docTitle}
            appSubtitle={appDisplayName}
            allowedWorkspaces={allowedWorkspaces}
            headerActions={headerActions}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
            utilityTab={utilityTab}
            onUtilityTabChange={setUtilityTab}
            uiShell={uiShell}
            onUiShellChange={setUiShell}
            complianceBanner={camComplianceBanner}
            menuBar={
              uiShell === 'freecad' ? (
                <AppMenuBar
                  canSave={!!project}
                  onOpenProject={() => void openProjectFolder()}
                  onNewProject={() => void createProject()}
                  onNewFrom3D={() => void createProjectFromImport()}
                  onSave={() => void saveProject()}
                  onGoProjectTab={() => {
                    setWorkspace('utilities')
                    setUtilityTab('project')
                  }}
                  onGoSettingsTab={() => {
                    setWorkspace('utilities')
                    setUtilityTab('settings')
                  }}
                  onCommandPalette={() => setCommandPaletteOpen(true)}
                  onWorkspaceChange={setWorkspace}
                  showProperties={showProperties}
                  onToggleProperties={() => setShowProperties((v) => !v)}
                  onOpenShortcuts={openShortcutsReferenceHandler}
                  uiShell={uiShell}
                  onUiShellChange={setUiShell}
                  allowedWorkspaces={allowedWorkspaces}
                />
              ) : null
            }
            browser={
              uiShell === 'freecad' ? (
                <ComboViewPanel
                  tab={comboViewTab}
                  onTabChange={setComboViewTab}
                  model={
                    <BrowserPanel
                      workspace={workspace}
                      projectDir={projectDir}
                      asm={sideAsm}
                      mfg={sideMfg}
                      shellSelection={shellSelection}
                      onShellSelection={setShellSelection}
                      embedInComboView
                    />
                  }
                  tasks={
                    <TasksPanel
                      workspace={workspace}
                      onOpenCommandPalette={() => setCommandPaletteOpen(true)}
                    />
                  }
                />
              ) : (
                <BrowserPanel
                  workspace={workspace}
                  projectDir={projectDir}
                  asm={sideAsm}
                  mfg={sideMfg}
                  shellSelection={shellSelection}
                  onShellSelection={setShellSelection}
                />
              )
            }
            timeline={workspace === 'design' ? <TimelineBar /> : null}
            properties={
              <PropertiesPanel workspace={workspace} asm={sideAsm} mfg={sideMfg} shellSelection={shellSelection} />
            }
            showProperties={showProperties}
            onToggleProperties={() => setShowProperties((v) => !v)}
            statusText={status}
          >
            <div className="workspace-canvas-fill">
              {workspace === 'utilities' ? (
                <div
                  role="tabpanel"
                  id="utility-workspace-panel"
                  aria-labelledby={`util-tab-${utilityTab}`}
                >
                  {workspaceBody}
                </div>
              ) : (
                workspaceBody
              )}
            </div>
          </AppShell>
        </DesignSessionProvider>
      )}
    </div>
  )
}
