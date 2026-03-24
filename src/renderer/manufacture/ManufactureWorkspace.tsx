import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, ProjectFile } from '../../shared/project-schema'
import type { MachineProfile } from '../../shared/machine-schema'
import {
  deriveContourPointsFromDesign,
  deriveDrillPointsFromDesign,
  listContourCandidatesFromDesign,
  type DerivedContourCandidate
} from '../../shared/cam-2d-derive'
import { CAM_CUT_DEFAULTS, resolveManufactureSetupForCam } from '../../shared/cam-cut-params'
import { mergeCuraSliceInvocationSettings } from '../../shared/cura-slice-defaults'
import { isManufactureKindBlockedFromCam } from '../../shared/manufacture-cam-gate'
import { MESH_IMPORT_FILE_EXTENSIONS } from '../../shared/mesh-import-formats'
import type { ManufactureFile, ManufactureOperation, ManufactureSetup } from '../../shared/manufacture-schema'
import { emptyManufacture } from '../../shared/manufacture-schema'
import { computeBinaryStlBoundingBox, stockBoxDimensionsFromPartBounds } from '../../shared/stl-binary-preview'
import {
  readPersistedManufactureActionableOnly,
  readPersistedManufactureOpFilter,
  type ManufactureOpFilter,
  type ManufacturePanelTab,
  writePersistedManufactureActionableOnly,
  writePersistedManufactureOpFilter
} from '../shell/workspaceMemory'
import { estimateFeedMmMinFromTool } from '../../shared/tool-feed-hint'
import type { ToolLibraryFile } from '../../shared/tool-schema'
import { CamManufacturePanel, SliceManufacturePanel, ToolsManufacturePanel } from './ManufactureAuxPanels'
import { ManufactureSetupStrip } from './ManufactureSetupStrip'
import { ManufactureCamSimulationPanel } from './ManufactureCamSimulationPanel'
import { ManufactureSubTabStrip } from './ManufactureSubTabStrip'

function resolveManufactureCamMachine(mfg: ManufactureFile, machines: MachineProfile[]): MachineProfile | undefined {
  const cnc = machines.filter((m) => m.kind === 'cnc')
  if (cnc.length === 0) return undefined
  for (const st of mfg.setups) {
    const hit = cnc.find((m) => m.id === st.machineId)
    if (hit) return hit
  }
  return cnc[0]
}

type Props = {
  projectDir: string | null
  machines: MachineProfile[]
  /** Merged machine-first + project tools for CAM pickers */
  tools?: ToolLibraryFile | null
  /** Project-folder tools.json (may be empty) */
  projectTools?: ToolLibraryFile | null
  /** App userData library for active machine */
  machineTools?: ToolLibraryFile | null
  /** Project active machine id — matches which manufacture setup Make → Generate CAM prefers */
  activeMachineId?: string | null
  onSaveActiveMachineId?: (machineId: string) => void | Promise<void>
  onStatus?: (msg: string) => void
  onAfterSave?: () => void
  panelTab: ManufacturePanelTab
  onPanelTabChange: (t: ManufacturePanelTab) => void
  settings: AppSettings | null
  project: ProjectFile | null
  sliceOut: string
  camOut: string
  camLastHint: string
  importText: string
  onImportTextChange: (value: string) => void
  onSaveSettingsField: (partial: Partial<AppSettings>) => void
  onRunSlice: () => void
  onRunCam: () => void
  onImportTools: (kind: 'csv' | 'json' | 'fusion' | 'fusion_csv', target?: 'project' | 'machine') => void
  onImportToolLibraryFromFile: (target?: 'project' | 'machine') => void | Promise<void>
  onMigrateProjectToolsToMachine?: () => void | Promise<void>
  onGoSettings: () => void
  onGoProject: () => void
  /** After importing a mesh into the project from Manufacture, refresh project sidecars (e.g. `project.json`). */
  onAfterMeshImport?: () => void | Promise<void>
}

function cncOp(kind: ManufactureOperation['kind']): boolean {
  return kind.startsWith('cnc_')
}

/** Human-readable stats for valid contourPoints arrays (setup WCS, mm). */
function contourPointsStats(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length < 3) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let n = 0
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    const x = Number(pt[0])
    const y = Number(pt[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    n++
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (n < 3) return null
  return `${n} vertices · XY bbox ${minX.toFixed(1)}–${maxX.toFixed(1)} × ${minY.toFixed(1)}–${maxY.toFixed(1)} mm`
}

export function ManufactureWorkspace({
  projectDir,
  machines,
  tools,
  projectTools = null,
  machineTools = null,
  activeMachineId = null,
  onSaveActiveMachineId,
  onStatus,
  onAfterSave,
  panelTab,
  onPanelTabChange,
  settings,
  project,
  sliceOut,
  camOut,
  camLastHint,
  importText,
  onImportTextChange,
  onSaveSettingsField,
  onRunSlice,
  onRunCam,
  onImportTools,
  onImportToolLibraryFromFile,
  onMigrateProjectToolsToMachine,
  onGoSettings,
  onGoProject,
  onAfterMeshImport
}: Props) {
  const [mfg, setMfg] = useState<ManufactureFile>(() => emptyManufacture())
  const [contourCandidates, setContourCandidates] = useState<DerivedContourCandidate[]>([])
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now())
  const [opFilter, setOpFilter] = useState<ManufactureOpFilter>(() => readPersistedManufactureOpFilter('all'))
  const [actionableOnly, setActionableOnly] = useState<boolean>(() => readPersistedManufactureActionableOnly(false))
  const [selectedOpIndex, setSelectedOpIndex] = useState(0)
  const [fabPlanSidebarCollapsed, setFabPlanSidebarCollapsed] = useState(false)
  const [fitStockPadMm, setFitStockPadMm] = useState(2)
  const fab = window.fab

  useEffect(() => {
    setSelectedOpIndex((i) => {
      if (mfg.operations.length === 0) return 0
      return Math.min(Math.max(0, i), mfg.operations.length - 1)
    })
  }, [mfg.operations.length])

  useEffect(() => {
    if (!projectDir) {
      setMfg(emptyManufacture())
      return
    }
    void fab
      .manufactureLoad(projectDir)
      .then(setMfg)
      .catch((e) => {
        onStatus?.(e instanceof Error ? e.message : String(e))
        setMfg(emptyManufacture())
      })
  }, [fab, projectDir])

  useEffect(() => {
    if (!projectDir) {
      setContourCandidates([])
      return
    }
    void loadContourCandidates()
  }, [projectDir])

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTickMs(Date.now())
    }, 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    writePersistedManufactureOpFilter(opFilter)
  }, [opFilter])

  useEffect(() => {
    writePersistedManufactureActionableOnly(actionableOnly)
  }, [actionableOnly])

  async function loadContourCandidates(): Promise<void> {
    if (!projectDir) return
    const d = await fab.designLoad(projectDir)
    if (!d) {
      setContourCandidates([])
      return
    }
    setContourCandidates(listContourCandidatesFromDesign(d))
  }

  const save = useCallback(async () => {
    if (!projectDir) return
    try {
      await fab.manufactureSave(projectDir, JSON.stringify(mfg))
      onStatus?.('Manufacture plan saved.')
      onAfterSave?.()
    } catch (e) {
      onStatus?.(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir, mfg, onStatus, onAfterSave])

  async function runFdmSliceFromOp(opIndex: number): Promise<void> {
    if (!projectDir) return
    const op = mfg.operations[opIndex]
    if (!op || op.kind !== 'fdm_slice') return
    const rel = op.sourceMesh?.trim()
    if (!rel) {
      onStatus?.('Set source mesh path (e.g. assets/model.stl) for this FDM operation.')
      return
    }
    const settings = await fab.settingsGet()
    if (!settings.curaEnginePath?.trim()) {
      onStatus?.('Configure CuraEngine path under File → Settings.')
      return
    }
    const sep = projectDir.includes('\\') ? '\\' : '/'
    const stlPath = `${projectDir}${sep}${rel.replace(/\//g, sep)}`
    const out = `${projectDir}${sep}output${sep}fdm_slice_${op.id}.gcode`
    const curaEngineSettings = Object.fromEntries(mergeCuraSliceInvocationSettings(settings))
    const r = await fab.sliceCura({
      stlPath,
      outPath: out,
      curaEnginePath: settings.curaEnginePath,
      definitionsPath: settings.curaDefinitionsPath,
      definitionPath: settings.curaMachineDefinitionPath?.trim() || undefined,
      slicePreset: settings.curaSlicePreset ?? 'balanced',
      curaEngineSettings
    })
    if (!r.ok) {
      onStatus?.(`FDM slice failed: ${r.stderr ?? 'unknown error'}`)
      return
    }
    onStatus?.(`FDM slice wrote ${out}`)
  }

  function addSetup(): void {
    const id = crypto.randomUUID()
    const st: ManufactureSetup = {
      id,
      label: `Setup ${mfg.setups.length + 1}`,
      machineId: machines[0]?.id ?? 'laguna-swift-5x10',
      workCoordinateIndex: 1,
      stock: { kind: 'box', x: 200, y: 200, z: 25 }
    }
    setMfg((m) => ({ ...m, setups: [...m.setups, st] }))
  }

  function updateSetup(i: number, patch: Partial<ManufactureSetup>): void {
    setMfg((m) => {
      const setups = [...m.setups]
      setups[i] = { ...setups[i]!, ...patch }
      return { ...m, setups }
    })
  }

  function updateSetupStock(i: number, patch: Partial<NonNullable<ManufactureSetup['stock']>>): void {
    setMfg((m) => {
      const setups = [...m.setups]
      const cur = setups[i]!
      const stock = { kind: 'box' as const, x: 200, y: 200, z: 25, ...cur.stock, ...patch }
      setups[i] = { ...cur, stock }
      return { ...m, setups }
    })
  }

  function removeSetup(i: number): void {
    setMfg((m) => ({ ...m, setups: m.setups.filter((_, j) => j !== i) }))
  }

  function addOp(): void {
    const id = crypto.randomUUID()
    const op: ManufactureOperation = {
      id,
      kind: 'cnc_parallel',
      label: `Op ${mfg.operations.length + 1}`,
      sourceMesh: 'assets/design-sample.stl'
    }
    setMfg((m) => ({ ...m, operations: [...m.operations, op] }))
  }

  function updateOp(i: number, patch: Partial<ManufactureOperation>): void {
    setMfg((m) => {
      const ops = [...m.operations]
      ops[i] = { ...ops[i]!, ...patch }
      return { ...m, operations: ops }
    })
  }

  function removeOp(i: number): void {
    setMfg((m) => ({ ...m, operations: m.operations.filter((_, j) => j !== i) }))
  }

  function toolDiameterFieldValue(op: ManufactureOperation): string {
    const v = op.params?.['toolDiameterMm']
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v === 'string' && v.trim() !== '') return v
    return ''
  }

  function setToolDiameterMm(i: number, raw: string): void {
    const op = mfg.operations[i]!
    const base: Record<string, unknown> = { ...(op.params ?? {}) }
    const t = raw.trim()
    if (t === '') {
      delete base.toolDiameterMm
    } else {
      const n = Number.parseFloat(t)
      if (Number.isFinite(n) && n > 0) base.toolDiameterMm = n
      else delete base.toolDiameterMm
    }
    updateOp(i, { params: Object.keys(base).length ? base : undefined })
  }

  function setToolFromLibrary(i: number, toolId: string): void {
    const op = mfg.operations[i]!
    const base: Record<string, unknown> = { ...(op.params ?? {}) }
    if (!toolId) {
      delete base.toolId
    } else {
      base.toolId = toolId
      const rec = tools?.tools.find((t) => t.id === toolId)
      if (rec) {
        base.toolDiameterMm = rec.diameterMm
        const hasFeed =
          typeof base.feedMmMin === 'number' && Number.isFinite(base.feedMmMin) && base.feedMmMin > 0
        const hint = estimateFeedMmMinFromTool(rec)
        if (!hasFeed && hint != null) base.feedMmMin = hint
      }
    }
    updateOp(i, { params: Object.keys(base).length ? base : undefined })
  }

  function cutParamFieldValue(op: ManufactureOperation, key: string): string {
    const v = op.params?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v === 'string' && v.trim() !== '') return v
    return ''
  }

  function setCutParam(i: number, key: string, raw: string, mode: 'nonzero' | 'positive' | 'nonnegative'): void {
    const op = mfg.operations[i]!
    const base: Record<string, unknown> = { ...(op.params ?? {}) }
    const t = raw.trim()
    if (t === '') {
      delete base[key]
    } else {
      const n = Number.parseFloat(t)
      if (!Number.isFinite(n)) {
        delete base[key]
      } else if (mode === 'nonzero') {
        if (n === 0) delete base[key]
        else base[key] = n
      } else if (mode === 'positive') {
        if (n <= 0) delete base[key]
        else base[key] = n
      } else if (n < 0) {
        delete base[key]
      } else {
        base[key] = n
      }
    }
    updateOp(i, { params: Object.keys(base).length ? base : undefined })
  }

  function geometryJsonFieldValue(op: ManufactureOperation, key: 'contourPoints' | 'drillPoints'): string {
    const v = op.params?.[key]
    if (!Array.isArray(v)) return ''
    try {
      return JSON.stringify(v)
    } catch {
      return ''
    }
  }

  function setGeometryJson(i: number, key: 'contourPoints' | 'drillPoints', raw: string): void {
    const op = mfg.operations[i]!
    const base: Record<string, unknown> = { ...(op.params ?? {}) }
    const t = raw.trim()
    if (t === '') {
      delete base[key]
      updateOp(i, { params: Object.keys(base).length ? base : undefined })
      return
    }
    try {
      const parsed = JSON.parse(t) as unknown
      if (Array.isArray(parsed)) {
        base[key] = parsed
        updateOp(i, { params: base })
      }
    } catch {
      // Keep last valid JSON until user input is valid again.
    }
  }

  async function deriveOpGeometryFromSketch(i: number): Promise<void> {
    if (!projectDir) return
    const op = mfg.operations[i]
    if (!op) return
    const d = await fab.designLoad(projectDir)
    if (!d) {
      onStatus?.('No design/sketch.json found to derive geometry from.')
      return
    }
    const base: Record<string, unknown> = { ...(op.params ?? {}) }
    if (op.kind === 'cnc_contour' || op.kind === 'cnc_pocket') {
      const sourceId = typeof base['contourSourceId'] === 'string' ? base['contourSourceId'] : undefined
      const selected = sourceId ? listContourCandidatesFromDesign(d).find((c) => c.sourceId === sourceId) : undefined
      const contour = deriveContourPointsFromDesign(d, sourceId)
      if (contour.length < 3) {
        onStatus?.('No closed sketch profile found for contour/pocket derive.')
        return
      }
      base.contourPoints = contour
      if (selected) {
        base.contourSourceLabel = selected.label
        base.contourSourceSignature = selected.signature
      } else {
        delete base.contourSourceLabel
        delete base.contourSourceSignature
      }
      base.contourDerivedAt = new Date().toISOString()
      updateOp(i, { params: base })
      onStatus?.(`Derived contourPoints (${contour.length} vertices) from selected sketch profile.`)
      return
    }
    if (op.kind === 'cnc_drill') {
      const drill = deriveDrillPointsFromDesign(d)
      if (drill.length === 0) {
        onStatus?.('No circles found in sketch to derive drill points.')
        return
      }
      base.drillPoints = drill
      base.drillDerivedAt = new Date().toISOString()
      updateOp(i, { params: base })
      onStatus?.(`Derived drillPoints (${drill.length} holes) from sketch circles.`)
    }
  }

  function contourDriftState(op: ManufactureOperation): 'ok' | 'missing' | 'changed' | 'unknown' {
    if (!(op.kind === 'cnc_contour' || op.kind === 'cnc_pocket')) return 'unknown'
    const sourceId = typeof op.params?.['contourSourceId'] === 'string' ? op.params['contourSourceId'] : ''
    const sig = typeof op.params?.['contourSourceSignature'] === 'string' ? op.params['contourSourceSignature'] : ''
    if (!sourceId || !sig) return 'unknown'
    const cur = contourCandidates.find((c) => c.sourceId === sourceId)
    if (!cur) return 'missing'
    if (cur.signature !== sig) return 'changed'
    return 'ok'
  }

  function opReadiness(
    op: ManufactureOperation
  ): {
    label: 'ready' | 'missing geometry' | 'stale geometry' | 'suppressed' | 'non-cam'
    bg: string
  } {
    if (op.suppressed) return { label: 'suppressed', bg: '#334155' }
    if (isManufactureKindBlockedFromCam(op.kind)) {
      return { label: 'non-cam', bg: '#475569' }
    }
    if (op.kind === 'cnc_contour' || op.kind === 'cnc_pocket') {
      const contour = op.params?.['contourPoints']
      if (!Array.isArray(contour) || contour.length < 3) return { label: 'missing geometry', bg: '#7f1d1d' }
      const drift = contourDriftState(op)
      if (drift === 'changed' || drift === 'missing') return { label: 'stale geometry', bg: '#92400e' }
      return { label: 'ready', bg: '#14532d' }
    }
    if (op.kind === 'cnc_drill') {
      const drill = op.params?.['drillPoints']
      if (!Array.isArray(drill) || drill.length < 1) return { label: 'missing geometry', bg: '#7f1d1d' }
      return { label: 'ready', bg: '#14532d' }
    }
    return { label: 'ready', bg: '#14532d' }
  }

  const readinessCounts = mfg.operations.reduce(
    (acc, op) => {
      const r = opReadiness(op).label
      acc[r] = (acc[r] ?? 0) + 1
      return acc
    },
    { ready: 0, 'missing geometry': 0, 'stale geometry': 0, suppressed: 0, 'non-cam': 0 } as Record<
      'ready' | 'missing geometry' | 'stale geometry' | 'suppressed' | 'non-cam',
      number
    >
  )

  const filteredOps = mfg.operations.filter((op) => {
    const label = opReadiness(op).label
    if (actionableOnly) return label === 'missing geometry' || label === 'stale geometry'
    if (opFilter === 'all') return true
    return label === opFilter
  })
  const activeFilterLabel = actionableOnly
    ? 'actionable only'
    : opFilter === 'all'
      ? 'all'
      : opFilter === 'non-cam'
        ? 'not CAM'
        : opFilter

  function filterButtonStyle(active: boolean): React.CSSProperties | undefined {
    if (!active) return undefined
    return {
      background: '#1f2937',
      borderColor: '#9333ea',
      color: '#f3e8ff'
    }
  }

  function handlePanelKeydown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const t = e.target as HTMLElement | null
    const tag = t?.tagName?.toLowerCase() ?? ''
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    const k = e.key.toLowerCase()
    if (k === 'a') {
      setActionableOnly(false)
      setOpFilter('all')
      e.preventDefault()
    } else if (k === 'm') {
      setActionableOnly(false)
      setOpFilter('missing geometry')
      e.preventDefault()
    } else if (k === 's') {
      setActionableOnly(false)
      setOpFilter('stale geometry')
      e.preventDefault()
    } else if (k === 'u') {
      setActionableOnly(false)
      setOpFilter('suppressed')
      e.preventDefault()
    } else if (k === 'f') {
      setActionableOnly((v) => !v)
      e.preventDefault()
    } else if (k === 'c') {
      setActionableOnly(false)
      setOpFilter('all')
      e.preventDefault()
    }
  }

  function formatDerivedAt(raw: string): string {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    const deltaSec = Math.max(0, Math.floor((nowTickMs - d.getTime()) / 1000))
    const age =
      deltaSec < 10
        ? 'just now'
        : deltaSec < 60
          ? `${deltaSec}s ago`
          : deltaSec < 3600
            ? `${Math.floor(deltaSec / 60)}m ago`
            : deltaSec < 86400
              ? `${Math.floor(deltaSec / 3600)}h ago`
              : `${Math.floor(deltaSec / 86400)}d ago`
    return `${d.toLocaleString()} (${age})`
  }

  const camMachine = resolveManufactureCamMachine(mfg, machines)

  const camRunCncMachineId = useMemo(() => {
    const cnc = machines.filter((m) => m.kind === 'cnc')
    if (cnc.length === 0) return undefined
    if (activeMachineId && cnc.some((m) => m.id === activeMachineId)) return activeMachineId
    return cnc[0]?.id
  }, [machines, activeMachineId])

  const camResolvedSetup = useMemo(
    () => resolveManufactureSetupForCam(mfg, camRunCncMachineId),
    [mfg, camRunCncMachineId]
  )

  const camResolvedSetupIdx = useMemo(() => {
    if (!camResolvedSetup) return 0
    const i = mfg.setups.findIndex((s) => s.id === camResolvedSetup.id)
    return i >= 0 ? i : 0
  }, [mfg.setups, camResolvedSetup])

  const camResolvedMachineName = useMemo(() => {
    if (!camResolvedSetup) return undefined
    return machines.find((m) => m.id === camResolvedSetup.machineId)?.name ?? camResolvedSetup.machineId
  }, [machines, camResolvedSetup])

  const activeMachine = useMemo(
    () => machines.find((x) => x.id === project?.activeMachineId),
    [machines, project?.activeMachineId]
  )

  /** CNC profile for CAM simulation envelope (same id logic as Make → Generate CAM). */
  const camSimMachine = useMemo(
    () =>
      camRunCncMachineId
        ? machines.find((m) => m.id === camRunCncMachineId && m.kind === 'cnc')
        : undefined,
    [machines, camRunCncMachineId]
  )

  const assetStlOptions = useMemo(() => {
    const paths = new Set<string>()
    for (const m of project?.meshes ?? []) {
      if (m.toLowerCase().endsWith('.stl')) paths.add(m.replace(/\\/g, '/'))
    }
    for (const h of project?.importHistory ?? []) {
      const p = h.assetRelativePath.replace(/\\/g, '/')
      if (p.toLowerCase().endsWith('.stl')) paths.add(p)
    }
    return [...paths].sort((a, b) => a.localeCompare(b))
  }, [project?.meshes, project?.importHistory])

  async function importMeshForSelectedOp(): Promise<void> {
    if (!projectDir) return
    const py = settings?.pythonPath?.trim() || 'python'
    const filters = [{ name: 'Mesh', extensions: [...MESH_IMPORT_FILE_EXTENSIONS] }]
    const path = await fab.dialogOpenFile(filters, projectDir)
    if (!path) return
    const r = await fab.assetsImportMesh(projectDir, path, py)
    if (!r.ok) {
      onStatus?.(r.error + (r.detail ? ` — ${r.detail}` : ''))
      return
    }
    if (mfg.operations.length === 0) {
      onStatus?.('Add an operation first, then import a mesh to bind it.')
      return
    }
    const relPath = r.relativePath.replace(/\\/g, '/')
    setMfg((m) => {
      const idx = Math.min(selectedOpIndex, m.operations.length - 1)
      const ops = [...m.operations]
      ops[idx] = { ...ops[idx]!, sourceMesh: relPath }
      return { ...m, operations: ops }
    })
    onStatus?.(`Imported mesh → ${relPath}`)
    await onAfterMeshImport?.()
  }

  async function fitStockFromPartOnSetup(setupIndex: number): Promise<void> {
    if (!projectDir) return
    const op = mfg.operations[selectedOpIndex]
    const rel = op?.sourceMesh?.trim()
    if (!rel) {
      onStatus?.('Select an operation with a source mesh (.stl) first.')
      return
    }
    try {
      const r = await fab.assemblyReadStlBase64(projectDir, rel)
      if (!r.ok) {
        onStatus?.(r.error)
        return
      }
      const bin = atob(r.base64)
      const u8 = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
      const bbox = computeBinaryStlBoundingBox(u8)
      if (!bbox) {
        onStatus?.('Could not read STL bounds (binary STL required).')
        return
      }
      const dim = stockBoxDimensionsFromPartBounds(bbox, Math.max(0, fitStockPadMm))
      updateSetupStock(setupIndex, {
        kind: 'box',
        x: dim.x,
        y: dim.y,
        z: dim.z,
        allowanceMm: fitStockPadMm > 0 ? fitStockPadMm : undefined
      })
      onStatus?.(
        `Stock set to ${dim.x.toFixed(2)}×${dim.y.toFixed(2)}×${dim.z.toFixed(2)} mm (part AABB + ${fitStockPadMm} mm/side).`
      )
    } catch (e) {
      onStatus?.(e instanceof Error ? e.message : String(e))
    }
  }

  const auxPanelProps = {
    machines,
    settings,
    project,
    projectDir,
    tools: tools ?? null,
    projectTools,
    machineTools,
    activeMachine,
    sliceOut,
    camOut,
    camLastHint,
    importText,
    onImportTextChange,
    onSaveSettingsField,
    onRunSlice,
    onRunCam,
    onImportTools,
    onImportToolLibraryFromFile,
    onMigrateProjectToolsToMachine,
    manufacture: mfg,
    onGoSettings,
    onGoProject
  }

  const planBody =
    !projectDir ? (
      <p className="msg panel">Open a project for manufacture setups and operations.</p>
    ) : (
      <div className="panel manufacture-plan-root" tabIndex={0} onKeyDown={handlePanelKeydown}>
      <h2>Manufacture</h2>
      <div
        className={`manufacture-plan-layout${fabPlanSidebarCollapsed ? ' manufacture-plan-layout--sidebar-collapsed' : ''}`}
      >
        <div className="manufacture-plan-viewport-col">
          <div className="row row--align-center manufacture-plan-toolbar">
            <button type="button" className="secondary" onClick={() => setFabPlanSidebarCollapsed((c) => !c)}>
              {fabPlanSidebarCollapsed ? 'Show job panel' : 'Hide job panel'}
            </button>
            <span className="msg msg--muted msg--xs">
              3D workspace uses the operation marked <strong>3D preview</strong> below for mesh + tool proxy.
            </span>
          </div>
          <ManufactureCamSimulationPanel
            projectDir={projectDir}
            mfg={mfg}
            tools={tools ?? null}
            machine={camSimMachine}
            layout="workspace"
            stockSetupIndex={camResolvedSetupIdx}
            previewMeshRelativePath={mfg.operations[selectedOpIndex]?.sourceMesh?.trim() ?? null}
            previewOperation={mfg.operations[selectedOpIndex] ?? null}
          />
        </div>
        <aside
          className={`manufacture-plan-sidebar${fabPlanSidebarCollapsed ? ' manufacture-plan-sidebar--collapsed' : ''}`}
          aria-hidden={fabPlanSidebarCollapsed}
        >
      {project && projectDir && onSaveActiveMachineId ? (
        <ManufactureSetupStrip
          project={project}
          machines={machines}
          machineToolCount={machineTools?.tools.length ?? 0}
          projectToolCount={projectTools?.tools.length ?? 0}
          onActiveMachineChange={onSaveActiveMachineId}
          onGoSettings={onGoSettings}
          onGoProject={onGoProject}
        />
      ) : null}
      <p className="msg">
        <strong>Plan</strong> sidebar: machine, stock, operations. Use <strong>Slice</strong> / <strong>CAM</strong> tabs for
        Cura and toolpath runs; meshes live under <code>assets/</code>.
      </p>
      <p className="msg manufacture-gcode-safety">
        Any generated G-code is <strong>unverified</strong> until you check posts, units, and clearances for your machine (
        <code>docs/MACHINES.md</code>).
      </p>
      {camResolvedSetup ? (
        <section className="panel panel--nested" aria-label="CAM setup context for Make Generate CAM">
          <h3 className="subh">Setup for Make → Generate CAM</h3>
          <p className="msg msg--muted">
            Uses the manufacture setup whose machine matches the project&apos;s active CNC machine (or the first CNC
            machine). Current row: <strong>{camResolvedSetup.label}</strong>
            {camResolvedMachineName ? (
              <>
                {' '}
                — <strong>{camResolvedMachineName}</strong>
              </>
            ) : null}
            , work offset <strong>G{53 + (camResolvedSetup.workCoordinateIndex ?? 1)}</strong>
            {camResolvedSetup.wcsNote ? (
              <>
                . WCS: {camResolvedSetup.wcsNote}
              </>
            ) : null}
            {camResolvedSetup.stock?.kind === 'box' &&
            camResolvedSetup.stock.x != null &&
            camResolvedSetup.stock.y != null &&
            camResolvedSetup.stock.z != null ? (
              <>
                . Stock (box): {camResolvedSetup.stock.x}×{camResolvedSetup.stock.y}×{camResolvedSetup.stock.z} mm
              </>
            ) : camResolvedSetup.stock?.kind === 'cylinder' ? (
              <>. Stock: cylinder (see dimensions on setup)</>
            ) : camResolvedSetup.stock?.kind === 'fromExtents' ? (
              <>. Stock: from part extents (preview) — use Fit stock from part to persist a box.</>
            ) : null}
            . <code>contourPoints</code> / <code>drillPoints</code> are in this WCS.
          </p>
        </section>
      ) : mfg.setups.length === 0 ? (
        <p className="msg msg--muted">Add a setup so work offset and stock context are defined for CAM.</p>
      ) : null}
      <div className="row row--wrap manufacture-fab-import-row">
        <button type="button" className="secondary" onClick={() => void importMeshForSelectedOp()}>
          Import mesh into project…
        </button>
        <label>
          Bind STL from project
          <select
            value={mfg.operations[selectedOpIndex]?.sourceMesh ?? ''}
            onChange={(e) => {
              if (mfg.operations.length === 0) return
              updateOp(selectedOpIndex, { sourceMesh: e.target.value || undefined })
            }}
            disabled={mfg.operations.length === 0}
          >
            <option value="">—</option>
            {assetStlOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fit padding (mm)
          <input
            type="number"
            min={0}
            step={0.5}
            value={fitStockPadMm}
            onChange={(e) => setFitStockPadMm(Number.parseFloat(e.target.value) || 0)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => void fitStockFromPartOnSetup(camResolvedSetupIdx)}
          title="Set CAM setup stock to axis-aligned box from selected op STL + padding"
        >
          Fit stock from part
        </button>
      </div>
      <div className="row">
        <button type="button" className="secondary" onClick={addSetup}>
          Add setup
        </button>
        <button type="button" className="secondary" onClick={addOp}>
          Add operation
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          Save manufacture.json
        </button>
      </div>

      <h3 className="subh">Setups</h3>
      <ul className="tools entity-list entity-list--stack">
        {mfg.setups.map((s, si) => (
          <li key={s.id}>
            <div className="row">
              <label>
                Label
                <input value={s.label} onChange={(e) => updateSetup(si, { label: e.target.value })} />
              </label>
              <label>
                Machine
                <select
                  value={s.machineId}
                  onChange={(e) => updateSetup(si, { machineId: e.target.value })}
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                WCS note
                <input
                  value={s.wcsNote ?? ''}
                  onChange={(e) => updateSetup(si, { wcsNote: e.target.value || undefined })}
                  placeholder="e.g. Z0 on top of stock"
                />
              </label>
              <label>
                Fixture note
                <input
                  value={s.fixtureNote ?? ''}
                  onChange={(e) => updateSetup(si, { fixtureNote: e.target.value || undefined })}
                  placeholder="e.g. soft jaws, pin against Y+"
                />
              </label>
              <label>
                Work offset
                <select
                  value={String(s.workCoordinateIndex ?? 1)}
                  onChange={(e) =>
                    updateSetup(si, { workCoordinateIndex: Number.parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 5 | 6 })
                  }
                >
                  <option value="1">G54 (1)</option>
                  <option value="2">G55 (2)</option>
                  <option value="3">G56 (3)</option>
                  <option value="4">G57 (4)</option>
                  <option value="5">G58 (5)</option>
                  <option value="6">G59 (6)</option>
                </select>
              </label>
              <button type="button" className="secondary" onClick={() => removeSetup(si)}>
                Remove setup
              </button>
            </div>
            <div className="row">
              <label>
                Stock kind
                <select
                  value={s.stock?.kind ?? 'box'}
                  onChange={(e) =>
                    updateSetupStock(si, { kind: e.target.value as 'box' | 'cylinder' | 'fromExtents' })
                  }
                >
                  <option value="box">Box</option>
                  <option value="cylinder">Cylinder</option>
                  <option value="fromExtents">From extents</option>
                </select>
              </label>
              <label>
                Stock X (mm)
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={s.stock?.x ?? ''}
                  onChange={(e) => updateSetupStock(si, { x: e.target.value ? Number(e.target.value) : undefined })}
                />
              </label>
              <label>
                Stock Y (mm)
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={s.stock?.y ?? ''}
                  onChange={(e) => updateSetupStock(si, { y: e.target.value ? Number(e.target.value) : undefined })}
                />
              </label>
              <label>
                Stock Z (mm)
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={s.stock?.z ?? ''}
                  onChange={(e) => updateSetupStock(si, { z: e.target.value ? Number(e.target.value) : undefined })}
                />
              </label>
              <label>
                Allowance (mm)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={s.stock?.allowanceMm ?? ''}
                  onChange={(e) =>
                    updateSetupStock(si, { allowanceMm: e.target.value ? Number(e.target.value) : undefined })
                  }
                  placeholder="roughing"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="subh">Operations</h3>
      <p className="msg">
        <strong>Make → Generate CAM</strong> uses the <em>first non-suppressed operation</em> here for strategy (kind +
        <code>params</code>). <strong>Tool diameter</strong> and default <strong>feeds / Z / stepover</strong> still resolve
        from the first non-suppressed <code>cnc_*</code> row. <code>fdm_slice</code> and <code>export_stl</code> are not CNC
        toolpaths — use the <strong>Slice</strong> tab or Design/assets export, or put a <code>cnc_*</code> row first for Make. Run
        toolpaths from <strong>Manufacture → CAM</strong> (<strong>Generate toolpath…</strong>); then{' '}
        <strong>Preview G-code analysis</strong>{' '}
        (text-only stats — not machine simulation) and optional <strong>Last run</strong> details show engine choice
        (OpenCAMLib vs built-in fallback) plus reason.
      </p>
      <div className="row row--align-center-8">
        <span className="msg msg-row-flex">
          CAM readiness: {readinessCounts.ready} ready, {readinessCounts['non-cam']} not CAM,{' '}
          {readinessCounts['stale geometry']} stale, {readinessCounts['missing geometry']} missing,{' '}
          {readinessCounts.suppressed} suppressed (filter: {activeFilterLabel})
        </span>
        <button
          type="button"
          className="secondary"
          style={filterButtonStyle(!actionableOnly && opFilter === 'all')}
          onClick={() => setOpFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className="secondary"
          style={filterButtonStyle(!actionableOnly && opFilter === 'missing geometry')}
          onClick={() => setOpFilter('missing geometry')}
        >
          Missing
        </button>
        <button
          type="button"
          className="secondary"
          style={filterButtonStyle(!actionableOnly && opFilter === 'stale geometry')}
          onClick={() => setOpFilter('stale geometry')}
        >
          Stale
        </button>
        <button
          type="button"
          className="secondary"
          style={filterButtonStyle(!actionableOnly && opFilter === 'suppressed')}
          onClick={() => setOpFilter('suppressed')}
        >
          Suppressed
        </button>
        <button
          type="button"
          className="secondary"
          style={filterButtonStyle(!actionableOnly && opFilter === 'non-cam')}
          onClick={() => setOpFilter('non-cam')}
          title="fdm_slice and export_stl rows (blocked from Make → Generate CAM)"
        >
          Not CAM
        </button>
        <label className={`chk mfg-actionable-toggle${actionableOnly ? ' mfg-actionable-toggle--on' : ''}`}>
          <input type="checkbox" checked={actionableOnly} onChange={(e) => setActionableOnly(e.target.checked)} />
          Show actionable only
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setActionableOnly(false)
            setOpFilter('all')
          }}
        >
          Clear filters
        </button>
      </div>
      <p className="msg">
        Shortcuts (panel focused): <code>A</code> all, <code>M</code> missing, <code>S</code> stale, <code>U</code>{' '}
        suppressed, <code>N</code> not CAM, <code>F</code> actionable toggle, <code>C</code> clear.
      </p>
      <ul className="tools entity-list entity-list--stack">
        {filteredOps.map((op) => {
          const i = mfg.operations.findIndex((x) => x.id === op.id)
          return (
          <li key={op.id} className={selectedOpIndex === i ? 'manufacture-op-li manufacture-op-li--selected' : 'manufacture-op-li'}>
            <div className="row">
              <button
                type="button"
                className={selectedOpIndex === i ? 'primary' : 'secondary'}
                onClick={() => setSelectedOpIndex(i)}
                title="Use this operation’s source mesh in the 3D workspace"
              >
                3D preview
              </button>
              <label>
                Label
                <input value={op.label} onChange={(e) => updateOp(i, { label: e.target.value })} />
              </label>
              <span
                className="status-chip"
                title={
                  opReadiness(op).label === 'non-cam'
                    ? 'FDM slice / export STL — not generated by Make → Generate CAM'
                    : 'Operation CAM readiness'
                }
                style={{ background: opReadiness(op).bg }}
              >
                {opReadiness(op).label === 'non-cam' ? 'Not CAM' : opReadiness(op).label}
              </span>
              {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
                <span
                  className="status-chip"
                  title="Sketch profile drift status"
                  style={{
                    background:
                      contourDriftState(op) === 'changed' || contourDriftState(op) === 'missing'
                        ? '#7f1d1d'
                        : contourDriftState(op) === 'ok'
                          ? '#14532d'
                          : '#1f2937'
                  }}
                >
                  {contourDriftState(op) === 'changed'
                    ? 'Profile stale'
                    : contourDriftState(op) === 'missing'
                      ? 'Profile missing'
                      : contourDriftState(op) === 'ok'
                        ? 'Profile synced'
                        : 'Profile unknown'}
                </span>
              ) : null}
              <label>
                Kind
                <select
                  value={op.kind}
                  onChange={(e) => updateOp(i, { kind: e.target.value as ManufactureOperation['kind'] })}
                >
                  <option value="fdm_slice">FDM slice</option>
                  <option value="cnc_parallel">CNC parallel</option>
                  <option value="cnc_contour">CNC contour</option>
                  <option value="cnc_pocket">CNC pocket</option>
                  <option value="cnc_drill">CNC drill</option>
                  <option value="cnc_adaptive">CNC adaptive (OCL AdaptiveWaterline or fallback)</option>
                  <option value="cnc_waterline">CNC waterline (OCL Z-level or fallback)</option>
                  <option value="cnc_raster">CNC raster (OCL or mesh / bounds)</option>
                  <option value="cnc_pencil">CNC pencil (tight OCL raster / rest cleanup)</option>
                  <option value="export_stl">Export STL</option>
                </select>
              </label>
              <label>
                Source mesh
                <input
                  value={op.sourceMesh ?? ''}
                  onChange={(e) => updateOp(i, { sourceMesh: e.target.value })}
                  placeholder="assets/model.stl"
                />
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={!!op.suppressed}
                  onChange={(e) => updateOp(i, { suppressed: e.target.checked })}
                />
                Suppressed
              </label>
              <button type="button" className="secondary" onClick={() => removeOp(i)}>
                Remove
              </button>
            </div>
            {cncOp(op.kind) ? (
              <div className="row">
                <label>
                  Tool Ø (mm) for CAM
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={toolDiameterFieldValue(op)}
                    onChange={(e) => setToolDiameterMm(i, e.target.value)}
                    placeholder="default 6 or from library"
                  />
                </label>
                {tools && tools.tools.length > 0 ? (
                  <label>
                    Library tool
                    <select
                      value={typeof op.params?.['toolId'] === 'string' ? op.params['toolId'] : ''}
                      onChange={(e) => setToolFromLibrary(i, e.target.value)}
                    >
                      <option value="">—</option>
                      {tools.tools.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Ø{t.diameterMm} mm)
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {cncOp(op.kind) ? (
              <>
                <div className="row">
                  <label title="Parallel: G1 work Z. Waterline/OCL: slice spacing (mm).">
                    Z pass / slice step (mm)
                    <input
                      type="number"
                      step={0.1}
                      value={cutParamFieldValue(op, 'zPassMm')}
                      onChange={(e) => setCutParam(i, 'zPassMm', e.target.value, 'nonzero')}
                      placeholder={String(CAM_CUT_DEFAULTS.zPassMm)}
                    />
                  </label>
                  <label>
                    Stepover (mm)
                    <input
                      type="number"
                      min={0.01}
                      step={0.1}
                      value={cutParamFieldValue(op, 'stepoverMm')}
                      onChange={(e) => setCutParam(i, 'stepoverMm', e.target.value, 'positive')}
                      placeholder={String(CAM_CUT_DEFAULTS.stepoverMm)}
                    />
                  </label>
                  <label>
                    Feed (mm/min)
                    <input
                      type="number"
                      min={1}
                      step={10}
                      value={cutParamFieldValue(op, 'feedMmMin')}
                      onChange={(e) => setCutParam(i, 'feedMmMin', e.target.value, 'positive')}
                      placeholder={String(CAM_CUT_DEFAULTS.feedMmMin)}
                    />
                  </label>
                  <label>
                    Plunge (mm/min)
                    <input
                      type="number"
                      min={1}
                      step={10}
                      value={cutParamFieldValue(op, 'plungeMmMin')}
                      onChange={(e) => setCutParam(i, 'plungeMmMin', e.target.value, 'positive')}
                      placeholder={String(CAM_CUT_DEFAULTS.plungeMmMin)}
                    />
                  </label>
                  <label>
                    Safe Z (mm)
                    <input
                      type="number"
                      min={0.01}
                      step={0.5}
                      value={cutParamFieldValue(op, 'safeZMm')}
                      onChange={(e) => setCutParam(i, 'safeZMm', e.target.value, 'positive')}
                      placeholder={String(CAM_CUT_DEFAULTS.safeZMm)}
                    />
                  </label>
                </div>
                {op.kind === 'cnc_pencil' ? (
                  <div className="row row--mt-xs">
                    <label title="Multiplies resolved stepover before the tight raster pass (default 0.22). Ignored if pencil stepover mm is set.">
                      Pencil stepover factor
                      <input
                        type="number"
                        min={0.05}
                        max={1}
                        step={0.01}
                        value={cutParamFieldValue(op, 'pencilStepoverFactor')}
                        onChange={(e) => setCutParam(i, 'pencilStepoverFactor', e.target.value, 'positive')}
                        placeholder="0.22"
                      />
                    </label>
                    <label title="Optional fixed pencil stepover in mm (overrides factor).">
                      Pencil stepover (mm)
                      <input
                        type="number"
                        min={0.05}
                        step={0.05}
                        value={cutParamFieldValue(op, 'pencilStepoverMm')}
                        onChange={(e) => setCutParam(i, 'pencilStepoverMm', e.target.value, 'positive')}
                        placeholder="(optional)"
                      />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
            {op.kind === 'cnc_adaptive' ? (
              <p className="msg manufacture-op-hint">
                With <strong>OpenCAMLib</strong> installed for your Python, <strong>Generate CAM</strong> runs{' '}
                <strong>AdaptiveWaterline</strong> on the STL and posts through your machine template; otherwise it
                falls back to the built-in parallel finish from mesh bounds. G-code is{' '}
                <strong>unverified</strong> until you check post, units, and clearances (<code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_waterline' ? (
              <p className="msg manufacture-op-hint">
                With <strong>OpenCAMLib</strong>, <strong>Generate CAM</strong> runs <strong>Z-level waterline</strong>{' '}
                on the STL and posts through your machine template; otherwise it falls back to the built-in parallel
                finish. G-code is <strong>unverified</strong> until post/machine checks (
                <code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_raster' ? (
              <p className="msg manufacture-op-hint">
                <strong>Generate CAM</strong> tries <strong>OpenCAMLib PathDropCutter</strong> XY raster when Python has{' '}
                <code>opencamlib</code>; otherwise a <strong>2.5D mesh height-field</strong> raster, then an{' '}
                <strong>orthogonal bounds</strong> zigzag at fixed Z if needed. G-code is <strong>unverified</strong>{' '}
                until post/machine checks (<code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_pencil' ? (
              <p className="msg manufacture-op-hint">
                <strong>Pencil / rest cleanup:</strong> same OpenCAMLib <strong>raster</strong> path as CNC raster, but the CAM
                runner applies a <strong>tighter stepover</strong> (default <code>pencilStepoverFactor</code> 0.22 × your
                stepover, or set <code>pencilStepoverMm</code>). This is <strong>not</strong> automatic leftover-material
                detection — tune tool and stepover for your prior roughing. G-code is <strong>unverified</strong> (
                <code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_parallel' ? (
              <p className="msg manufacture-op-hint">
                <strong>Generate CAM</strong> uses the built-in <strong>parallel finish</strong> from STL mesh bounds (no
                OpenCAMLib required for this op). G-code is <strong>unverified</strong> until post/machine checks (
                <code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' || op.kind === 'cnc_drill' ? (
              <p className="msg manufacture-op-hint">
                Uses built-in 2D paths when geometry params are provided: <code>contourPoints</code> for contour/pocket,
                <code>drillPoints</code> for drill. Missing or invalid geometry is a hard error (no mesh-bounds parallel
                fallback). G-code is <strong>unverified</strong> until post/machine checks (<code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'fdm_slice' ? (
              <div className="msg manufacture-op-hint">
                <p>
                  Not generated by <strong>Generate CAM</strong>. Run Cura from the <strong>Slice</strong> tab here or use{' '}
                  <strong>Slice with CuraEngine</strong> below (uses <strong>source mesh</strong>, merged slice preset /
                  profiles, and optional machine <code>.def.json</code> (-j) from Settings). G-code is unverified until you
                  match printer profiles — <code>docs/MACHINES.md</code>.
                </p>
                <button type="button" className="secondary" onClick={() => void runFdmSliceFromOp(i)}>
                  Slice with CuraEngine…
                </button>
              </div>
            ) : null}
            {op.kind === 'export_stl' ? (
              <p className="msg manufacture-op-hint">
                Not generated by <strong>Generate CAM</strong>. Export meshes from Design or project <code>assets/</code>.
                Put a <code>cnc_*</code> operation first when you want Make to post CNC toolpaths.
              </p>
            ) : null}
            {op.kind === 'cnc_contour' ? (
              <div className="row">
                <label>
                  Contour side
                  <select
                    value={typeof op.params?.['contourSide'] === 'string' ? op.params['contourSide'] : 'climb'}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      base.contourSide = e.target.value === 'conventional' ? 'conventional' : 'climb'
                      updateOp(i, { params: base })
                    }}
                  >
                    <option value="climb">Climb</option>
                    <option value="conventional">Conventional</option>
                  </select>
                </label>
                <label>
                  Lead-in (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'leadInMm')}
                    onChange={(e) => setCutParam(i, 'leadInMm', e.target.value, 'nonnegative')}
                    placeholder="0"
                  />
                </label>
                <label>
                  Lead-out (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'leadOutMm')}
                    onChange={(e) => setCutParam(i, 'leadOutMm', e.target.value, 'nonnegative')}
                    placeholder="0"
                  />
                </label>
                <label title="When Z pass / slice step is negative, optional step-down between full contour passes (mm).">
                  Z step-down (mm, optional)
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={cutParamFieldValue(op, 'zStepMm')}
                    onChange={(e) => setCutParam(i, 'zStepMm', e.target.value, 'positive')}
                    placeholder="single pass if empty"
                  />
                </label>
              </div>
            ) : null}
            {op.kind === 'cnc_pocket' ? (
              <div className="row">
                <label>
                  Z step-down (mm)
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={cutParamFieldValue(op, 'zStepMm')}
                    onChange={(e) => setCutParam(i, 'zStepMm', e.target.value, 'positive')}
                    placeholder="= Z pass depth"
                  />
                </label>
                <label>
                  Entry mode
                  <select
                    value={typeof op.params?.['entryMode'] === 'string' ? op.params['entryMode'] : 'plunge'}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      base.entryMode = e.target.value === 'ramp' ? 'ramp' : 'plunge'
                      updateOp(i, { params: base })
                    }}
                  >
                    <option value="plunge">Plunge</option>
                    <option value="ramp">Ramp</option>
                  </select>
                </label>
                <label>
                  Ramp length (mm)
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={cutParamFieldValue(op, 'rampMm')}
                    onChange={(e) => setCutParam(i, 'rampMm', e.target.value, 'positive')}
                    placeholder="2"
                  />
                </label>
                {op.params?.['entryMode'] === 'ramp' ? (
                  <label>
                    Ramp max angle (°)
                    <input
                      type="number"
                      min={1}
                      max={89}
                      step={1}
                      value={cutParamFieldValue(op, 'rampMaxAngleDeg')}
                      onChange={(e) => setCutParam(i, 'rampMaxAngleDeg', e.target.value, 'positive')}
                      placeholder="45"
                      title="Max ramp angle from horizontal; XY run is lengthened within each segment when possible."
                    />
                  </label>
                ) : null}
                <label>
                  Wall stock (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'wallStockMm')}
                    onChange={(e) => setCutParam(i, 'wallStockMm', e.target.value, 'nonnegative')}
                    placeholder="0"
                  />
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={op.params?.['finishPass'] !== false}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      base.finishPass = e.target.checked
                      updateOp(i, { params: base })
                    }}
                  />
                  Finish contour pass
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={op.params?.['finishEachDepth'] === true}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      base.finishEachDepth = e.target.checked
                      updateOp(i, { params: base })
                    }}
                  />
                  Finish each depth
                </label>
                <label>
                  Finish side
                  <select
                    value={typeof op.params?.['contourSide'] === 'string' ? op.params['contourSide'] : 'climb'}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      base.contourSide = e.target.value === 'conventional' ? 'conventional' : 'climb'
                      updateOp(i, { params: base })
                    }}
                  >
                    <option value="climb">Climb</option>
                    <option value="conventional">Conventional</option>
                  </select>
                </label>
                <label>
                  Finish lead-in (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'leadInMm')}
                    onChange={(e) => setCutParam(i, 'leadInMm', e.target.value, 'nonnegative')}
                    placeholder="0"
                  />
                </label>
                <label>
                  Finish lead-out (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'leadOutMm')}
                    onChange={(e) => setCutParam(i, 'leadOutMm', e.target.value, 'nonnegative')}
                    placeholder="0"
                  />
                </label>
              </div>
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
              <div className="row">
                <label className="label--wide-420">
                  contourPoints JSON (Array of [x,y] mm)
                  <input
                    value={geometryJsonFieldValue(op, 'contourPoints')}
                    onChange={(e) => setGeometryJson(i, 'contourPoints', e.target.value)}
                    placeholder='[[0,0],[50,0],[50,25],[0,25]]'
                  />
                </label>
                <label>
                  Contour source
                  <select
                    value={typeof op.params?.['contourSourceId'] === 'string' ? op.params['contourSourceId'] : ''}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      if (!e.target.value) delete base.contourSourceId
                      else base.contourSourceId = e.target.value
                      updateOp(i, { params: Object.keys(base).length ? base : undefined })
                    }}
                  >
                    <option value="">first closed profile</option>
                    {contourCandidates.map((c) => (
                      <option key={c.sourceId} value={c.sourceId}>
                        {c.label} ({c.points.length} pts)
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary" onClick={() => void loadContourCandidates()}>
                  Refresh sketch profiles
                </button>
                <button type="button" className="secondary" onClick={() => void deriveOpGeometryFromSketch(i)}>
                  Derive from sketch
                </button>
              </div>
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
              (() => {
                const s = contourPointsStats(op.params?.['contourPoints'])
                return s ? <p className="msg msg--muted">{s}</p> : null
              })()
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
              (() => {
                const sourceId = typeof op.params?.['contourSourceId'] === 'string' ? op.params['contourSourceId'] : ''
                const sig = typeof op.params?.['contourSourceSignature'] === 'string' ? op.params['contourSourceSignature'] : ''
                if (!sourceId || !sig) return null
                const cur = contourCandidates.find((c) => c.sourceId === sourceId)
                if (!cur) {
                  return (
                    <p className="msg manufacture-op-hint">
                      Selected contour source is not present in current sketch; derive again or choose a different profile.
                      <button type="button" className="secondary ml-2" onClick={() => void deriveOpGeometryFromSketch(i)}>
                        Re-derive now
                      </button>
                    </p>
                  )
                }
                if (cur.signature !== sig) {
                  return (
                    <p className="msg manufacture-op-hint">
                      Selected contour profile changed since last derive ({cur.label}). Re-derive to keep CAM geometry in sync.
                      <button type="button" className="secondary ml-2" onClick={() => void deriveOpGeometryFromSketch(i)}>
                        Re-derive now
                      </button>
                    </p>
                  )
                }
                return null
              })()
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
              (() => {
                const derivedAt = typeof op.params?.['contourDerivedAt'] === 'string' ? op.params['contourDerivedAt'] : ''
                if (!derivedAt) return null
                return <p className="msg">Contour derived: {formatDerivedAt(derivedAt)}</p>
              })()
            ) : null}
            {op.kind === 'cnc_contour' || op.kind === 'cnc_pocket' ? (
              <p className="msg manufacture-op-hint">
                <strong>2D contour / pocket:</strong> toolpath XY follows a closed <strong>contourPoints</strong> loop in
                setup WCS; depth and feeds use the cut parameters on this row. Tool diameter must fit inside pockets —
                offset failures return an empty toolpath with a hint. <strong>Pocket</strong> ramp mode may add CAM hints when
                segments are short for the ramp angle. Output is unverified until post/machine checks (
                <code>docs/MACHINES.md</code>).
              </p>
            ) : null}
            {op.kind === 'cnc_drill' ? (
              <p className="msg manufacture-op-hint">
                <strong>Machine-aware cycles:</strong>{' '}
                {camMachine ? (
                  <>
                    first matching setup uses <strong>{camMachine.name}</strong> (<code>{camMachine.dialect}</code>).{' '}
                    {camMachine.dialect === 'grbl' ? (
                      <>
                        Grbl defaults to <strong>expanded</strong> G0/G1 drill moves unless you pick a canned cycle; many
                        Grbl builds omit G81–G83.
                      </>
                    ) : camMachine.dialect === 'mach3' ? (
                      <>
                        Mach-class posts usually emit <strong>G81</strong>/<strong>G82</strong>/<strong>G83</strong> when
                        params match; set <strong>Peck Q</strong> for G83 and <strong>Dwell P</strong> for G82.
                      </>
                    ) : (
                      <>
                        Generic mm post follows the cycle override or auto-selects from peck/dwell; verify R/Q/P on your
                        controller.
                      </>
                    )}
                  </>
                ) : (
                  <>Add a setup with a CNC machine so cycle defaults match your post.</>
                )}{' '}
                <strong>Depth</strong> is <code>zPassMm</code>; <strong>R</strong> uses <code>retractMm</code> or falls back
                to <code>safeZMm</code>.
              </p>
            ) : null}
            {op.kind === 'cnc_drill' ? (
              <div className="row">
                <label className="label--wide-420">
                  drillPoints JSON (Array of [x,y] mm)
                  <input
                    value={geometryJsonFieldValue(op, 'drillPoints')}
                    onChange={(e) => setGeometryJson(i, 'drillPoints', e.target.value)}
                    placeholder='[[10,10],[40,10],[40,30]]'
                  />
                </label>
                <button type="button" className="secondary" onClick={() => void deriveOpGeometryFromSketch(i)}>
                  Derive from sketch circles
                </button>
                <label>
                  Drill cycle
                  <select
                    value={typeof op.params?.['drillCycle'] === 'string' ? op.params['drillCycle'] : ''}
                    onChange={(e) => {
                      const base: Record<string, unknown> = { ...(op.params ?? {}) }
                      if (!e.target.value) delete base.drillCycle
                      else base.drillCycle = e.target.value
                      updateOp(i, { params: Object.keys(base).length ? base : undefined })
                    }}
                  >
                    <option value="">machine default</option>
                    <option value="expanded">expanded (G0/G1)</option>
                    <option value="g81">G81</option>
                    <option value="g82">G82 dwell</option>
                    <option value="g83">G83 peck</option>
                  </select>
                </label>
                <label>
                  Drill retract R (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'retractMm')}
                    onChange={(e) => setCutParam(i, 'retractMm', e.target.value, 'positive')}
                    placeholder="safe Z"
                  />
                </label>
                <label>
                  Peck Q (mm, G83)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={cutParamFieldValue(op, 'peckMm')}
                    onChange={(e) => setCutParam(i, 'peckMm', e.target.value, 'positive')}
                    placeholder="optional"
                  />
                </label>
                <label>
                  Dwell P (ms, G82)
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={cutParamFieldValue(op, 'dwellMs')}
                    onChange={(e) => setCutParam(i, 'dwellMs', e.target.value, 'positive')}
                    placeholder="optional"
                  />
                </label>
              </div>
            ) : null}
            {op.kind === 'cnc_drill' ? (
              <p className="msg manufacture-op-hint">
                <strong>Drill cycles:</strong> Make tab <strong>Generate CAM</strong> merges cycle hints (auto G81/G82/G83
                vs explicit override, peck/dwell fallbacks). Peck depth <strong>Q</strong> must be set for G83; dwell{' '}
                <strong>P</strong> for G82. G-code stays unverified until post/machine checks (<code>docs/MACHINES.md</code>
                ).
              </p>
            ) : null}
            {op.kind === 'cnc_drill' ? (
              (() => {
                const derivedAt = typeof op.params?.['drillDerivedAt'] === 'string' ? op.params['drillDerivedAt'] : ''
                if (!derivedAt) return null
                return <p className="msg">Drill points derived: {formatDerivedAt(derivedAt)}</p>
              })()
            ) : null}
          </li>
          )
        })}
      </ul>
        </aside>
      </div>
    </div>
    )

  return (
    <div className="manufacture-workspace-wrap">
      <ManufactureSubTabStrip tab={panelTab} onChange={onPanelTabChange} />
      <div
        id="manufacture-workspace-panel"
        role="tabpanel"
        aria-labelledby={`mfg-subtab-${panelTab}`}
      >
        {panelTab === 'plan' ? (
          planBody
        ) : panelTab === 'slice' ? (
          <SliceManufacturePanel {...auxPanelProps} />
        ) : panelTab === 'cam' ? (
          <CamManufacturePanel {...auxPanelProps} />
        ) : (
          <ToolsManufacturePanel {...auxPanelProps} />
        )}
      </div>
    </div>
  )
}
