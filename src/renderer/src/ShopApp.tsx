/**
 * ShopApp – Unified Fab Studio
 *
 * Machine-first workflow:
 *   1. MachineSplash   – full-screen picker on every launch
 *   2. Main UI         – toolbar + left panel + viewport, all adapted to the
 *                        selected machine's UI mode (fdm | cnc_2d | cnc_3d |
 *                        cnc_4axis | cnc_5axis)
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState, Fragment
} from 'react'
import type { MachineProfile } from '../../shared/machine-schema'
import type { ManufactureOperation, ManufactureOperationKind } from '../../shared/manufacture-schema'
import type { ToolLibraryFile, ToolRecord } from '../../shared/tool-schema'
import type { MaterialRecord, MaterialCategory } from '../../shared/material-schema'
import { calcCutParams, MATERIAL_CATEGORY_LABELS } from '../../shared/material-schema'
import { CAM_CUT_DEFAULTS, resolveCamCutParamsWithMaterial } from '../../shared/cam-cut-params'
import type { CpsImportSummary } from '../../main/machine-cps-import'
import { ShopModelViewer, defaultTransform } from './ShopModelViewer'
import type { ModelTransform, StockDimensions, GizmoMode } from './ShopModelViewer'
import { generateSetupSheet, parseGcodeStats } from './setup-sheet'
import type { SetupSheetJob } from './setup-sheet'

// ── Electron API ──────────────────────────────────────────────────────────────
declare const window: Window & {
  fab: {
    machinesList: () => Promise<MachineProfile[]>
    machinesCatalog: () => Promise<{ machines: MachineProfile[]; diagnostics: unknown[] }>
    machinesSaveUser: (p: MachineProfile) => Promise<MachineProfile>
    machinesDeleteUser: (id: string) => Promise<boolean>
    machinesImportJson: (text: string) => Promise<MachineProfile>
    machinesImportFile: (filePath: string) => Promise<MachineProfile>
    machinesExportUser: (id: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
    machinesImportCpsFile: (filePath: string) => Promise<CpsImportSummary>
    machinesPickAndImportCps: () => Promise<CpsImportSummary | null>
    settingsGet: () => Promise<{ pythonPath?: string; curaEnginePath?: string; lastMachineId?: string; [k: string]: unknown }>
    settingsSet: (p: Record<string, unknown>) => Promise<Record<string, unknown>>
    dialogOpenFile: (filters: { name: string; extensions: string[] }[], dp?: string) => Promise<string | null>
    dialogOpenFiles: (filters: { name: string; extensions: string[] }[]) => Promise<string[]>
    stlStage: (projectDir: string, stlPath: string) => Promise<string>
    stlTransformForCam: (payload: {
      stlPath: string
      transform: {
        position: { x: number; y: number; z: number }
        rotation: { x: number; y: number; z: number }
        scale: { x: number; y: number; z: number }
      }
    }) => Promise<string>
    camRun: (payload: {
      stlPath: string; outPath: string; machineId: string
      zPassMm: number; stepoverMm: number; feedMmMin: number
      plungeMmMin: number; safeZMm: number; pythonPath: string
      operationKind?: string; toolDiameterMm?: number
      operationParams?: Record<string, unknown>
    }) => Promise<{ ok: boolean; gcode?: string; error?: string; hint?: string; usedEngine?: string }>
    sliceCura: (payload: {
      stlPath: string; outPath: string; curaEnginePath: string
      slicePreset?: string | null
    }) => Promise<{ ok: boolean; stderr?: string }>
    toolsRead: (dir: string) => Promise<ToolLibraryFile>
    toolsSave: (dir: string, lib: ToolLibraryFile) => Promise<void>
    toolsImport: (dir: string, payload: { kind: 'csv' | 'json' | 'fusion' | 'fusion_csv'; content: string }) => Promise<ToolLibraryFile>
    toolsImportFile: (dir: string, filePath: string) => Promise<ToolLibraryFile>
    machineToolsRead: (machineId: string) => Promise<ToolLibraryFile>
    machineToolsSave: (machineId: string, lib: ToolLibraryFile) => Promise<void>
    machineToolsImport: (machineId: string, payload: { kind: string; content: string }) => Promise<ToolLibraryFile>
    machineToolsImportFile: (machineId: string, filePath: string) => Promise<ToolLibraryFile>
    postsList: () => Promise<Array<{ filename: string; path: string; source: 'bundled' | 'user'; preview: string }>>
    postsSave: (filename: string, content: string) => Promise<{ filename: string; path: string; source: 'bundled' | 'user'; preview: string }>
    postsRead: (filename: string) => Promise<string>
    postsUploadFile: (filePath: string) => Promise<{ filename: string; path: string; source: 'bundled' | 'user'; preview: string }>
    postsPickAndUpload: () => Promise<{ filename: string; path: string; source: 'bundled' | 'user'; preview: string } | null>
    moonrakerPush: (payload: { gcodePath: string; printerUrl: string; uploadPath?: string; startAfterUpload?: boolean; timeoutMs?: number }) => Promise<{ ok: boolean; filename?: string; error?: string; detail?: string }>
    moonrakerStatus: (url: string) => Promise<{ ok: boolean; state?: string; filename?: string; progress?: number; etaSeconds?: number; error?: string }>
    moonrakerCancel: (url: string) => Promise<{ ok: boolean; error?: string }>
    materialsList: () => Promise<MaterialRecord[]>
    materialsSave: (record: MaterialRecord) => Promise<MaterialRecord>
    materialsDelete: (id: string) => Promise<boolean>
    materialsImportJson: (jsonText: string) => Promise<MaterialRecord[]>
    materialsImportFile: (filePath: string) => Promise<MaterialRecord[]>
    materialsPickAndImport: () => Promise<MaterialRecord[] | null>
    fsReadBase64: (filePath: string) => Promise<string>
    dialogSaveFile: (filters: { name: string; extensions: string[] }[], defaultPath?: string) => Promise<string | null>
    fsWriteText: (filePath: string, content: string) => Promise<void>
  }
}

const fab = () => window.fab

// ── Toast ─────────────────────────────────────────────────────────────────────
interface Toast { id: number; kind: 'ok' | 'err' | 'warn'; msg: string }
let toastSeq = 0
function useToasts(): [Toast[], (kind: Toast['kind'], msg: string) => void] {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], msg: string) => {
    const id = ++toastSeq
    setToasts(t => [...t, { id, kind, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])
  return [toasts, push]
}

// ── Machine UI mode ────────────────────────────────────────────────────────────
type MachineUIMode = 'fdm' | 'cnc_2d' | 'cnc_3d' | 'cnc_4axis' | 'cnc_5axis'

function getMachineMode(m: MachineProfile): MachineUIMode {
  if (m.kind === 'fdm') return 'fdm'
  const axes = m.axisCount ?? 3
  if (axes >= 5) return 'cnc_5axis'
  if (axes === 4 || m.dialect === 'grbl_4axis') return 'cnc_4axis'
  if (m.meta?.cncProfile === '3d') return 'cnc_3d'
  return 'cnc_2d'
}

const MODE_LABELS: Record<MachineUIMode, string> = {
  fdm: 'FDM Printer', cnc_2d: 'CNC Standard', cnc_3d: 'CNC 3D',
  cnc_4axis: 'CNC 4-Axis', cnc_5axis: 'CNC 5-Axis'
}
const MODE_ICONS: Record<MachineUIMode, string> = {
  fdm: '🖨', cnc_2d: '⊞', cnc_3d: '⬡', cnc_4axis: '↻', cnc_5axis: '✦'
}

// ── Op lists per mode ─────────────────────────────────────────────────────────
interface OpGroups { primary: ManufactureOperationKind[]; secondary: ManufactureOperationKind[] }

const OPS_BY_MODE: Record<MachineUIMode, OpGroups> = {
  fdm: { primary: ['fdm_slice'], secondary: ['export_stl'] },
  cnc_2d: {
    primary: ['cnc_pocket', 'cnc_contour', 'cnc_drill', 'cnc_parallel', 'cnc_adaptive'],
    secondary: ['cnc_waterline', 'cnc_raster', 'cnc_pencil', 'cnc_3d_rough', 'cnc_3d_finish', 'export_stl']
  },
  cnc_3d: {
    primary: ['cnc_3d_rough', 'cnc_3d_finish', 'cnc_waterline', 'cnc_raster', 'cnc_pencil', 'cnc_parallel'],
    secondary: ['cnc_pocket', 'cnc_contour', 'cnc_drill', 'cnc_adaptive', 'export_stl']
  },
  cnc_4axis: {
    primary: ['cnc_4axis_wrapping', 'cnc_4axis_indexed', 'cnc_3d_rough', 'cnc_3d_finish'],
    secondary: ['cnc_waterline', 'cnc_raster', 'cnc_pencil', 'cnc_parallel', 'cnc_pocket', 'cnc_contour', 'cnc_drill', 'export_stl']
  },
  cnc_5axis: {
    primary: ['cnc_4axis_wrapping', 'cnc_4axis_indexed', 'cnc_3d_rough', 'cnc_3d_finish'],
    secondary: ['cnc_waterline', 'cnc_raster', 'cnc_pencil', 'cnc_parallel', 'cnc_pocket', 'cnc_contour', 'cnc_drill', 'export_stl']
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewKind = 'jobs' | 'library' | 'settings'
type LibTab = 'machines' | 'tools' | 'materials' | 'posts'

/**
 * Support post — a cylindrical rod that runs axially through the centre of the
 * workpiece along the rotation axis.  As material is machined away from the
 * outside the post keeps the part tethered to the chuck so it can't fly off.
 * One centre post (count=1, offsetRadiusMm=0) is the most common setup.
 */
interface PostConfig {
  count: number          // 1 = single centre post; 2 or 4 = posts at offset radius
  diameterMm: number     // post diameter (mm)
  offsetRadiusMm: number // radial offset from rotation axis; 0 = centre-line post
}

interface Job {
  id: string; name: string; stlPath: string | null
  machineId: string | null; materialId: string | null
  stock: StockDimensions; transform: ModelTransform
  operations: ManufactureOperation[]
  /** Axial support post(s) through workpiece centre for 4-axis rotary jobs. */
  posts: PostConfig | null
  /** How many mm of stock are inserted into the chuck (5 or 10). Default 5. */
  chuckDepthMm: 5 | 10
  /** Safety buffer between clamped zone and model, shown as orange zone (mm). Default 0. */
  clampOffsetMm: number
  gcodeOut: string | null; status: 'idle' | 'running' | 'done' | 'error'
  lastLog: string; printerUrl: string
}

type MaterialApplyResult = {
  operations: ManufactureOperation[]
  changed: boolean
}

function applyMaterialToOperations(
  operations: ManufactureOperation[],
  materialId: string | null,
  materials: MaterialRecord[],
  tools: ToolRecord[]
): MaterialApplyResult {
  if (!materialId) return { operations, changed: false }
  let changed = false
  const next = operations.map((op) => {
    if (!op.kind.startsWith('cnc_')) return op
    const resolved = resolveCamCutParamsWithMaterial({
      operation: op,
      materialId,
      materials,
      tools
    })
    const prev = (op.params ?? {}) as Record<string, unknown>
    const nextParams: Record<string, unknown> = {
      ...prev,
      zPassMm: resolved.zPassMm,
      stepoverMm: resolved.stepoverMm,
      feedMmMin: resolved.feedMmMin,
      plungeMmMin: resolved.plungeMmMin,
      safeZMm: resolved.safeZMm
    }
    if (
      prev.zPassMm !== nextParams.zPassMm ||
      prev.stepoverMm !== nextParams.stepoverMm ||
      prev.feedMmMin !== nextParams.feedMmMin ||
      prev.plungeMmMin !== nextParams.plungeMmMin ||
      prev.safeZMm !== nextParams.safeZMm
    ) {
      changed = true
      return { ...op, params: nextParams }
    }
    return op
  })
  return { operations: changed ? next : operations, changed }
}

function newJob(name: string, machineId?: string): Job {
  return {
    id: crypto.randomUUID(), name,
    stlPath: null, machineId: machineId ?? null, materialId: null,
    stock: { x: 100, y: 100, z: 20 }, transform: defaultTransform(),
    operations: [], posts: null, chuckDepthMm: 5, clampOffsetMm: 0,
    gcodeOut: null, status: 'idle', lastLog: '', printerUrl: ''
  }
}

function newOp(kind: ManufactureOperationKind): ManufactureOperation {
  const defaults: Record<string, Record<string, unknown>> = {
    cnc_parallel:       { zPassMm: -1,   stepoverMm: 2,   feedMmMin: 1200, plungeMmMin: 400,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_contour:        { zPassMm: -1,   stepoverMm: 2,   feedMmMin: 1200, plungeMmMin: 400,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_pocket:         { zPassMm: -1,   stepoverMm: 2,   feedMmMin: 1200, plungeMmMin: 400,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_drill:          { zPassMm: -5,   feedMmMin: 400,  plungeMmMin: 200, safeZMm: 5, toolDiameterMm: 3 },
    cnc_adaptive:       { zPassMm: -1,   stepoverMm: 3,   feedMmMin: 1500, plungeMmMin: 400,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_waterline:      { zPassMm: -0.5, stepoverMm: 1.5, feedMmMin: 1000, plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_raster:         { zPassMm: -0.5, stepoverMm: 1.5, feedMmMin: 1000, plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 6 },
    cnc_pencil:         { zPassMm: -0.3, stepoverMm: 0.5, feedMmMin: 800,  plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 3 },
    cnc_4axis_wrapping: { zPassMm: -1,   stepoverMm: 2,   feedMmMin: 1000, plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 6, cylinderDiameterMm: 50, wrapAxis: 'x', wrapMode: 'parallel' },
    cnc_4axis_indexed:  { zPassMm: -1,   stepoverMm: 2,   feedMmMin: 1000, plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 6, indexAnglesDeg: [0, 90, 180, 270] },
    cnc_3d_rough:       { zPassMm: -2,   stepoverMm: 4,   feedMmMin: 1500, plungeMmMin: 400,  safeZMm: 5, toolDiameterMm: 8, stockAllowanceMm: 0.5 },
    cnc_3d_finish:      { zPassMm: -0.5, stepoverMm: 1,   feedMmMin: 1000, plungeMmMin: 300,  safeZMm: 5, toolDiameterMm: 6, finishStrategy: 'raster', finishStepoverMm: 0.5 },
    fdm_slice:          { slicePreset: null },
    export_stl:         {}
  }
  return { id: crypto.randomUUID(), kind, label: KIND_LABELS[kind] ?? kind, params: defaults[kind] ?? {} }
}

const KIND_LABELS: Partial<Record<ManufactureOperationKind, string>> = {
  fdm_slice: '3D Print (FDM)', cnc_parallel: 'Parallel Finish',
  cnc_contour: 'Contour', cnc_pocket: 'Pocket', cnc_drill: 'Drill',
  cnc_adaptive: 'Adaptive Clearing', cnc_waterline: 'Waterline',
  cnc_raster: 'Raster', cnc_pencil: 'Pencil / Rest',
  cnc_4axis_wrapping: '4-Axis Wrapping', cnc_4axis_indexed: '4-Axis Indexed',
  cnc_3d_rough: '3D Rough (Adaptive)', cnc_3d_finish: '3D Finish',
  export_stl: 'Export STL'
}

// ── Machine Splash ─────────────────────────────────────────────────────────────
interface SplashProps {
  machines: MachineProfile[]
  lastMachineId: string | null
  onSelect: (m: MachineProfile) => void
  onAddMachine: () => void
}

function MachineSplash({ machines, lastMachineId, onSelect, onAddMachine }: SplashProps): React.ReactElement {
  const [activeMode, setActiveMode] = useState<MachineUIMode | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(lastMachineId)

  const MODES: Array<{ mode: MachineUIMode | 'all'; icon: string; label: string; sub: string }> = [
    { mode: 'all',       icon: '⊡', label: 'All',          sub: 'Show everything' },
    { mode: 'fdm',       icon: '🖨', label: 'FDM Printer',  sub: 'Slicer mode' },
    { mode: 'cnc_2d',    icon: '⊞', label: 'CNC Standard', sub: 'VCarve style' },
    { mode: 'cnc_3d',    icon: '⬡', label: 'CNC 3D',       sub: '3D surfacing' },
    { mode: 'cnc_4axis', icon: '↻', label: '4-Axis CNC',   sub: 'Rotary / indexed' },
    { mode: 'cnc_5axis', icon: '✦', label: '5-Axis CNC',   sub: 'Multi-axis' },
  ]

  const filtered = machines.filter(m => activeMode === 'all' || getMachineMode(m) === activeMode)
  const selectedMachine = machines.find(m => m.id === selectedId) ?? null

  return (
    <div className="machine-splash">
      <div className="splash-logo">⬡</div>
      <div className="splash-title">Unified Fab Studio</div>
      <div className="splash-subtitle">What machine are you working with today?</div>

      <div className="splash-mode-tabs">
        {MODES.map(({ mode, icon, label, sub }) => (
          <button key={mode}
            className={`splash-mode-tab${activeMode === mode ? ' splash-mode-tab--active' : ''}`}
            onClick={() => setActiveMode(mode)}>
            <span className="splash-mode-icon">{icon}</span>
            <span className="splash-mode-label">
              {label}<br />
              <span style={{ fontWeight: 400, opacity: 0.7 }}>{sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="splash-section-title">
        {activeMode === 'all' ? 'All machines' : `${MODES.find(m => m.mode === activeMode)?.label} machines`}
        {' '}({filtered.length})
      </div>

      <div className="splash-grid">
        {filtered.map(m => {
          const mmode = getMachineMode(m)
          return (
            <div key={m.id}
              className={`splash-card splash-card--${mmode}${m.id === selectedId ? ' splash-card--selected' : ''}`}
              onClick={() => setSelectedId(m.id)}>
              <div className="splash-card-badge">{MODE_LABELS[mmode]}</div>
              <div className="splash-card-name">{m.name}</div>
              <div className="splash-card-meta">
                {m.workAreaMm.x} × {m.workAreaMm.y} × {m.workAreaMm.z} mm
                {m.meta?.manufacturer ? ` · ${m.meta.manufacturer}` : ''}
                {m.meta?.importedFromCps ? ' · from .cps' : ''}
              </div>
            </div>
          )
        })}
        <div className="splash-add-card" onClick={onAddMachine}>
          <span style={{ fontSize: 24 }}>+</span>
          <span>Add / import a machine</span>
        </div>
      </div>

      <div className="splash-cta">
        <button
          className="splash-start-btn"
          disabled={!selectedMachine}
          onClick={() => selectedMachine && onSelect(selectedMachine)}>
          {selectedMachine ? `Start with ${selectedMachine.name} →` : 'Select a machine above'}
        </button>
        <span className="splash-start-hint">
          {selectedMachine
            ? `Mode: ${MODE_LABELS[getMachineMode(selectedMachine)]}  ·  ${MODE_ICONS[getMachineMode(selectedMachine)]}`
            : 'Click a machine card, then press Start'}
        </span>
      </div>
    </div>
  )
}

// ── Op params editor ──────────────────────────────────────────────────────────
function OpParamsEditor({ op, onChange, tools }: {
  op: ManufactureOperation
  onChange: (params: Record<string, unknown>) => void
  tools: ToolRecord[]
}): React.ReactElement {
  const p = (op.params ?? {}) as Record<string, unknown>
  const set = (k: string, v: unknown): void => onChange({ ...p, [k]: v })

  const applyTool = (toolId: string): void => {
    if (!toolId) { onChange({ ...p, toolId: undefined }); return }
    const t = tools.find(t => t.id === toolId)
    if (!t) return
    onChange({ ...p, toolId, toolDiameterMm: t.diameterMm })
  }
  const num = (label: string, key: string, step = 'any'): React.ReactElement => (
    <div className="form-group" key={key}>
      <label>{label}</label>
      <input type="number" step={step}
        value={p[key] == null ? '' : String(p[key])}
        onChange={e => set(key, e.target.value === '' ? undefined : +e.target.value)} />
    </div>
  )

  if (op.kind === 'fdm_slice') return (
    <div className="section-gap mt-8">
      <div className="form-group">
        <label>Slice Preset</label>
        <input type="text" value={String(p.slicePreset ?? '')} placeholder="default"
          onChange={e => set('slicePreset', e.target.value || null)} />
      </div>
    </div>
  )
  if (op.kind === 'export_stl') return (
    <div className="text-muted" style={{ padding: '8px 0', fontSize: 11 }}>No parameters — exports staged STL.</div>
  )

  const is4axWrap = op.kind === 'cnc_4axis_wrapping'
  const is4axIdx  = op.kind === 'cnc_4axis_indexed'
  const is3dR     = op.kind === 'cnc_3d_rough'
  const is3dF     = op.kind === 'cnc_3d_finish'

  const TOOL_TYPE_LABEL: Record<string, string> = {
    endmill: 'Flat Endmill', ball: 'Ball Nose', vbit: 'V-Bit',
    drill: 'Drill', face: 'Face Mill', other: 'Other'
  }

  return (
    <div className="section-gap mt-8">
      {/* Tool library picker */}
      {tools.length > 0 && (
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--txt2)' }}>
            Tool from Library
          </label>
          <select
            value={String(p.toolId ?? '')}
            onChange={e => applyTool(e.target.value)}
            style={{ width: '100%' }}>
            <option value="">— Custom / Manual —</option>
            {tools.map(t => (
              <option key={t.id} value={t.id}>
                {t.diameterMm}mm {TOOL_TYPE_LABEL[t.type] ?? t.type}
                {t.name ? ` — ${t.name}` : ''}
                {t.material ? ` (${t.material})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-row-3">
        {num('Tool Ø (mm)', 'toolDiameterMm')}
        {num('Feed (mm/min)', 'feedMmMin')}
        {num('Plunge (mm/min)', 'plungeMmMin')}
      </div>
      <div className="form-row-3">
        {num('Z Pass (mm)', 'zPassMm')}
        {op.kind !== 'cnc_drill' && num('Stepover (mm)', 'stepoverMm')}
        {num('Safe Z (mm)', 'safeZMm')}
      </div>
      {is3dR && <div className="form-row-3">{num('Stock Allow. (mm)', 'stockAllowanceMm')}</div>}
      {is3dF && (
        <div className="form-row-3">
          <div className="form-group">
            <label>Finish Strategy</label>
            <select value={String(p.finishStrategy ?? 'raster')} onChange={e => set('finishStrategy', e.target.value)}>
              <option value="raster">Raster</option>
              <option value="waterline">Waterline</option>
              <option value="pencil">Pencil</option>
            </select>
          </div>
          {num('Finish Stepover', 'finishStepoverMm')}
        </div>
      )}
      {is4axWrap && (
        <div className="form-row-3">
          {num('Cylinder Ø (mm)', 'cylinderDiameterMm')}
          <div className="form-group">
            <label>Wrap Mode</label>
            <select value={String(p.wrapMode ?? 'parallel')} onChange={e => set('wrapMode', e.target.value)}>
              <option value="parallel">Parallel</option>
              <option value="contour">Contour</option>
              <option value="raster">Raster</option>
            </select>
          </div>
        </div>
      )}
      {is4axIdx && (
        <div className="form-group">
          <label>Index Angles (°, comma-sep)</label>
          <input type="text"
            value={Array.isArray(p.indexAnglesDeg) ? (p.indexAnglesDeg as number[]).join(', ') : '0, 90, 180, 270'}
            onChange={e => {
              const arr = e.target.value.split(',').map(s => +s.trim()).filter(n => !isNaN(n))
              set('indexAnglesDeg', arr)
            }} />
        </div>
      )}
    </div>
  )
}

// ── Feeds & Speeds Calculator Modal ───────────────────────────────────────────
function FeedsCalcModal({
  materials, tools, onApplyToOp, onApplyToAll, onClose
}: {
  materials: MaterialRecord[]
  tools: ToolRecord[]
  onApplyToOp: (params: Record<string, unknown>) => void
  onApplyToAll: (params: Record<string, unknown>) => void
  onClose: () => void
}): React.ReactElement {
  const [matId,     setMatId]     = useState(materials[0]?.id ?? '')
  const [toolDiam,  setToolDiam]  = useState(6)
  const [fluteCount, setFluteCount] = useState(2)
  const [toolType,  setToolType]  = useState<'endmill' | 'ball' | 'vbit' | 'drill' | 'default'>('endmill')
  const [customSS,  setCustomSS]  = useState('')   // surface speed override
  const [customCL,  setCustomCL]  = useState('')   // chipload override

  const mat = materials.find(m => m.id === matId)
  const cp = mat?.cutParams?.[toolType] ?? mat?.cutParams?.['default'] ?? null

  // If user typed overrides, apply them on top of the material record
  const effectiveMat = mat && (customSS || customCL) ? {
    ...mat,
    cutParams: {
      ...mat.cutParams,
      [toolType]: {
        ...(cp ?? { docFactor: 0.5, stepoverFactor: 0.45, plungeFactor: 0.3, surfaceSpeedMMin: 100, chiploadMm: 0.03 }),
        ...(customSS ? { surfaceSpeedMMin: +customSS } : {}),
        ...(customCL ? { chiploadMm: +customCL } : {})
      }
    }
  } : mat

  const calc = effectiveMat ? calcCutParams(effectiveMat, toolDiam, fluteCount, toolType) : null

  const paramsFromCalc = calc ? {
    feedMmMin:   calc.feedMmMin,
    plungeMmMin: calc.plungeMmMin,
    stepoverMm:  calc.stepoverMm,
    zPassMm:     calc.zPassMm,
    toolDiameterMm: toolDiam,
  } : null

  // Sync from tool library selection
  const applyTool = (tid: string): void => {
    const t = tools.find(t => t.id === tid)
    if (!t) return
    setToolDiam(t.diameterMm)
    if (t.fluteCount) setFluteCount(t.fluteCount)
    if (t.type && t.type !== 'other') setToolType(t.type as typeof toolType)
    if (t.surfaceSpeedMMin) setCustomSS(String(t.surfaceSpeedMMin))
    if (t.chiploadMm) setCustomCL(String(t.chiploadMm))
  }

  const ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }
  const LBL: React.CSSProperties = { width: 130, fontSize: 11, color: 'var(--txt2)', flexShrink: 0 }
  const VAL: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: 'var(--txt0)', fontFamily: 'var(--mono)' }
  const UNIT: React.CSSProperties = { fontSize: 10, color: 'var(--txt2)', marginLeft: 3 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 10, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>⚙ Feeds & Speeds Calculator</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '14px 18px' }}>
          {/* Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Material</label>
              <select value={matId} onChange={e => { setMatId(e.target.value); setCustomSS(''); setCustomCL('') }} style={{ width: '100%' }}>
                {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {tools.length > 0 && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Tool from Library</label>
                <select defaultValue="" onChange={e => applyTool(e.target.value)} style={{ width: '100%' }}>
                  <option value="">— pick to fill fields —</option>
                  {tools.map(t => <option key={t.id} value={t.id}>{t.diameterMm}mm {t.type}{t.name ? ` — ${t.name}` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Tool Ø (mm)</label>
              <input type="number" value={toolDiam} min={0.1} step={0.1}
                onChange={e => setToolDiam(+e.target.value)} />
            </div>
            <div className="form-group">
              <label>Flutes (#)</label>
              <input type="number" value={fluteCount} min={1} max={12} step={1}
                onChange={e => setFluteCount(+e.target.value)} />
            </div>
            <div className="form-group">
              <label>Tool Type</label>
              <select value={toolType} onChange={e => setToolType(e.target.value as typeof toolType)}>
                <option value="endmill">Flat Endmill</option>
                <option value="ball">Ball Nose</option>
                <option value="vbit">V-Bit</option>
                <option value="drill">Drill</option>
                <option value="default">Default</option>
              </select>
            </div>
          </div>

          {/* Override row */}
          <div style={{ background: 'var(--bg0)', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--txt2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Override (leave blank to use material defaults)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Surface Speed (m/min)</label>
                <input type="number" placeholder={cp ? String(cp.surfaceSpeedMMin) : '—'} value={customSS}
                  onChange={e => setCustomSS(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Chipload (mm/tooth)</label>
                <input type="number" placeholder={cp ? String(cp.chiploadMm) : '—'} value={customCL} step="0.001"
                  onChange={e => setCustomCL(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Results panel */}
          {calc ? (
            <div style={{ background: 'linear-gradient(135deg, rgba(61,126,255,0.08) 0%, rgba(34,211,238,0.05) 100%)', border: '1px solid rgba(61,126,255,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
                Calculated Parameters
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['RPM',       calc.rpm,          'rpm' ],
                  ['Feed',      calc.feedMmMin,     'mm/min'],
                  ['Plunge',    calc.plungeMmMin,   'mm/min'],
                  ['DOC',       Math.abs(calc.zPassMm), 'mm'],
                  ['Stepover',  calc.stepoverMm,    'mm'],
                ].map(([label, val, unit]) => (
                  <div key={String(label)} style={{ textAlign: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 6px' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt2)', marginBottom: 2 }}>{label}</div>
                    <div style={VAL}>{typeof val === 'number' ? val.toLocaleString() : val}<span style={UNIT}>{unit}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--txt2)', fontSize: 12, padding: '20px 0', marginBottom: 14 }}>
              Select a material with cut parameters to see calculations
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-secondary btn-sm" disabled={!paramsFromCalc}
              onClick={() => { if (paramsFromCalc) { onApplyToAll(paramsFromCalc); onClose() } }}>
              Apply to All Ops
            </button>
            <button className="btn btn-primary btn-sm" disabled={!paramsFromCalc}
              onClick={() => { if (paramsFromCalc) { onApplyToOp(paramsFromCalc); onClose() } }}>
              Apply to Selected Op
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Left panel ────────────────────────────────────────────────────────────────
interface LeftPanelProps {
  jobs: Job[]
  activeJobId: string | null
  setActiveJobId: (id: string) => void
  createJob: () => void
  deleteJob: (id: string) => void
  activeJob: Job | null
  mode: MachineUIMode
  onUpdateJob: (id: string, patch: Partial<Job>) => void
  onAddOp: (kind: ManufactureOperationKind) => void
  machineTools: ToolRecord[]
  materials: MaterialRecord[]
}

function LeftPanel({
  jobs, activeJobId, setActiveJobId, createJob, deleteJob,
  activeJob, mode, onUpdateJob, onAddOp, machineTools, materials
}: LeftPanelProps): React.ReactElement {
  const [jobsOpen,    setJobsOpen]    = useState(true)
  const [opsOpen,     setOpsOpen]     = useState(true)
  const [tabsOpen,    setTabsOpen]    = useState(true)
  const [expandedOp,  setExpandedOp]  = useState<string | null>(null)
  const [addOpOpen,   setAddOpOpen]   = useState(false)
  const [showSecondary, setShowSecondary] = useState(false)
  // showFeedsCalc = opId to open F&S calc for, or null if closed
  const [showFeedsCalc, setShowFeedsCalc] = useState<string | null>(null)

  const { primary, secondary } = OPS_BY_MODE[mode]

  const updateOp = (opId: string, params: Record<string, unknown>): void => {
    if (!activeJob) return
    onUpdateJob(activeJob.id, { operations: activeJob.operations.map(o => o.id === opId ? { ...o, params } : o) })
  }
  const removeOp = (opId: string): void => {
    if (!activeJob) return
    onUpdateJob(activeJob.id, { operations: activeJob.operations.filter(o => o.id !== opId) })
    if (expandedOp === opId) setExpandedOp(null)
  }
  const moveOp = (opId: string, dir: -1 | 1): void => {
    if (!activeJob) return
    const ops = [...activeJob.operations]
    const i = ops.findIndex(o => o.id === opId)
    const j = i + dir
    if (j < 0 || j >= ops.length) return
    ;[ops[i], ops[j]] = [ops[j], ops[i]]
    onUpdateJob(activeJob.id, { operations: ops })
  }

  const STATUS_DOT: Record<Job['status'], string> = { idle: '#555', running: '#f0a500', done: '#22c55e', error: '#ef4444' }

  return (
    <>
    <div className="shop-left">
      {/* Jobs */}
      <div className="panel-section">
        <div className="panel-section-header" onClick={() => setJobsOpen(o => !o)}>
          <span className="panel-section-chevron">{jobsOpen ? '▾' : '▸'}</span>
          <span>JOBS</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm btn-icon"
            onClick={e => { e.stopPropagation(); createJob() }}>+</button>
        </div>
        {jobsOpen && (
          <div className="panel-section-body" style={{ maxHeight: 160, overflowY: 'auto' }}>
            {jobs.length === 0 && <div className="text-muted" style={{ padding: '8px 12px', fontSize: 12 }}>No jobs — click + to create one.</div>}
            {jobs.map(j => (
              <div key={j.id}
                className={`op-item${j.id === activeJobId ? ' op-item--active' : ''}`}
                onClick={() => setActiveJobId(j.id)}>
                <span className="op-item-dot" style={{ background: STATUS_DOT[j.status] }} />
                <span className="op-item-info">{j.name || 'Untitled'}</span>
                {j.id === activeJobId && (
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ marginLeft: 'auto', opacity: 0.5 }}
                    onClick={e => { e.stopPropagation(); deleteJob(j.id) }}>🗑</button>
                )}
              </div>
            ))}
          </div>
        )}
        {jobsOpen && activeJob && (
          <div style={{ padding: '6px 10px 8px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--txt2)', marginBottom: 4 }}>
              🖨 Printer URL
            </div>
            <input
              type="text"
              placeholder={mode === 'fdm' ? 'http://printer.local (Moonraker)' : 'http://printer.local'}
              value={activeJob.printerUrl ?? ''}
              onChange={e => onUpdateJob(activeJob.id, { printerUrl: e.target.value })}
              style={{ width: '100%', fontSize: 11, fontFamily: 'var(--mono)', padding: '4px 6px',
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--txt0)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {/* Support Posts — 4-axis / 5-axis only */}
      {(mode === 'cnc_4axis' || mode === 'cnc_5axis') && (
        <div className="panel-section">
          <div className="panel-section-header" onClick={() => setTabsOpen(o => !o)}>
            <span className="panel-section-chevron">{tabsOpen ? '▾' : '▸'}</span>
            <span>SUPPORT POSTS</span>
            <div style={{ flex: 1 }} />
            {activeJob && (
              <button className="btn btn-ghost btn-sm btn-icon"
                title={activeJob.posts ? 'Remove support post' : 'Add support post'}
                onClick={e => {
                  e.stopPropagation()
                  if (!activeJob) return
                  onUpdateJob(activeJob.id, {
                    posts: activeJob.posts
                      ? null
                      : { count: 1, diameterMm: 6, offsetRadiusMm: 0 }
                  })
                  setTabsOpen(true)
                }}>
                {activeJob.posts ? '✕' : '+'}
              </button>
            )}
          </div>

          {tabsOpen && (
            <div style={{ padding: '8px 12px 10px' }}>
              {!activeJob && (
                <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Select a job first.</div>
              )}
              {activeJob && !activeJob.posts && (
                <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5 }}>
                  No support post configured.<br />
                  <span style={{ opacity: 0.7 }}>Click + to add — a post runs axially
                  through the centre of the blank so the machine keeps its grip as
                  outer material is removed.</span>
                </div>
              )}
              {activeJob?.posts && (() => {
                const p = activeJob.posts!
                const set = (patch: Partial<PostConfig>): void =>
                  onUpdateJob(activeJob.id, { posts: { ...p, ...patch } })
                const labelStyle: React.CSSProperties = {
                  fontSize: 10, fontWeight: 600, color: 'var(--txt2)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: 3, display: 'block'
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Visual diagram — side view of cylinder with axial post */}
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                      <svg width="120" height="60" viewBox="0 0 120 60">
                        {/* Stock cylinder side silhouette */}
                        <rect x="8" y="10" width="104" height="40" rx="4"
                          fill="none" stroke="var(--border-hi)" strokeWidth="1.5" />
                        {/* End-cap ellipses for depth cue */}
                        <ellipse cx="8" cy="30" rx="5" ry="20"
                          fill="none" stroke="var(--border-hi)" strokeWidth="1.2" />
                        <ellipse cx="112" cy="30" rx="5" ry="20"
                          fill="none" stroke="var(--border-hi)" strokeWidth="1.2" />
                        {/* Post(s) running through centre */}
                        {Array.from({ length: p.count }).map((_, i) => {
                          const angle = (i / p.count) * Math.PI * 2
                          const oy = p.offsetRadiusMm > 0
                            ? (p.offsetRadiusMm / (p.offsetRadiusMm + 15)) * 16 * Math.cos(angle)
                            : 0
                          const postR = Math.max(1.5, (p.diameterMm / (activeJob.stock.y || 50)) * 20)
                          return (
                            <rect key={i}
                              x="8" y={30 + oy - postR} width="104" height={postR * 2} rx={postR}
                              fill="#22c55e" opacity="0.85" />
                          )
                        })}
                        {/* Rotation axis dashes */}
                        <line x1="8" y1="30" x2="112" y2="30"
                          stroke="#f97316" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.5" />
                        {/* Label */}
                        <text x="60" y="57" textAnchor="middle"
                          fontSize="8" fill="var(--txt2)">post through centre →</text>
                      </svg>
                    </div>

                    {/* Count */}
                    <div>
                      <label style={labelStyle}>Posts</label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {([1, 2, 4] as const).map(n => (
                          <button key={n}
                            onClick={() => set({ count: n })}
                            style={{
                              flex: 1, padding: '4px 0', borderRadius: 4, cursor: 'pointer',
                              fontSize: 11, fontWeight: p.count === n ? 700 : 400,
                              background: p.count === n ? 'var(--accent)' : 'var(--bg3)',
                              color: p.count === n ? '#fff' : 'var(--txt1)',
                              border: '1px solid ' + (p.count === n ? 'var(--accent)' : 'var(--border)')
                            }}>
                            {n === 1 ? '1 (centre)' : `${n} posts`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Diameter + offset */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Diameter (mm)</label>
                        <input type="number" min="1" max="30" step="0.5"
                          value={p.diameterMm}
                          onChange={e => set({ diameterMm: Math.max(1, +e.target.value) })}
                          style={{ width: '100%' }} />
                        <div style={{ fontSize: 9, color: 'var(--txt2)', marginTop: 2 }}>post Ø</div>
                      </div>
                      {p.count > 1 && (
                        <div>
                          <label style={labelStyle}>Offset radius (mm)</label>
                          <input type="number" min="0" max="40" step="1"
                            value={p.offsetRadiusMm}
                            onChange={e => set({ offsetRadiusMm: Math.max(0, +e.target.value) })}
                            style={{ width: '100%' }} />
                          <div style={{ fontSize: 9, color: 'var(--txt2)', marginTop: 2 }}>from axis</div>
                        </div>
                      )}
                    </div>

                    {/* Summary */}
                    <div style={{
                      background: 'var(--bg2)', borderRadius: 4, padding: '6px 8px',
                      fontSize: 10, color: 'var(--txt2)', lineHeight: 1.6
                    }}>
                      {p.count === 1
                        ? `Single Ø${p.diameterMm}mm post · runs along rotation axis`
                        : `${p.count}× Ø${p.diameterMm}mm posts · ${p.offsetRadiusMm}mm from axis · ${(360 / p.count).toFixed(0)}° spacing`
                      }
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Chuck Depth — 4-axis / 5-axis only */}
      {(mode === 'cnc_4axis' || mode === 'cnc_5axis') && activeJob && (
        <div className="panel-section">
          <div style={{ padding: '8px 12px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--txt2)', marginBottom: 8 }}>
              CHUCK DEPTH
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 8, lineHeight: 1.5 }}>
              Stock inserted into chuck — shown as <span style={{ color: '#cc4040', fontWeight: 600 }}>red</span> zone. Not machinable.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([5, 10] as const).map(d => (
                <button key={d}
                  className={`btn btn-sm${activeJob.chuckDepthMm === d ? ' btn-primary' : ' btn-ghost'}`}
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={() => onUpdateJob(activeJob.id, { chuckDepthMm: d })}>
                  {d}mm
                </button>
              ))}
            </div>
            {/* Clamp offset — safety buffer shown as orange zone */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--txt2)', marginBottom: 4 }}>
                Clamp Offset <span style={{ color: '#e67e22' }}>■</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6, lineHeight: 1.4 }}>
                Safety buffer between chuck and model.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" min="0" max="50" step="0.5"
                  value={activeJob.clampOffsetMm}
                  onChange={e => onUpdateJob(activeJob.id, { clampOffsetMm: Math.max(0, +e.target.value) })}
                  style={{ width: 64, fontSize: 12, padding: '3px 6px',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--txt0)', outline: 'none' }} />
                <span style={{ fontSize: 11, color: 'var(--txt2)' }}>mm</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt2)', marginTop: 8, lineHeight: 1.4 }}>
              Machinable: <strong style={{ color: 'var(--txt1)' }}>
                {Math.max(0, activeJob.stock.x - activeJob.chuckDepthMm - activeJob.clampOffsetMm)} mm
              </strong>{' '}of {activeJob.stock.x} mm total
            </div>
          </div>
        </div>
      )}

      {/* Operations */}
      <div className="panel-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel-section-header" onClick={() => setOpsOpen(o => !o)}>
          <span className="panel-section-chevron">{opsOpen ? '▾' : '▸'}</span>
          <span>OPERATIONS</span>
          <div style={{ flex: 1 }} />
          {activeJob && (
            <button className="btn btn-ghost btn-sm btn-icon"
              onClick={e => { e.stopPropagation(); setAddOpOpen(o => !o) }}>+</button>
          )}
        </div>

        {addOpOpen && activeJob && (
          <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto' }}>
            <div style={{ padding: '4px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--txt2)', background: 'var(--bg1)' }}>
              {MODE_ICONS[mode]} {MODE_LABELS[mode]} — primary
            </div>
            {primary.map(k => (
              <div key={k} className="op-item" style={{ paddingLeft: 16 }}
                onClick={() => { onAddOp(k); setAddOpOpen(false) }}>
                <span className="op-item-info">{KIND_LABELS[k] ?? k}</span>
              </div>
            ))}
            {secondary.length > 0 && (
              <>
                <div style={{ padding: '4px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--txt2)', background: 'var(--bg1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setShowSecondary(s => !s)}>
                  {showSecondary ? '▾' : '▸'} More operations
                </div>
                {showSecondary && secondary.map(k => (
                  <div key={k} className="op-item" style={{ paddingLeft: 16, opacity: 0.75 }}
                    onClick={() => { onAddOp(k); setAddOpOpen(false) }}>
                    <span className="op-item-info">{KIND_LABELS[k] ?? k}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {opsOpen && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!activeJob && <div className="text-muted" style={{ padding: '8px 12px', fontSize: 12 }}>Select a job first.</div>}
            {activeJob && activeJob.operations.length === 0 && (
              <div className="text-muted" style={{ padding: '8px 12px', fontSize: 12 }}>No operations — click + to add.</div>
            )}
            {activeJob && activeJob.operations.map((op, idx) => {
              const exp = expandedOp === op.id
              return (
                <div key={op.id} className="op-item-group">
                  <div className={`op-item-header${exp ? ' op-item-header--open' : ''}`}
                    onClick={() => setExpandedOp(exp ? null : op.id)}>
                    <span style={{ fontSize: 10, color: 'var(--txt2)', marginRight: 4, minWidth: 14 }}>{idx + 1}</span>
                    <span className="op-item-info" style={{ flex: 1, fontSize: 12 }}>{op.label}</span>
                    <span style={{ fontSize: 10 }}>{exp ? '▾' : '▸'}</span>
                  </div>
                  {exp && (
                    <div className="op-item-body">
                      <OpParamsEditor op={op} tools={machineTools} onChange={params => updateOp(op.id, params)} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => moveOp(op.id, -1)}>↑</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => moveOp(op.id, 1)}>↓</button>
                        {op.kind.startsWith('cnc_') && materials.length > 0 && (
                          <button className="btn btn-ghost btn-sm"
                            title="Feeds & Speeds Calculator for this operation"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => setShowFeedsCalc(op.id)}>⚙ F&S</button>
                        )}
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }}
                          onClick={() => removeOp(op.id)}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>

    {/* Feeds & Speeds Calculator Modal — per-operation */}
    {showFeedsCalc !== null && activeJob && (() => {
      const targetOpId = showFeedsCalc
      return (
        <FeedsCalcModal
          materials={materials}
          tools={machineTools}
          onApplyToOp={params => {
            // Re-find op at call time so we never use a stale closure reference
            const op = activeJob.operations.find(o => o.id === targetOpId)
            if (!op) return
            updateOp(targetOpId, { ...(op.params ?? {}), ...params })
          }}
          onApplyToAll={params => {
            const ops = activeJob.operations.map(op => op.kind.startsWith('cnc_')
              ? { ...op, params: { ...(op.params ?? {}), ...params } }
              : op
            )
            onUpdateJob(activeJob.id, { operations: ops })
          }}
          onClose={() => setShowFeedsCalc(null)}
        />
      )
    })()}
    </>
  )
}

// ── Fit model to stock ────────────────────────────────────────────────────────
// Tries 8 axis-aligned orientations and returns the one that fits the model
// most efficiently (largest uniform scale) inside the stock dimensions.
// ── AABB helpers ────────────────────────────────────────────────────────────────
// Compute the Three.js-space AABB extents of the model given its current transform.
// Mirrors exactly what applyTransform does:
//   mesh.rotation.set(deg(t.rotation.x), deg(t.rotation.z), deg(t.rotation.y))
//   mesh.scale.set(t.scale.x, t.scale.z, t.scale.y)
// Three.js Euler 'XYZ' intrinsic = R=Rx·Ry·Rz, so for a column vector apply Rz→Ry→Rx.
function computeModelBoundsInThreeJS(
  modelSz: { x: number; y: number; z: number },
  t: ModelTransform
): { loX: number; hiX: number; loY: number; hiY: number; loZ: number; hiZ: number } {
  const DEG = Math.PI / 180
  const ex = t.rotation.x * DEG      // Euler.x = model rotation.x
  const ey = t.rotation.z * DEG      // Euler.y = model rotation.z  (swap!)
  const ez = t.rotation.y * DEG      // Euler.z = model rotation.y  (swap!)
  const scX = t.scale.x, scY = t.scale.z, scZ = t.scale.y  // Three.js scale (swap Y/Z)
  const [cX, sX] = [Math.cos(ex), Math.sin(ex)]
  const [cY, sY] = [Math.cos(ey), Math.sin(ey)]
  const [cZ, sZ] = [Math.cos(ez), Math.sin(ez)]
  const hx = modelSz.x / 2, hy = modelSz.y / 2, hz = modelSz.z / 2
  const pts: [number, number, number][] = [
    [-hx,-hy,-hz],[hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],
    [-hx,-hy, hz],[hx,-hy, hz],[-hx,hy, hz],[hx,hy, hz],
  ]
  let loX=Infinity, hiX=-Infinity, loY=Infinity, hiY=-Infinity, loZ=Infinity, hiZ=-Infinity
  for (const [x, y, z] of pts) {
    const x1=x*cZ-y*sZ, y1=x*sZ+y*cZ, z1=z              // Rz first
    const x2=x1*cY+z1*sY, y2=y1, z2=-x1*sY+z1*cY        // then Ry
    const x3=x2, y3=y2*cX-z2*sX, z3=y2*sX+z2*cX         // then Rx
    const fx=x3*scX+t.position.x                          // Three.js pos: .x→X
    const fy=y3*scY+t.position.z                          // Three.js pos: .z→Y
    const fz=z3*scZ+t.position.y                          // Three.js pos: .y→Z
    loX=Math.min(loX,fx); hiX=Math.max(hiX,fx)
    loY=Math.min(loY,fy); hiY=Math.max(hiY,fy)
    loZ=Math.min(loZ,fz); hiZ=Math.max(hiZ,fz)
  }
  return { loX, hiX, loY, hiY, loZ, hiZ }
}

// Returns true when the model (at its current transform) is fully inside the stock.
// Stock occupies: X=[-sx/2, sx/2], Y=[0, sz] (height up), Z=[-sy/2, sy/2] (depth).
function modelFitsInStock(
  modelSz: { x: number; y: number; z: number },
  t: ModelTransform,
  stock: { x: number; y: number; z: number }
): boolean {
  const eps = 0.5  // 0.5mm tolerance
  const { loX, hiX, loY, hiY, loZ, hiZ } = computeModelBoundsInThreeJS(modelSz, t)
  return (
    loX >= -stock.x / 2 - eps && hiX <= stock.x / 2 + eps &&
    loY >= -eps            && hiY <= stock.z + eps   &&
    loZ >= -stock.y / 2 - eps && hiZ <= stock.y / 2 + eps
  )
}

// The Carvera 4th-axis rotation axis sits at this height above the spoilboard.
// Must match AXIS_Y constant in buildFourAxisRig (ShopModelViewer.tsx).
const CARVERA_AXIS_Y = 55

// modelSz is in Three.js space (Y=up=model-Z, Z=depth=model-Y).
// applyTransform maps: position.z→Three.js Y, position.y→Three.js Z
function fitModelToStock(
  modelSz: { x: number; y: number; z: number },
  stock:   { x: number; y: number; z: number },
  mode?: MachineUIMode,
  opts?: { chuckDepthMm?: number; clampOffsetMm?: number }
): Pick<ModelTransform, 'position' | 'rotation' | 'scale'> {
  const { x: Wx, y: Wy, z: Wz } = modelSz
  type Rot = ModelTransform['rotation']
  // 6 axis-aligned orientations → Three.js extents [dx (X), dy (Y), dz (Z)]
  const orientations: { dims: [number, number, number]; rot: Rot }[] = [
    { dims: [Wx, Wy, Wz], rot: { x:  0, y:  0, z:  0 } },
    { dims: [Wx, Wz, Wy], rot: { x: 90, y:  0, z:  0 } },
    { dims: [Wz, Wy, Wx], rot: { x:  0, y:  0, z: 90 } },
    { dims: [Wy, Wx, Wz], rot: { x:  0, y: 90, z:  0 } },
    { dims: [Wy, Wz, Wx], rot: { x: 90, y: 90, z:  0 } },
    { dims: [Wz, Wx, Wy], rot: { x:  0, y: 90, z: 90 } },
  ]

  const is4Axis = mode === 'cnc_4axis' || mode === 'cnc_5axis'

  if (is4Axis) {
    // 4-axis: stock is a cylinder along Three.js X.
    //   full length  = stock.x,  diameter = stock.y (radius = stock.y/2)
    // Unusable zone: chuckDepthMm (clamped) + clampOffsetMm (safety buffer)
    // Usable length for model: stock.x − unusable
    // Effective radius for model: (stock.y/2) − tabHeightMm
    //   (tabs protrude from stock surface — model must fit inside remaining radius)
    // X centre of machinable zone: unusable / 2
    //   (machinable runs from -halfLen+unusable to +halfLen; centre = unusable/2)
    // applyTransform: position.z → Three.js Y, so position.z = CARVERA_AXIS_Y (rotation axis).
    const chuckDep  = opts?.chuckDepthMm  ?? 0
    const clampOff  = opts?.clampOffsetMm ?? 0
    const unusable  = chuckDep + clampOff
    const usableLen = Math.max(1, stock.x - unusable)
    const xCenter   = unusable / 2   // Three.js X centre of machinable zone

    let bestScale = -1
    let bestRot: Rot = { x: 0, y: 0, z: 0 }
    for (const { dims: [dx, dy, dz], rot } of orientations) {
      if (!dx || !dy || !dz) continue
      const sX  = usableLen / dx
      const sYZ = stock.y / Math.sqrt(dy * dy + dz * dz)  // largest box inscribed in Ø circle
      const s   = Math.min(sX, sYZ)
      if (s > bestScale) { bestScale = s; bestRot = rot }
    }
    const s = Math.max(0.001, bestScale)
    return {
      position: { x: xCenter, y: 0, z: CARVERA_AXIS_Y },  // z→Three.js Y = rotation axis height
      rotation: bestRot,
      scale:    { x: s, y: s, z: s },
    }
  }

  // ── Flat-stock (3D/2D/FDM) ─────────────────────────────────────────────────
  // stock axes: Three.js X → stock.x (width), Three.js Y → stock.z (height),
  //             Three.js Z → stock.y (depth)
  let bestScale = -1
  let bestRot: Rot = { x: 0, y: 0, z: 0 }
  for (const { dims: [dx, dy, dz], rot } of orientations) {
    if (!dx || !dy || !dz) continue
    // dy fits stock.z (Three.js Y = height), dz fits stock.y (Three.js Z = depth)
    const s = Math.min(stock.x / dx, stock.z / dy, stock.y / dz)
    if (s > bestScale) { bestScale = s; bestRot = rot }
  }
  const s = Math.max(0.001, bestScale)
  // Stock box center in Three.js is at (0, stock.z/2, 0).
  // applyTransform maps model position.z → Three.js Y, so set .z = stock.z/2 to center vertically.
  return {
    position: { x: 0, y: 0, z: stock.z / 2 },
    rotation: bestRot,
    scale:    { x: s, y: s, z: s },
  }
}

// ── Scrub input — drag the label to scrub value (Blender-style) ───────────────
function ScrubInput({ label, value, step, onChange, color, suffix }: {
  label: string; value: number; step: number
  onChange: (v: number) => void; color?: string; suffix?: string
}): React.ReactElement {
  const startRef = useRef<{ x: number; val: number } | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  const onLabelDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    startRef.current = { x: e.clientX, val: value }
    setScrubbing(true)
    const onMove = (me: MouseEvent): void => {
      if (!startRef.current) return
      const mul = me.shiftKey ? 10 : me.ctrlKey ? 0.1 : 1
      const delta = (me.clientX - startRef.current.x) * step * mul
      const raw = startRef.current.val + delta
      const precision = step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : 1
      onChange(parseFloat(raw.toFixed(precision)))
    }
    const onUp = (): void => {
      startRef.current = null; setScrubbing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="xyz-cell">
      <span
        className="xyz-label"
        onMouseDown={onLabelDown}
        style={{
          cursor: 'ew-resize', userSelect: 'none',
          color: scrubbing ? '#fff' : (color ?? 'var(--txt2)'),
          background: scrubbing ? 'rgba(61,126,255,0.35)' : undefined,
          borderRadius: 2, padding: '0 2px',
          transition: 'color 0.1s, background 0.1s'
        }}
        title="Drag to scrub · Shift = ×10 · Ctrl = ×0.1"
      >
        {label}
      </span>
      <input
        type="number" step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ borderColor: scrubbing ? 'var(--accent)' : undefined }}
      />
      {suffix && <span style={{ fontSize: 8, color: 'var(--txt2)', textAlign: 'center' }}>{suffix}</span>}
    </div>
  )
}

// ── Viewport area ─────────────────────────────────────────────────────────────
const GIZMO_MODES: { mode: GizmoMode; icon: string; title: string }[] = [
  { mode: 'translate', icon: '⊹', title: 'Move (G)' },
  { mode: 'rotate',    icon: '↻', title: 'Rotate (R)' },
  { mode: 'scale',     icon: '⤡', title: 'Scale (S)' },
]
const AX_COLORS = { x: '#e74c3c', y: '#2ecc71', z: '#3d7eff' } as const

function ViewportArea({ job, mode, onUpdateJob, onToast, modelSize, setModelSize }: {
  job: Job | null; mode: MachineUIMode
  onUpdateJob: (id: string, patch: Partial<Job>) => void
  onToast: (kind: Toast['kind'], msg: string) => void
  modelSize: { x: number; y: number; z: number } | null
  setModelSize: (s: { x: number; y: number; z: number } | null) => void
}): React.ReactElement {
  const [floatOpen,    setFloatOpen]    = useState(true)
  const [dragging,     setDragging]     = useState(false)
  const [gizmoMode,    setGizmoMode]    = useState<GizmoMode>('translate')

  // Check whether the model currently fits inside the stock
  const fitsInStock = useMemo(() => {
    if (!job?.stlPath || !modelSize || !job?.transform || !job?.stock) return true  // nothing loaded → no warning
    try {
      return modelFitsInStock(modelSize, job.transform, job.stock)
    } catch {
      return true  // defensive: if transform is malformed (e.g. old localStorage), don't crash
    }
  }, [modelSize, job?.transform, job?.stock, job?.stlPath])

  // Fit model into stock — auto-orient + uniform scale (mode-aware)
  const handleFitToStock = (): void => {
    if (!job || !modelSize) return
    const fit = fitModelToStock(modelSize, job.stock, mode, {
      chuckDepthMm:  job.chuckDepthMm,
      clampOffsetMm: job.clampOffsetMm ?? 0,
    })
    onUpdateJob(job.id, { transform: { ...job.transform, ...fit } })
  }

  // Keyboard shortcuts: G=translate, R=rotate, S=scale, F=fit, Esc=none
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'g' || e.key === 'G') setGizmoMode(m => m === 'translate' ? null : 'translate')
      if (e.key === 'r' || e.key === 'R') setGizmoMode(m => m === 'rotate'    ? null : 'rotate')
      if (e.key === 's' || e.key === 'S') setGizmoMode(m => m === 'scale'     ? null : 'scale')
      if (e.key === 'f' || e.key === 'F') handleFitToStock()
      if (e.key === 'Escape') setGizmoMode(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, modelSize])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (!job) return
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.toLowerCase().endsWith('.stl')) { onToast('warn', 'Drop an .stl file'); return }
    try {
      const staged = await fab().stlStage('default', (file as unknown as { path?: string }).path ?? '')
      onUpdateJob(job.id, { stlPath: staged })
    } catch { onUpdateJob(job.id, { stlPath: (file as unknown as { path?: string }).path ?? null }) }
  }, [job, onUpdateJob, onToast])

  const browseStl = async (): Promise<void> => {
    if (!job) return
    const p = await fab().dialogOpenFile([{ name: 'STL Models', extensions: ['stl'] }])
    if (p) onUpdateJob(job.id, { stlPath: p })
  }

  const setField = (field: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number): void => {
    if (!job) return
    const t = job.transform ?? defaultTransform()
    onUpdateJob(job.id, { transform: { ...t, [field]: { ...(t[field] ?? {}), [axis]: val } } })
  }

  const handleTransformChange = (t: ModelTransform): void => {
    if (!job) return
    onUpdateJob(job.id, { transform: t })
  }

  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z']

  return (
    <div className="shop-viewport"
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}>

      {/* 3D viewer fills entire area */}
      <ShopModelViewer
        stlPath={job?.stlPath ?? null}
        stock={job?.stock ?? { x: 100, y: 100, z: 20 }}
        transform={job?.transform ?? defaultTransform()}
        transformMode={mode !== 'fdm' ? gizmoMode : null}
        mode={mode}
        gcodeOut={job?.gcodeOut ?? null}
        chuckDepthMm={job?.chuckDepthMm ?? 5}
        clampOffsetMm={job?.clampOffsetMm ?? 0}
        posts={job?.posts ?? null}
        onTransformChange={handleTransformChange}
        onModelLoaded={(x, y, z) => setModelSize({ x, y, z })}
      />

      {/* Empty-state overlay */}
      {!job?.stlPath && !dragging && (
        <div className="viewport-drop" style={{ pointerEvents: 'auto', cursor: 'default' }}>
          <div style={{ textAlign: 'center', opacity: 0.4 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{MODE_ICONS[mode]}</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>{MODE_LABELS[mode]}</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>Drop an STL file here or</div>
            {job
              ? <button className="btn btn-ghost" onClick={browseStl} style={{ pointerEvents: 'auto', opacity: 1 }}>Browse for STL…</button>
              : <div style={{ fontSize: 12 }}>Create or select a job first</div>}
          </div>
        </div>
      )}

      {/* Drag-over highlight */}
      {dragging && (
        <div className="viewport-drop" style={{ background: 'rgba(61,126,255,0.12)', zIndex: 5 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Drop STL to load model</div>
          </div>
        </div>
      )}

      {/* Model-outside-stock warning banner */}
      {!fitsInStock && job?.stlPath && mode !== 'fdm' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: 'rgba(220,38,38,0.92)', backdropFilter: 'blur(6px)',
          border: '1px solid #f87171', borderRadius: 6,
          padding: '5px 14px 5px 10px', fontSize: 11, color: '#fff',
          display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap'
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span>Model extends outside stock</span>
          <button
            onClick={handleFitToStock}
            style={{
              marginLeft: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: 4, color: '#fff', cursor: 'pointer'
            }}>
            Auto-fit
          </button>
        </div>
      )}

      {/* Gizmo mode switcher — top-left, CNC only */}
      {mode !== 'fdm' && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {GIZMO_MODES.map(({ mode: m, icon, title }) => (
            <button key={m} title={title}
              onClick={() => setGizmoMode(g => g === m ? null : m)}
              style={{
                width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
                fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: gizmoMode === m ? 'var(--accent)' : 'rgba(20,21,24,0.85)',
                color: gizmoMode === m ? '#fff' : 'var(--txt1)',
                backdropFilter: 'blur(6px)',
                border: gizmoMode === m ? '1px solid var(--accent)' : '1px solid var(--border-hi)',
                transition: 'all 0.1s'
              } as React.CSSProperties}>
              {icon}
            </button>
          ))}
          {/* "None" button */}
          {gizmoMode && (
            <button title="No gizmo (Esc)"
              onClick={() => setGizmoMode(null)}
              style={{
                width: 32, height: 32, border: '1px solid var(--border-hi)', borderRadius: 6,
                cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(20,21,24,0.85)', color: 'var(--txt2)',
                backdropFilter: 'blur(6px)', transition: 'all 0.1s'
              } as React.CSSProperties}>
              ✕
            </button>
          )}
        </div>
      )}

      {/* Active gizmo hint */}
      {gizmoMode && mode !== 'fdm' && (
        <div style={{
          position: 'absolute', top: 10, left: 52, zIndex: 10,
          background: 'rgba(20,21,24,0.85)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-hi)', borderRadius: 6,
          padding: '4px 10px', fontSize: 11, color: 'var(--txt1)',
          display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none'
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {gizmoMode}
          </span>
          <span style={{ opacity: 0.6, fontSize: 10 }}>Drag axis · G/R/S/F · Esc</span>
        </div>
      )}

      {/* Floating transform panel — CNC modes only */}
      {job && mode !== 'fdm' && (
        <div className="vp-float-panel">
          <div className="vp-float-header" onClick={() => setFloatOpen(o => !o)}>
            {/* Gizmo mode buttons inline in header */}
            <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              {GIZMO_MODES.map(({ mode: m, icon, title }) => (
                <button key={m} title={title}
                  onClick={() => setGizmoMode(g => g === m ? null : m)}
                  style={{
                    width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer',
                    fontSize: 12, background: gizmoMode === m ? 'var(--accent)' : 'var(--bg3)',
                    color: gizmoMode === m ? '#fff' : 'var(--txt2)'
                  }}>
                  {icon}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {/* Fit to stock */}
            <button
              title={modelSize ? 'Fit model to stock — auto-orient + scale (F)' : 'Load a model first'}
              disabled={!modelSize}
              onClick={e => { e.stopPropagation(); handleFitToStock() }}
              style={{
                padding: '2px 7px', fontSize: 10, fontWeight: 700,
                border: '1px solid var(--border-hi)', borderRadius: 4, cursor: modelSize ? 'pointer' : 'not-allowed',
                background: 'var(--bg3)', color: modelSize ? 'var(--txt0)' : 'var(--txt2)',
                letterSpacing: 0.3, opacity: modelSize ? 1 : 0.4
              }}>
              ⊡ Fit
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" title="Reset transform (↺)"
              onClick={e => { e.stopPropagation(); onUpdateJob(job.id, { transform: defaultTransform() }) }}>↺</button>
            <span style={{ fontSize: 10, marginLeft: 4 }}>{floatOpen ? '▾' : '▸'}</span>
          </div>

          {floatOpen && (
            <div style={{ padding: '8px 10px' }}>
              {(['position', 'rotation', 'scale'] as const).map(field => (
                <div key={field} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--txt2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {field === 'position' ? 'Position (mm)' : field === 'rotation' ? 'Rotation (°)' : 'Scale'}
                    {field === 'rotation' && (
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 8, padding: '0 4px', marginLeft: 'auto' }}
                        onClick={() => {
                          if (!job) return
                          onUpdateJob(job.id, { transform: { ...job.transform, rotation: { x: 0, y: 0, z: 0 } } })
                        }}>Reset</button>
                    )}
                  </div>
                  <div className="xyz-grid">
                    {axes.map(ax => (
                      <ScrubInput
                        key={ax}
                        label={ax.toUpperCase()}
                        value={+(job.transform[field][ax] as number).toFixed(field === 'scale' ? 3 : 2)}
                        step={field === 'scale' ? 0.01 : field === 'rotation' ? 1 : 0.1}
                        color={AX_COLORS[ax]}
                        suffix={field === 'rotation' ? '°' : undefined}
                        onChange={v => setField(field, ax, v)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Command palette ────────────────────────────────────────────────────────────
interface Command { id: string; group: string; label: string; icon: string; action: () => void }

function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }): React.ReactElement {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
  }, [query, commands])
  useEffect(() => { setActiveIdx(0) }, [filtered.length])

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const c of filtered) { const a = map.get(c.group) ?? []; a.push(c); map.set(c.group, a) }
    return map
  }, [filtered])

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { filtered[activeIdx]?.action(); onClose() }
    if (e.key === 'Escape')    onClose()
  }
  const hl = (text: string, q: string): React.ReactNode => {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return text
    return <>{text.slice(0, idx)}<mark style={{ background: 'var(--accent)', color: '#000', borderRadius: 2 }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>
  }
  let gi = 0
  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <span style={{ opacity: 0.5, marginRight: 8 }}>⌘</span>
          <input ref={inputRef} className="cmd-input" placeholder="Type a command…"
            value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey} />
          <kbd style={{ fontSize: 10, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, opacity: 0.6 }}>Esc</kbd>
        </div>
        <div className="cmd-results">
          {filtered.length === 0 && <div className="text-muted" style={{ padding: 16, textAlign: 'center' }}>No commands match</div>}
          {Array.from(groups.entries()).map(([group, cmds]) => (
            <Fragment key={group}>
              <div className="cmd-group-label">{group}</div>
              {cmds.map(cmd => {
                const myIdx = gi++
                return (
                  <div key={cmd.id}
                    className={`cmd-item${myIdx === activeIdx ? ' cmd-item--active' : ''}`}
                    onMouseEnter={() => setActiveIdx(myIdx)}
                    onClick={() => { cmd.action(); onClose() }}>
                    <span className="cmd-item-icon">{cmd.icon}</span>
                    <span className="cmd-item-label">{hl(cmd.label, query)}</span>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Library view ──────────────────────────────────────────────────────────────
function LibraryView({ onToast, onMachinesChanged }: {
  onToast: (k: Toast['kind'], m: string) => void
  onMachinesChanged: () => void
}): React.ReactElement {
  const [tab, setTab] = useState<LibTab>('machines')
  const [machines, setMachines] = useState<MachineProfile[]>([])
  const [tools, setTools] = useState<ToolRecord[]>([])
  const [materials, setMaterials] = useState<MaterialRecord[]>([])
  const [posts, setPosts] = useState<Array<{ filename: string; path: string; source: string; preview: string }>>([])
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [editingMachine, setEditingMachine] = useState<MachineProfile | null>(null)
  const [editingMaterial, setEditingMaterial] = useState<MaterialRecord | null>(null)
  const [postContent, setPostContent] = useState('')
  const [editingPostFilename, setEditingPostFilename] = useState<string | null>(null)

  useEffect(() => { fab().machinesList().then(setMachines).catch(console.error) }, [])
  useEffect(() => {
    if (tab === 'tools' && selectedMachineId)
      fab().machineToolsRead(selectedMachineId).then(lib => setTools(lib.tools ?? [])).catch(console.error)
  }, [tab, selectedMachineId])
  useEffect(() => { if (tab === 'materials') fab().materialsList().then(setMaterials).catch(console.error) }, [tab])
  useEffect(() => { if (tab === 'posts') fab().postsList().then(setPosts).catch(console.error) }, [tab])

  const refreshMachines = async (): Promise<void> => {
    const m = await fab().machinesList(); setMachines(m); onMachinesChanged()
  }

  const importCps = async (): Promise<void> => {
    try {
      const r = await fab().machinesPickAndImportCps()
      if (!r) return
      const d = r.detected
      onToast('ok', `Imported "${r.profile.name}" · ${[d.name?'✓ name':'~ name',d.workArea?'✓ area':'~ area',d.maxFeed?'✓ feed':'~ feed'].join(' · ')}`)
      await refreshMachines()
    } catch (e) { onToast('err', String(e)) }
  }

  const importTools = async (): Promise<void> => {
    try {
      const path = await fab().dialogOpenFile([{ name: 'Tool Libraries', extensions: ['json', 'csv', 'tools'] }])
      if (!path) return
      if (selectedMachineId) {
        const lib = await fab().machineToolsImportFile(selectedMachineId, path)
        setTools(lib.tools ?? [])
        onToast('ok', `Imported ${lib.tools?.length ?? 0} tools into machine library`)
      } else {
        const lib = await fab().toolsImportFile('default', path)
        setTools(lib.tools ?? [])
        onToast('ok', `Imported ${lib.tools?.length ?? 0} tools into global library`)
      }
    } catch (e) { onToast('err', String(e)) }
  }

  const TABS: { id: LibTab; label: string }[] = [
    { id: 'machines', label: 'Machines' }, { id: 'tools', label: 'Tools' },
    { id: 'materials', label: 'Materials' }, { id: 'posts', label: 'Post Processors' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id}
            className={`btn btn-ghost${tab === t.id ? ' btn-ghost--active' : ''}`}
            style={{ borderRadius: '6px 6px 0 0', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent' }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {tab === 'machines' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={importCps}>Import .cps…</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                const p = await fab().dialogOpenFile([{ name: 'Machine JSON', extensions: ['json'] }])
                if (!p) return
                try { await fab().machinesImportFile(p); await refreshMachines(); onToast('ok', 'Machine imported') }
                catch (e) { onToast('err', String(e)) }
              }}>Import JSON…</button>
            </div>
            {editingMachine && (
              <MachineEditor machine={editingMachine} onChange={setEditingMachine}
                onSave={async () => { await fab().machinesSaveUser(editingMachine); await refreshMachines(); setEditingMachine(null); onToast('ok', 'Saved') }}
                onCancel={() => setEditingMachine(null)} />
            )}
            {!editingMachine && machines.map(m => {
              const mmode = getMachineMode(m)
              return (
                <div key={m.id} className="lib-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.name}
                      <span className={`tb-machine-badge tb-machine-badge--${mmode}`} style={{ cursor: 'default', fontSize: 10 }}>
                        {MODE_ICONS[mmode]} {MODE_LABELS[mmode]}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {m.dialect} · {m.workAreaMm.x}×{m.workAreaMm.y}×{m.workAreaMm.z}mm
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingMachine({ ...m })}>✏</button>
                  {m.meta?.source === 'user' && (
                    <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#ef4444' }}
                      onClick={async () => { await fab().machinesDeleteUser(m.id); await refreshMachines(); onToast('ok', 'Deleted') }}>🗑</button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'tools' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-generate btn-sm" onClick={importTools}>↑ Import Tool Library…</button>
              <select className="tb-select" value={selectedMachineId ?? ''}
                onChange={e => setSelectedMachineId(e.target.value || null)} style={{ minWidth: 200 }}>
                <option value="">— import into global library —</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name} (machine)</option>)}
              </select>
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginBottom: 12 }}>
              Accepts .tools, .json, .csv — leave machine unselected for global library.
            </div>
            {tools.map(t => (
              <div key={t.id} className="lib-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>Ø{t.diameterMm}mm · {t.type} · {t.fluteCount} flute{t.fluteCount !== 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
            {tools.length === 0 && selectedMachineId && (
              <div className="text-muted" style={{ textAlign: 'center', padding: 32 }}>No tools — import a library file.</div>
            )}
          </div>
        )}

        {tab === 'materials' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingMaterial({
                id: `mat_${Date.now()}`, name: '', category: 'other', source: 'user',
                cutParams: { default: { surfaceSpeedMMin: 200, chiploadMm: 0.05, docFactor: 0.5, stepoverFactor: 0.45, plungeFactor: 0.3 } }
              })}>+ New Material</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                const r = await fab().materialsPickAndImport()
                if (!r) return
                setMaterials(await fab().materialsList())
                onToast('ok', `Imported ${r.length} material(s)`)
              }}>Import JSON…</button>
            </div>
            {editingMaterial && (
              <MaterialEditor material={editingMaterial} onChange={setEditingMaterial}
                onSave={async () => { await fab().materialsSave(editingMaterial); setMaterials(await fab().materialsList()); setEditingMaterial(null); onToast('ok', 'Saved') }}
                onCancel={() => setEditingMaterial(null)} />
            )}
            {!editingMaterial && materials.map(m => (
              <div key={m.id} className="lib-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{MATERIAL_CATEGORY_LABELS[m.category] ?? m.category}{m.source === 'bundled' ? ' · bundled' : ''}</div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingMaterial({ ...m })}>✏</button>
                {m.source !== 'bundled' && (
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: '#ef4444' }}
                    onClick={async () => { await fab().materialsDelete(m.id); setMaterials(await fab().materialsList()); onToast('ok', 'Deleted') }}>🗑</button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'posts' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: 220, borderRight: '1px solid var(--border)', overflow: 'auto', padding: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: 8 }}
                onClick={async () => { const r = await fab().postsPickAndUpload(); if (r) { setPosts(await fab().postsList()); onToast('ok', `Imported ${r.filename}`) } }}>
                Import .hbs…
              </button>
              {posts.map(p => (
                <div key={p.filename}
                  className={`lib-row${editingPostFilename === p.filename ? ' lib-row--active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={async () => { setPostContent(await fab().postsRead(p.filename)); setEditingPostFilename(p.filename) }}>
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <div>{p.filename}</div>
                    <div className="text-muted" style={{ fontSize: 10 }}>{p.source}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12 }}>
              {editingPostFilename ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{editingPostFilename}</span>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-sm btn-generate" onClick={async () => {
                      await fab().postsSave(editingPostFilename, postContent)
                      setPosts(await fab().postsList()); onToast('ok', 'Saved')
                    }}>Save</button>
                  </div>
                  <textarea style={{ flex: 1, background: 'var(--bg2)', color: 'var(--txt0)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'monospace', fontSize: 12, padding: 8, resize: 'none' }}
                    value={postContent} onChange={e => setPostContent(e.target.value)} />
                </>
              ) : <div className="text-muted" style={{ textAlign: 'center', marginTop: 64 }}>Select a post-processor to edit</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Machine editor ─────────────────────────────────────────────────────────────
function MachineEditor({ machine, onChange, onSave, onCancel }: {
  machine: MachineProfile; onChange: (m: MachineProfile) => void
  onSave: () => void; onCancel: () => void
}): React.ReactElement {
  const set = (k: keyof MachineProfile, v: unknown): void => onChange({ ...machine, [k]: v })
  const mmode = getMachineMode(machine)
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title">Edit Machine</span>
        <span className={`tb-machine-badge tb-machine-badge--${mmode}`} style={{ cursor: 'default' }}>
          {MODE_ICONS[mmode]} {MODE_LABELS[mmode]}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-generate" onClick={onSave}>Save</button>
      </div>
      <div className="card-body section-gap">
        <div className="form-row-3">
          <div className="form-group"><label>Name</label>
            <input value={machine.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group"><label>Kind</label>
            <select value={machine.kind} onChange={e => set('kind', e.target.value as MachineProfile['kind'])}>
              <option value="cnc">CNC</option>
              <option value="fdm">FDM Printer</option>
            </select>
          </div>
          <div className="form-group"><label>Axis Count</label>
            <select value={machine.axisCount ?? 3} onChange={e => set('axisCount', +e.target.value)}>
              <option value={3}>3-axis</option>
              <option value={4}>4-axis</option>
              <option value={5}>5-axis</option>
            </select>
          </div>
        </div>
        {machine.kind === 'cnc' && (machine.axisCount ?? 3) <= 3 && (
          <div className="form-row-3">
            <div className="form-group"><label>CNC Profile</label>
              <select value={machine.meta?.cncProfile ?? '2d'}
                onChange={e => onChange({ ...machine, meta: { ...machine.meta, cncProfile: e.target.value as '2d' | '3d' } })}>
                <option value="2d">Standard — VCarve style (2D/2.5D focus)</option>
                <option value="3d">3D Surfacing — Fusion style (rough/finish focus)</option>
              </select>
            </div>
          </div>
        )}
        <div className="form-row-3">
          <div className="form-group"><label>Dialect</label>
            <select value={machine.dialect} onChange={e => set('dialect', e.target.value as MachineProfile['dialect'])}>
              <option value="grbl">GRBL</option>
              <option value="grbl_4axis">GRBL 4-Axis</option>
              <option value="mach3">Mach3/4</option>
              <option value="generic_mm">Generic (mm)</option>
            </select>
          </div>
          <div className="form-group"><label>Post Template</label>
            <input value={machine.postTemplate ?? ''} onChange={e => set('postTemplate', e.target.value)} />
          </div>
          <div className="form-group"><label>Max Feed (mm/min)</label>
            <input type="number" value={machine.maxFeedMmMin ?? ''} onChange={e => set('maxFeedMmMin', +e.target.value)} />
          </div>
        </div>
        <div className="form-row-3">
          {(['x','y','z'] as const).map(ax => (
            <div className="form-group" key={ax}><label>Work Area {ax.toUpperCase()} (mm)</label>
              <input type="number" value={machine.workAreaMm[ax]}
                onChange={e => set('workAreaMm', { ...machine.workAreaMm, [ax]: +e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Material editor ────────────────────────────────────────────────────────────
function MaterialEditor({ material, onChange, onSave, onCancel }: {
  material: MaterialRecord; onChange: (m: MaterialRecord) => void
  onSave: () => void; onCancel: () => void
}): React.ReactElement {
  const cp = material.cutParams?.['default'] ?? { surfaceSpeedMMin: 200, chiploadMm: 0.05, docFactor: 0.5, stepoverFactor: 0.45, plungeFactor: 0.3 }
  const setCP = (k: string, v: number): void => onChange({ ...material, cutParams: { ...material.cutParams, default: { ...cp, [k]: v } } })
  const [cat, setCat] = useState<MaterialCategory>(material.category ?? 'other')
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title">Edit Material</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-generate" onClick={onSave}>Save</button>
      </div>
      <div className="card-body section-gap">
        <div className="form-row-3">
          <div className="form-group"><label>Name</label>
            <input value={material.name} onChange={e => onChange({ ...material, name: e.target.value })} />
          </div>
          <div className="form-group"><label>Category</label>
            <select value={cat} onChange={e => { const v = e.target.value as MaterialCategory; setCat(v); onChange({ ...material, category: v }) }}>
              {Object.entries(MATERIAL_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Notes</label>
            <input value={material.notes ?? ''} onChange={e => onChange({ ...material, notes: e.target.value })} />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--txt2)' }}>Default Cut Params</div>
        <div className="form-row-3">
          {[['Surface Speed (m/min)','surfaceSpeedMMin'],['Chipload (mm/tooth)','chiploadMm'],['DOC Factor','docFactor'],['Stepover Factor','stepoverFactor'],['Plunge Factor','plungeFactor']].map(([label, key]) => (
            <div className="form-group" key={key}><label>{label}</label>
              <input type="number" step="any" value={(cp as Record<string,number>)[key] ?? ''}
                onChange={e => setCP(key, +e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Settings view ─────────────────────────────────────────────────────────────
function SettingsView({ onToast }: { onToast: (k: Toast['kind'], m: string) => void }): React.ReactElement {
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  useEffect(() => { fab().settingsGet().then(setSettings).catch(console.error) }, [])
  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Settings</h2>
      <div className="card">
        <div className="card-header"><span className="card-title">Engine Paths</span></div>
        <div className="card-body section-gap">
          {[
            { key: 'pythonPath', label: 'Python Executable', placeholder: 'python3' },
            { key: 'curaEnginePath', label: 'CuraEngine Path', placeholder: '/usr/bin/CuraEngine' }
          ].map(({ key, label, placeholder }) => (
            <div className="form-group" key={key}><label>{label}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ flex: 1 }} placeholder={placeholder} value={String(settings[key] ?? '')}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} />
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  const p = await fab().dialogOpenFile([{ name: 'Executable', extensions: ['*'] }])
                  if (p) setSettings(s => ({ ...s, [key]: p }))
                }}>Browse…</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-generate" onClick={async () => {
          await fab().settingsSet(settings); onToast('ok', 'Settings saved')
        }}>Save Settings</button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function ShopApp(): React.ReactElement {
  const [phase, setPhase] = useState<'splash' | 'app'>('splash')
  const [sessionMachine, setSessionMachine] = useState<MachineProfile | null>(null)
  const [view, setView] = useState<ViewKind>('jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [machines, setMachines] = useState<MachineProfile[]>([])
  const [materials, setMaterials] = useState<MaterialRecord[]>([])
  const [machineTools, setMachineTools] = useState<ToolRecord[]>([])
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [modelSize, setModelSize] = useState<{ x: number; y: number; z: number } | null>(null)
  const [lastMachineId, setLastMachineId] = useState<string | null>(null)
  const [splashLibOpen, setSplashLibOpen] = useState(false)
  const [toasts, pushToast] = useToasts()
  const [savedIndicator, setSavedIndicator] = useState(false)

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null
  const mode: MachineUIMode = sessionMachine ? getMachineMode(sessionMachine) : 'cnc_2d'
  const isFdm = mode === 'fdm'

  const JOBS_KEY = 'fab-jobs-v1'

  // Restore jobs from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Job[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migrate stale jobs: ensure all required fields have defaults
          const migrated = parsed.map(j => ({
            ...newJob(j.name ?? 'Job', j.machineId ?? undefined),
            ...j,
            transform: j.transform ?? defaultTransform(),
            stock: j.stock ?? { x: 100, y: 100, z: 20 },
            operations: Array.isArray(j.operations) ? j.operations : [],
            posts: j.posts
              ? { count: j.posts.count ?? 1, diameterMm: j.posts.diameterMm ?? 6, offsetRadiusMm: j.posts.offsetRadiusMm ?? 0 }
              : null,
            chuckDepthMm: (j.chuckDepthMm === 10 ? 10 : 5) as 5 | 10,
            clampOffsetMm: typeof j.clampOffsetMm === 'number' ? j.clampOffsetMm : 0,
            gcodeOut: j.gcodeOut ?? null,
            status: j.status ?? 'idle',
            lastLog: j.lastLog ?? '',
            printerUrl: j.printerUrl ?? '',
          }))
          setJobs(migrated)
          setActiveJobId(migrated[0].id)
        }
      }
    } catch { /* corrupt storage — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save to localStorage whenever jobs change
  useEffect(() => {
    if (jobs.length > 0) localStorage.setItem(JOBS_KEY, JSON.stringify(jobs))
  }, [jobs])

  useEffect(() => {
    fab().machinesList().then(setMachines).catch(console.error)
    fab().materialsList().then(setMaterials).catch(console.error)
    fab().settingsGet().then(s => { if (s.lastMachineId) setLastMachineId(String(s.lastMachineId)) }).catch(console.error)
  }, [])

  useEffect(() => {
    const mid = activeJob?.machineId ?? sessionMachine?.id
    if (mid) fab().machineToolsRead(mid).then(lib => setMachineTools(lib.tools ?? [])).catch(console.error)
    else setMachineTools([])
  }, [activeJob?.machineId, sessionMachine?.id])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(x => !x) }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveProjectFile() }
      if (e.key === 'Escape') setCmdOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, activeJobId])

  const updateJob = useCallback((id: string, patch: Partial<Job>): void =>
    setJobs(js => js.map(j => j.id === id ? { ...j, ...patch } : j)), [])

  const createJob = (): void => {
    const j = newJob(`Job ${jobs.length + 1}`, sessionMachine?.id ?? undefined)
    setJobs(js => [...js, j]); setActiveJobId(j.id)
  }
  const deleteJob = (id: string): void => {
    setJobs(js => js.filter(j => j.id !== id))
    if (activeJobId === id) setActiveJobId(jobs.find(j => j.id !== id)?.id ?? null)
  }
  const addOp = (kind: ManufactureOperationKind): void => {
    if (!activeJob) return
    updateJob(activeJob.id, { operations: [...activeJob.operations, newOp(kind)] })
  }
  const applyMaterial = (): void => {
    if (!activeJob?.materialId) { pushToast('warn', 'No material selected'); return }
    const mat = materials.find(m => m.id === activeJob.materialId)
    if (!mat) { pushToast('warn', 'Selected material not found in library'); return }
    const applied = applyMaterialToOperations(activeJob.operations, activeJob.materialId, materials, machineTools)
    if (applied.changed) {
      updateJob(activeJob.id, { operations: applied.operations })
    }
    pushToast('ok', `Applied ${mat.name} to ${applied.operations.filter(o => o.kind.startsWith('cnc_')).length} op(s)`)
  }

  useEffect(() => {
    if (!activeJob?.materialId || activeJob.operations.length === 0) return
    const applied = applyMaterialToOperations(activeJob.operations, activeJob.materialId, materials, machineTools)
    if (!applied.changed) return
    updateJob(activeJob.id, { operations: applied.operations })
  }, [activeJob, materials, machineTools, updateJob])
  const saveProjectFile = async (): Promise<void> => {
    const payload = JSON.stringify({ version: 1, jobs, activeJobId }, null, 2)
    const p = await fab().dialogSaveFile(
      [{ name: 'Fab Session', extensions: ['fabsession'] }, { name: 'JSON', extensions: ['json'] }],
      'session.fabsession'
    )
    if (!p) return
    await fab().fsWriteText(p, payload)
    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
    pushToast('ok', `Saved to ${p.split(/[\\/]/).pop()}`)
  }

  const loadProjectFile = async (): Promise<void> => {
    const p = await fab().dialogOpenFile(
      [{ name: 'Fab Session', extensions: ['fabsession', 'json'] }]
    )
    if (!p) return
    try {
      const raw = await fab().fsReadBase64(p)
      const text = atob(raw)
      const { jobs: loadedJobs, activeJobId: loadedActiveId } = JSON.parse(text) as { version: number; jobs: Job[]; activeJobId: string | null }
      if (!Array.isArray(loadedJobs)) throw new Error('Invalid session file')
      setJobs(loadedJobs)
      setActiveJobId(loadedJobs.find(j => j.id === loadedActiveId)?.id ?? loadedJobs[0]?.id ?? null)
      pushToast('ok', `Loaded ${loadedJobs.length} job(s)`)
    } catch (e) { pushToast('err', `Load failed: ${String(e)}`) }
  }

  const generate = async (): Promise<void> => {
    if (!activeJob?.stlPath || !activeJob.machineId || activeJob.operations.length === 0) {
      pushToast('warn', 'Need a model, machine, and at least one operation'); return
    }
    const jobId = activeJob.id
    const materialApplied = applyMaterialToOperations(activeJob.operations, activeJob.materialId, materials, machineTools)
    const runOps = materialApplied.operations
    if (materialApplied.changed) {
      updateJob(jobId, { operations: runOps })
    }
    setRunning(true); setLog([]); setLogOpen(true)
    updateJob(jobId, { status: 'running' })
    let allOk = true
    try {
      const s = await fab().settingsGet()
      const pythonPath = String(s.pythonPath || 'python')
      const outPath = activeJob.stlPath.replace(/\.stl$/i, '.gcode')
      let camStlPath = activeJob.stlPath
      try {
        camStlPath = await fab().stlTransformForCam({
          stlPath: activeJob.stlPath,
          transform: activeJob.transform
        })
      } catch (e) {
        setLog((l) => [...l, `Transform-for-CAM failed; using raw STL: ${String(e)}`])
      }
      for (const op of runOps) {
        const p = (op.params ?? {}) as Record<string, unknown>
        const cut = resolveCamCutParamsWithMaterial({
          operation: op,
          materialId: activeJob.materialId,
          materials,
          tools: machineTools
        })
        const toolDiameterMm =
          typeof p.toolDiameterMm === 'number' && Number.isFinite(p.toolDiameterMm) && p.toolDiameterMm > 0
            ? p.toolDiameterMm
            : 6
        const needs4axis = op.kind === 'cnc_4axis_wrapping' || op.kind === 'cnc_4axis_indexed'
        const materialTag = activeJob.materialId
          ? materials.find((m) => m.id === activeJob.materialId)?.name ?? activeJob.materialId
          : 'default'
        setLog((l) => [
          ...l,
          `Running ${op.label}…${needs4axis ? ` (Python: ${pythonPath})` : ''} [mat=${materialTag}; F=${Math.round(cut.feedMmMin)}; P=${Math.round(cut.plungeMmMin)}]`
        ])
        try {
          const r = await fab().camRun({
            stlPath: camStlPath, outPath, machineId: activeJob.machineId!,
            zPassMm: cut.zPassMm,
            stepoverMm: cut.stepoverMm,
            feedMmMin: cut.feedMmMin,
            plungeMmMin: cut.plungeMmMin,
            safeZMm: cut.safeZMm ?? CAM_CUT_DEFAULTS.safeZMm,
            pythonPath,
            operationKind: op.kind,
            toolDiameterMm,
            operationParams: p
          })
          if (r.ok) { setLog(l => [...l, `  ✓ ${op.label} — ${r.usedEngine ?? 'builtin'}`]); if (r.gcode) updateJob(jobId, { gcodeOut: outPath }) }
          else { setLog(l => [...l, `  ✕ ${op.label}: ${r.error}${r.hint ? `\nHint: ${r.hint}` : ''}`]); allOk = false }
        } catch (e) { setLog(l => [...l, `  ✕ ${op.label}: ${String(e)}`]); allOk = false }
      }
      updateJob(jobId, { status: allOk ? 'done' : 'error' })
      pushToast(allOk ? 'ok' : 'err', allOk ? 'G-code generated' : 'Some operations failed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLog(l => [...l, `Generate failed: ${msg}`])
      updateJob(jobId, { status: 'error' })
      pushToast('err', `Generate failed: ${msg}`)
    } finally {
      setRunning(false)
    }
  }
  const sendToPrinter = async (): Promise<void> => {
    if (!activeJob?.gcodeOut) { pushToast('warn', 'Generate G-code first'); return }
    if (!activeJob.printerUrl) { pushToast('warn', 'Enter printer URL'); return }
    try {
      const r = await fab().moonrakerPush({ gcodePath: activeJob.gcodeOut, printerUrl: activeJob.printerUrl, startAfterUpload: true })
      r.ok ? pushToast('ok', `Sent: ${r.filename}`) : pushToast('err', r.error ?? 'Send failed')
    } catch (e) { pushToast('err', String(e)) }
  }

  const openSetupSheet = async (): Promise<void> => {
    if (!activeJob) { pushToast('warn', 'No active job'); return }
    try {
      let gcodeStats = null
      if (activeJob.gcodeOut) {
        try {
          const b64 = await fab().fsReadBase64(activeJob.gcodeOut)
          const text = decodeURIComponent(escape(atob(b64)))
          gcodeStats = parseGcodeStats(text)
        } catch { /* gcode not readable — skip stats */ }
      }
      const sheetJob: SetupSheetJob = {
        name: activeJob.name,
        stlPath: activeJob.stlPath,
        machineId: activeJob.machineId,
        materialId: activeJob.materialId,
        stock: activeJob.stock,
        operations: activeJob.operations.map(op => ({
          id: op.id, kind: op.kind, label: op.label,
          params: (op.params ?? {}) as Record<string, unknown>
        })),
        gcodeOut: activeJob.gcodeOut
      }
      const mat = materials.find(m => m.id === activeJob.materialId) ?? null
      const html = generateSetupSheet({
        job: sheetJob,
        machine: sessionMachine,
        material: mat,
        tools: machineTools,
        gcodeStats
      })
      // Save to temp file next to stl/gcode, then open in system browser
      const basePath = activeJob.gcodeOut ?? activeJob.stlPath
      const dir = basePath ? basePath.replace(/[/\\][^/\\]*$/, '') : null
      const fileName = `${activeJob.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_setup_sheet.html`
      const outPath = dir ? `${dir}/${fileName}` : null
      if (outPath) {
        await fab().fsWriteText(outPath, html)
        await fab().shellOpenPath(outPath)
        pushToast('ok', `Setup sheet opened: ${fileName}`)
      } else {
        // No path — use save dialog
        const savePath = await fab().dialogSaveFile(
          [{ name: 'HTML', extensions: ['html'] }], fileName
        )
        if (savePath) {
          await fab().fsWriteText(savePath, html)
          await fab().shellOpenPath(savePath)
          pushToast('ok', `Setup sheet saved`)
        }
      }
    } catch (e) { pushToast('err', `Setup sheet failed: ${String(e)}`) }
  }

  const handleMachineSelect = async (m: MachineProfile): Promise<void> => {
    setSessionMachine(m); setLastMachineId(m.id); setPhase('app')
    try { await fab().settingsSet({ lastMachineId: m.id }) } catch { /* */ }
  }

  const commands = useMemo((): Command[] => {
    const c: Command[] = []
    c.push({ id: 'new_job', group: 'Jobs', label: 'New Job', icon: '🔧', action: createJob })
    c.push({ id: 'change_machine', group: 'Session', label: 'Change machine', icon: '🖥', action: () => setPhase('splash') })
    if (activeJob) {
      c.push({ id: 'browse_stl', group: 'Jobs', label: 'Load STL Model…', icon: '📄', action: async () => {
        const p = await fab().dialogOpenFile([{ name: 'STL Models', extensions: ['stl'] }])
        if (p) updateJob(activeJob.id, { stlPath: p })
      }})
      c.push({ id: 'generate', group: 'Jobs', label: isFdm ? 'Slice' : 'Generate G-code', icon: '▶', action: generate })
      if (activeJob.gcodeOut) c.push({ id: 'send', group: 'Jobs', label: 'Send to Printer', icon: '→', action: sendToPrinter })
      if (!isFdm) c.push({ id: 'apply_mat', group: 'Jobs', label: 'Apply Material Cut Params ⚡', icon: '🧱', action: applyMaterial })
      if (!isFdm) c.push({ id: 'setup_sheet', group: 'Jobs', label: 'Generate Setup Sheet 📋', icon: '📋', action: openSetupSheet })
      const { primary, secondary } = OPS_BY_MODE[mode]
      ;[...primary, ...secondary].forEach(k =>
        c.push({ id: `add_op_${k}`, group: 'Add Operation', label: KIND_LABELS[k] ?? k, icon: '🔩', action: () => addOp(k) })
      )
    }
    machines.forEach(m => c.push({ id: `set_machine_${m.id}`, group: 'Machines', label: `Set machine: ${m.name}`, icon: '🖥', action: () => { if (activeJob) updateJob(activeJob.id, { machineId: m.id }) } }))
    materials.forEach(m => c.push({ id: `set_mat_${m.id}`, group: 'Materials', label: `Set material: ${m.name}`, icon: '🧱', action: () => { if (activeJob) updateJob(activeJob.id, { materialId: m.id }) } }))
    c.push({ id: 'library', group: 'Navigate', label: 'Go to Library', icon: '📦', action: () => setView('library') })
    c.push({ id: 'settings', group: 'Navigate', label: 'Go to Settings', icon: '⚙', action: () => setView('settings') })
    c.push({ id: 'jobs', group: 'Navigate', label: 'Go to Jobs', icon: '🔧', action: () => setView('jobs') })
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob, machines, materials, jobs.length, mode, isFdm])

  const STATUS_COLOR: Record<Job['status'], string> = { idle: '#555', running: '#f0a500', done: '#22c55e', error: '#ef4444' }
  const stockField = (ax: 'x' | 'y' | 'z'): React.ReactElement => (
    <input key={ax} type="number" step="1" min="1" className="tb-stock-input"
      title={`Stock ${ax.toUpperCase()} (mm)`} value={activeJob?.stock[ax] ?? ''} disabled={!activeJob}
      onChange={e => activeJob && updateJob(activeJob.id, { stock: { ...activeJob.stock, [ax]: +e.target.value } })} />
  )

  // ── Splash ──
  if (phase === 'splash') {
    return (
      <>
        {!splashLibOpen && (
          <MachineSplash
            machines={machines}
            lastMachineId={lastMachineId}
            onSelect={handleMachineSelect}
            onAddMachine={() => setSplashLibOpen(true)}
          />
        )}
        {splashLibOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg0)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 44, background: 'var(--bg1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
              <span style={{ fontWeight: 700 }}>Machine Library</span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                setMachines(await fab().machinesList())
                setSplashLibOpen(false)
              }}>← Back to machine picker</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <LibraryView onToast={pushToast} onMachinesChanged={async () => setMachines(await fab().machinesList())} />
            </div>
          </div>
        )}
        <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
          {toasts.map(t => (
            <div key={t.id} style={{ background: t.kind === 'ok' ? '#166534' : t.kind === 'err' ? '#7f1d1d' : '#78350f', color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13 }}>
              {t.kind === 'ok' ? '✓' : t.kind === 'err' ? '✕' : '⚠'} {t.msg}
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── Main app ──
  return (
    <div className="shop-shell">
      <div className="shop-toolbar">
        {/* Machine badge — click to go back to splash */}
        <button className={`tb-machine-badge tb-machine-badge--${mode}`}
          title="Click to change machine"
          onClick={() => setPhase('splash')}>
          {MODE_ICONS[mode]} {sessionMachine?.name ?? 'No machine'}
        </button>

        <div className="tb-sep" />
        <button className={`btn btn-ghost btn-sm${view === 'jobs' ? ' tb-btn--active' : ''}`} onClick={() => setView('jobs')}>Jobs</button>
        <button className={`btn btn-ghost btn-sm${view === 'library' ? ' tb-btn--active' : ''}`} onClick={() => setView('library')}>Library</button>
        <button className={`btn btn-ghost btn-sm${view === 'settings' ? ' tb-btn--active' : ''}`} onClick={() => setView('settings')}>Settings</button>
        <div className="tb-sep" />

        {view === 'jobs' && (
          <input className="tb-job-name" placeholder="Job name…"
            value={activeJob?.name ?? ''} disabled={!activeJob}
            onChange={e => activeJob && updateJob(activeJob.id, { name: e.target.value })} />
        )}

        {view === 'jobs' && !isFdm && (
          <>
            <div className="tb-sep" />
            <select className="tb-select tb-select-sm" title="Material" value={activeJob?.materialId ?? ''} disabled={!activeJob}
              onChange={e => activeJob && updateJob(activeJob.id, { materialId: e.target.value || null })}>
              <option value="">— material —</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="tb-btn" title="Apply material cut params to all operations (⚡)" disabled={!activeJob?.materialId} onClick={applyMaterial}>⚡</button>
            <div className="tb-sep" />
            <div className="tb-xyz">
              <span className="tb-xyz-label">X</span>{stockField('x')}
              <span className="tb-xyz-label">Y</span>{stockField('y')}
              <span className="tb-xyz-label">Z</span>{stockField('z')}
              <span className="tb-xyz-unit">mm</span>
            </div>
          </>
        )}

        <div className="tb-spacer" />

        {activeJob && view === 'jobs' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[activeJob.status], display: 'inline-block' }} />
            {activeJob.status}
          </span>
        )}

        {view === 'jobs' && (
          <>
            <button className="btn-generate" disabled={running || !activeJob} onClick={generate}>
              {running ? '⏳ Running…' : isFdm ? '▶ Slice' : '▶ Generate'}
            </button>
            <button className="btn-send" disabled={!activeJob?.gcodeOut} onClick={sendToPrinter}>→ Send</button>
          </>
        )}

        <div className="tb-sep" />
        {view === 'jobs' && activeJob && !isFdm && (
          <button className="tb-btn" title="Generate Setup Sheet (HTML)" onClick={openSetupSheet}>📋</button>
        )}
        <button className="tb-btn" title="Open session (Ctrl+O)" onClick={loadProjectFile}>📂</button>
        <button className="tb-btn" title="Save session (Ctrl+S)" onClick={saveProjectFile}
          style={{ color: savedIndicator ? 'var(--accent)' : undefined, transition: 'color 0.3s' }}>
          {savedIndicator ? '✓' : '💾'}
        </button>
        <button className="tb-btn" title="Command palette (Ctrl+K)" onClick={() => setCmdOpen(true)}>⌘</button>
      </div>

      {view === 'jobs' ? (
        <div className="shop-workspace">
          <LeftPanel
            jobs={jobs} activeJobId={activeJobId} setActiveJobId={setActiveJobId}
            createJob={createJob} deleteJob={deleteJob}
            activeJob={activeJob} mode={mode}
            onUpdateJob={updateJob} onAddOp={addOp}
            machineTools={machineTools}
            materials={materials}
          />
          <ViewportArea
            job={activeJob} mode={mode} onUpdateJob={updateJob} onToast={pushToast}
            modelSize={modelSize} setModelSize={setModelSize}
          />
        </div>
      ) : view === 'library' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <LibraryView onToast={pushToast} onMachinesChanged={async () => setMachines(await fab().machinesList())} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SettingsView onToast={pushToast} />
        </div>
      )}

      {logOpen && (
        <div className="shop-log">
          <div className="shop-log-bar">
            <span style={{ fontWeight: 600, fontSize: 12 }}>Output Log</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLog([])}>Clear</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLogOpen(false)}>✕</button>
          </div>
          <div className="shop-log-body">
            {log.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6,
                color: l.includes('✕') ? '#ef4444' : l.includes('✓') ? '#22c55e' : 'var(--txt0)' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {cmdOpen && <CommandPalette commands={commands} onClose={() => setCmdOpen(false)} />}

      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.kind === 'ok' ? '#166534' : t.kind === 'err' ? '#7f1d1d' : '#78350f', color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', maxWidth: 360 }}>
            {t.kind === 'ok' ? '✓' : t.kind === 'err' ? '✕' : '⚠'} {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
