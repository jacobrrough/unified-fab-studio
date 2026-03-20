import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { emptyAssembly, type AssemblyFile } from '../../shared/assembly-schema'
import {
  DESIGN_RIBBON_COMMAND_IDS,
  type FusionStyleCommand
} from '../../shared/fusion-style-command-catalog'
import type { MachineProfile } from '../../shared/machine-schema'
import { emptyManufacture, type ManufactureFile } from '../../shared/manufacture-schema'
import { MESH_IMPORT_FILE_EXTENSIONS, MESH_PYTHON_EXTENSIONS } from '../../shared/mesh-import-formats'
import type { AppSettings, ImportHistoryEntry, ProjectFile } from '../../shared/project-schema'
import {
  emptyDrawingFile,
  type DrawingFile,
  type DrawingSheet,
  type DrawingViewPlaceholder
} from '../../shared/drawing-sheet-schema'
import type { ToolLibraryFile } from '../../shared/tool-schema'
import { resolveCamCutParams } from '../../shared/cam-cut-params'
import { resolveCamToolDiameterMm } from '../../shared/cam-tool-resolve'
import { getManufactureCamRunBlock } from '../../shared/manufacture-cam-gate'
import { formatLoadRejection } from '../../shared/file-parse-errors'
import { AssemblyWorkspace } from '../assembly/AssemblyWorkspace'
import { CommandPalette } from '../commands/CommandPalette'
import { useShellKeyboardShortcuts } from '../commands/useShellKeyboardShortcuts'
import { dispatchDesignCommand } from '../design/design-command-bridge'
import { DesignSessionProvider } from '../design/DesignSessionContext'
import { DesignWorkspace } from '../design/DesignWorkspace'
import { ManufactureWorkspace } from '../manufacture/ManufactureWorkspace'
import { drawingPaletteStatusFor } from '../commands/drawing-command-status'
import { AppShell, type UtilityTab } from '../shell/AppShell'
import {
  readPersistedUtilityTab,
  readPersistedWorkspace,
  writePersistedUtilityTab,
  writePersistedWorkspace
} from '../shell/workspaceMemory'
import { BrowserPanel } from '../shell/BrowserPanel'
import { PropertiesPanel } from '../shell/PropertiesPanel'
import { TimelineBar } from '../shell/TimelineBar'
import type { ShellBrowserSelection } from '../shell/browser-selection'
import type { Workspace } from '../shell/WorkspaceBar'
import { UtilitiesWorkspacePanels } from '../utilities/UtilitiesWorkspacePanels'

const SHOW_PROPS_KEY = 'ufs_show_properties'

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => readPersistedWorkspace('utilities'))
  const [utilityTab, setUtilityTab] = useState<UtilityTab>(() => readPersistedUtilityTab('project'))
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
  const [tools, setTools] = useState<ToolLibraryFile | null>(null)
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

  const fab = window.fab

  const patchDrawingFirstSheet = useCallback(
    (partial: { name?: string; scale?: string; viewPlaceholders?: DrawingViewPlaceholder[] }) => {
      setDrawingFile((df) => {
        const cur = df.sheets[0]
        const name = partial.name !== undefined ? partial.name : (cur?.name ?? '')
        const scale = partial.scale !== undefined ? partial.scale : (cur?.scale ?? '')
        const vps =
          partial.viewPlaceholders !== undefined ? partial.viewPlaceholders : cur?.viewPlaceholders
        const trimmedName = name.trim()
        const trimmedScale = scale.trim()
        if (!trimmedName) {
          if (!cur) return df
          return { version: 1, sheets: df.sheets.slice(1) }
        }
        const id = cur?.id ?? crypto.randomUUID()
        const sheet: DrawingSheet = {
          id,
          name: trimmedName,
          scale: trimmedScale || undefined
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
    try {
      localStorage.setItem(SHOW_PROPS_KEY, showProperties ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [showProperties])

  const openShortcutsReference = useCallback(() => {
    setWorkspace('utilities')
    setUtilityTab('shortcuts')
    setStatus('Keyboard shortcuts — reference tab.')
  }, [])

  useShellKeyboardShortcuts({
    commandPaletteOpen,
    onToggleCommandPalette: () => setCommandPaletteOpen((o) => !o),
    onOpenShortcutsReference: openShortcutsReference
  })

  useEffect(() => {
    writePersistedWorkspace(workspace)
  }, [workspace])

  useEffect(() => {
    writePersistedUtilityTab(utilityTab)
  }, [utilityTab])

  useEffect(() => {
    if (!projectDir) {
      setTools(null)
      return
    }
    void fab.toolsRead(projectDir).then(setTools)
  }, [fab, projectDir])

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

  const activeMachine = useMemo(() => machines.find((x) => x.id === project?.activeMachineId), [machines, project])

  async function openProjectFolder(): Promise<void> {
    const dir = await fab.projectOpenDir()
    if (!dir) return
    setProjectDir(dir)
    const p = await fab.projectRead(dir)
    setProject(p)
    setStatus(`Opened project: ${p.name}`)
  }

  async function createProject(): Promise<void> {
    const dir = await fab.projectOpenDir()
    if (!dir) return
    const machineId = machines[0]?.id ?? 'creality-k2-plus'
    const p = await fab.projectCreate({ dir, name: 'New job', machineId })
    setProjectDir(dir)
    setProject(p)
    setWorkspace('design')
    setStatus('Created new project. Pick a sketch plane to start drawing.')
    // Defer until Design workspace mounts and subscribes to command events.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => dispatchDesignCommand('sk_choose_plane'))
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
    if (!projectDir || !project || !settings?.curaEnginePath) {
      setStatus('Set CuraEngine path in Settings and open a project.')
      return
    }
    const stl = await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }])
    if (!stl) return
    const staged = await fab.stlStage(projectDir, stl)
    const out = `${projectDir}\\output\\k2_slice.gcode`
    const r = await fab.sliceCura({
      stlPath: staged,
      outPath: out,
      curaEnginePath: settings.curaEnginePath,
      definitionsPath: settings.curaDefinitionsPath,
      slicePreset: settings.curaSlicePreset ?? 'balanced'
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
  }

  async function runCam(): Promise<void> {
    if (!projectDir || !project) return
    const planDrive = sideMfg?.operations.find((o) => !o.suppressed)
    const camBlock = getManufactureCamRunBlock(planDrive?.kind)
    if (camBlock) {
      setCamLastHint('')
      setCamOut(`${camBlock.error}\n\n${camBlock.hint}`)
      setStatus('CAM skipped — first operation cannot use Generate CAM. See output panel.')
      return
    }
    const stl = await fab.dialogOpenFile([{ name: 'STL', extensions: ['stl'] }])
    if (!stl) return
    const staged = await fab.stlStage(projectDir, stl)
    const machineId =
      machines.find((m) => m.kind === 'cnc' && m.id === project.activeMachineId)?.id ??
      machines.find((m) => m.kind === 'cnc')?.id
    if (!machineId) {
      setStatus('No CNC machine profile found.')
      return
    }
    const py = settings?.pythonPath ?? 'python'
    const out = `${projectDir}\\output\\cam.nc`
    const planCnc = sideMfg?.operations.find((o) => !o.suppressed && o.kind.startsWith('cnc_'))
    const setupForCam =
      sideMfg?.setups.find((s) => s.machineId === machineId) ?? sideMfg?.setups[0]
    const toolDiameterMm = resolveCamToolDiameterMm({ operation: planCnc, tools })
    const cut = resolveCamCutParams(planCnc)
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
      operationKind: planDrive?.kind,
      workCoordinateIndex: setupForCam?.workCoordinateIndex,
      ...(toolDiameterMm != null ? { toolDiameterMm } : {}),
      ...(planDrive?.params && typeof planDrive.params === 'object' ? { operationParams: planDrive.params } : {})
    })
    if (!r.ok) {
      setCamLastHint('')
      const detail = r.hint ? `${r.error}\n\n${r.hint}` : r.error
      setCamOut(detail)
      setStatus('CAM failed — see G-code output panel.')
      return
    }
    setCamLastHint(r.hint ?? '')
    setCamOut(r.gcode ?? '')
    const engineMsg = `CAM done (${r.usedEngine}).`
    const primary = r.hint ? `${r.hint} ${engineMsg}` : engineMsg
    setStatus(`${primary} Unverified for real machines — docs/MACHINES.md.`)
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

  async function importModel3D(): Promise<void> {
    if (!projectDir) return
    const files = await fab.dialogOpenFiles([
      {
        name: '3D models (STL, STEP, OBJ, PLY, GLTF, GLB, 3MF, OFF, DAE)',
        extensions: [...MESH_IMPORT_FILE_EXTENSIONS]
      }
    ])
    if (!files.length) return
    const py = settings?.pythonPath?.trim() ?? 'python'
    const needsPy = files.some((f) => pathNeedsPythonForMeshImport(f))
    if (needsPy && !settings?.pythonPath?.trim()) {
      setStatus(
        'Set Python path (Utilities → Settings) for STEP (CadQuery) and mesh formats OBJ / PLY / GLTF / GLB / 3MF / OFF / DAE (pip install trimesh).'
      )
      return
    }
    const reports: ImportHistoryEntry[] = []
    const meshPaths: string[] = []
    const errors: string[] = []
    for (const f of files) {
      const r = await fab.assetsImportMesh(projectDir, f, py)
      if (!r.ok) {
        errors.push(`${meshImportFileLabel(f)}: ${r.error}${r.detail ? ` — ${r.detail}` : ''}`)
        continue
      }
      meshPaths.push(r.stlPath)
      reports.push(r.report)
    }
    if (reports.length) {
      setProject((p) =>
        p
          ? {
              ...p,
              meshes: [...new Set([...p.meshes, ...meshPaths])],
              importHistory: [...(p.importHistory ?? []), ...reports],
              updatedAt: new Date().toISOString()
            }
          : p
      )
    }
    const okMsg =
      reports.length === 1
        ? (() => {
            const rep = reports[0]!
            const w = rep.warnings?.length ? ` ${rep.warnings.join(' ')}` : ''
            return `Imported ${rep.sourceFileName} → ${rep.assetRelativePath}.${w}`
          })()
        : `Imported ${reports.length} file(s)${reports.length < files.length ? ` (${files.length - reports.length} failed)` : ''}.`
    if (errors.length && reports.length === 0) {
      setStatus(`Import failed — ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`)
      return
    }
    const errTail = errors.length
      ? ` — failed: ${errors.slice(0, 2).join(' · ')}${errors.length > 2 ? '…' : ''}`
      : ''
    setStatus(`${okMsg}${errTail}`)
  }

  async function importTools(kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'): Promise<void> {
    if (!projectDir) return
    const merged = await fab.toolsImport(projectDir, { kind, content: importText })
    setTools(merged)
    await fab.toolsSave(projectDir, merged)
    setStatus('Tool library updated.')
  }

  async function importToolLibraryFromFile(): Promise<void> {
    if (!projectDir) return
    const path = await fab.dialogOpenFile([
      {
        name: 'Tool library',
        extensions: ['csv', 'json', 'hsmlib', 'tpgz', 'xml']
      },
      { name: 'All files', extensions: ['*'] }
    ])
    if (!path) return
    const merged = await fab.toolsImportFile(projectDir, path)
    setTools(merged)
    await fab.toolsSave(projectDir, merged)
    const n = merged.tools.length
    setStatus(`Tool library updated from file (${n} tool${n === 1 ? '' : 's'}).`)
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

  function handleCommandPick(cmd: FusionStyleCommand): void {
    switch (cmd.id) {
      case 'ut_open':
        void openProjectFolder()
        return
      case 'ut_new':
        void createProject()
        return
      case 'ut_save':
        void saveProject()
        return
      case 'ut_import_3d':
      case 'ut_import_stl':
      case 'ut_import_step':
        void importModel3D()
        return
      case 'ut_slice':
        setWorkspace('utilities')
        setUtilityTab('slice')
        setStatus('Slice — use the Slice tab.')
        return
      case 'ut_cam':
        setWorkspace('utilities')
        setUtilityTab('cam')
        setStatus('CAM — use the CAM tab.')
        return
      case 'ut_tools':
        setWorkspace('utilities')
        setUtilityTab('tools')
        setStatus('Tool library')
        return
      case 'ut_command_palette':
        setCommandPaletteOpen(true)
        setStatus('Command palette — search or pick a command.')
        return
      case 'ut_keyboard_shortcuts':
        setWorkspace('utilities')
        setUtilityTab('shortcuts')
        setStatus('Keyboard shortcuts — reference tab.')
        return
      case 'ut_interference':
        setWorkspace('assemble')
        setStatus(
          'Interference — switched to **Assemble**. Open **Interference check** in the assembly panel, then download JSON or save a report under output/.'
        )
        return
      case 'as_interference':
        setWorkspace('assemble')
        setStatus(
          `${cmd.label} — Assembly: **Interference check**, then download JSON or **Save report to output/** (project folder).`
        )
        return
      case 'as_summary':
        setWorkspace('assemble')
        setStatus(`${cmd.label} — click Assembly summary in the assembly panel.`)
        return
      case 'dr_export_pdf':
        setWorkspace('utilities')
        setUtilityTab('project')
        void exportDrawing('pdf')
        return
      case 'dr_export_dxf':
        setWorkspace('utilities')
        setUtilityTab('project')
        void exportDrawing('dxf')
        return
      case 'dr_new_sheet':
      case 'dr_base_view':
      case 'dr_projected_view':
        setWorkspace('utilities')
        setUtilityTab('project')
        setStatus(drawingPaletteStatusFor(cmd))
        return
      case 'ut_measure':
      case 'ut_section':
        setWorkspace('design')
        dispatchDesignCommand(cmd.id)
        setStatus(
          cmd.id === 'ut_measure'
            ? 'Measure — 3D preview: enable Measure, Shift+click two points on the solid. Esc clears.'
            : 'Section — 3D preview: enable Section, drag Y clip. Esc clears.'
        )
        return
      default:
        break
    }
    if (cmd.ribbon === 'drawing') {
      setWorkspace('utilities')
      setUtilityTab('project')
      setStatus(
        `${cmd.label} — PDF/DXF export + view **placeholders** on the Project tab; true projected geometry is not implemented.`
      )
      return
    }
    if (cmd.workspace === 'design') {
      setWorkspace('design')
      if (DESIGN_RIBBON_COMMAND_IDS.has(cmd.id)) {
        dispatchDesignCommand(cmd.id)
      }
      if (cmd.id === 'ut_parameters') {
        setStatus(
          'Parameters — Design ribbon **Parameters** group: add/rename/delete keys and values; Utilities → Project **Export/Import parameters JSON** for file merge.'
        )
      } else {
        setStatus(
          cmd.status === 'implemented'
            ? `${cmd.label} — Design workspace (ribbon synced when applicable).`
            : `${cmd.label} — not implemented yet; Design workspace for closest tools.`
        )
      }
      return
    }
    if (cmd.workspace === 'assemble') {
      setWorkspace('assemble')
      setStatus(`${cmd.label} — Assemble workspace.`)
      return
    }
    if (cmd.workspace === 'manufacture') {
      setWorkspace('manufacture')
      setStatus(`${cmd.label} — Manufacture workspace.`)
      return
    }
    setWorkspace('utilities')
    setStatus(`${cmd.label} — Utilities — pick a tab (Project, Settings, …).`)
  }

  const headerActions = (
    <div className="app-file-actions">
      <button
        type="button"
        className="secondary"
        title="Search commands (Ctrl+K / ⌘K) · Ctrl+Shift+? shortcuts"
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
      <button type="button" className="primary" onClick={() => void saveProject()} disabled={!project}>
        Save
      </button>
    </div>
  )

  let workspaceBody: ReactNode
  if (workspace === 'design') {
    workspaceBody = <DesignWorkspace />
  } else if (workspace === 'assemble') {
    workspaceBody = <AssemblyWorkspace projectDir={projectDir} onStatus={setStatus} onAfterSave={reloadSidecars} />
  } else if (workspace === 'manufacture') {
    workspaceBody = (
      <ManufactureWorkspace
        projectDir={projectDir}
        machines={machines}
        tools={tools}
        onStatus={setStatus}
        onAfterSave={reloadSidecars}
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
        tools={tools}
        activeMachine={activeMachine}
        sliceOut={sliceOut}
        camOut={camOut}
        camLastHint={camLastHint}
        importText={importText}
        onImportTextChange={setImportText}
        drawingExportBusy={drawingExportBusy}
        onOpenProjectFolder={openProjectFolder}
        onCreateProject={createProject}
        onSaveProject={saveProject}
        onProjectChange={setProject}
        onSaveSettingsField={saveSettingsField}
        onRunSlice={runSlice}
        onRunCam={runCam}
        onImportMesh={importModel3D}
        onImportTools={importTools}
        onImportToolLibraryFromFile={importToolLibraryFromFile}
        onExportDrawing={exportDrawing}
        onCatalogStatus={setStatus}
        drawingFile={drawingFile}
        onPatchDrawingFirstSheet={patchDrawingFirstSheet}
        onSaveDrawingManifest={saveDrawingManifest}
        onExportDesignParameters={exportDesignParameters}
        onImportDesignParameters={importDesignParameters}
      />
    )
  }

  return (
    <div className="app">
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onPick={handleCommandPick}
      />
      <DesignSessionProvider
        projectDir={projectDir}
        designDiskRevision={designDiskRevision}
        onStatus={setStatus}
        onExportedStl={(path) => {
          setProject((p) =>
            p ? { ...p, meshes: [...new Set([...p.meshes, path])], updatedAt: new Date().toISOString() } : p
          )
        }}
      >
        <AppShell
          docTitle={docTitle}
          headerActions={headerActions}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          utilityTab={utilityTab}
          onUtilityTabChange={setUtilityTab}
          browser={
            <BrowserPanel
              workspace={workspace}
              projectDir={projectDir}
              asm={sideAsm}
              mfg={sideMfg}
              shellSelection={shellSelection}
              onShellSelection={setShellSelection}
            />
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
    </div>
  )
}
