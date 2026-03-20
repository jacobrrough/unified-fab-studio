import { useEffect, useState, type ReactNode } from 'react'
import type { MachineProfile } from '../../shared/machine-schema'
import {
  CURA_SLICE_PRESETS,
  CURA_SLICE_PRESET_IDS,
  resolveCuraSliceParams,
  type CuraSlicePresetId
} from '../../shared/cura-slice-defaults'
import { ROUND_TRIP_HELP, ROUND_TRIP_SHORT } from '../../shared/import-history-display'
import type { AppSettings, ProjectFile } from '../../shared/project-schema'
import type { DrawingFile, DrawingViewPlaceholder } from '../../shared/drawing-sheet-schema'
import type { ToolLibraryFile } from '../../shared/tool-schema'
import { buildCamSimulationPreview } from '../../shared/cam-simulation-preview'
import { CommandCatalogPanel } from '../commands/CommandCatalogPanel'
import { KeyboardShortcutsPanel } from '../commands/KeyboardShortcutsPanel'
import { DrawingExportRibbon } from '../shell/DrawingExportRibbon'
import { DrawingManifestPanel } from './DrawingManifestPanel'
import { CamLastRunHint } from './CamLastRunHint'
import type { UtilityTab } from '../shell/AppShell'

export type UtilitiesWorkspacePanelsProps = {
  tab: UtilityTab
  machines: MachineProfile[]
  settings: AppSettings | null
  project: ProjectFile | null
  projectDir: string | null
  tools: ToolLibraryFile | null
  activeMachine: MachineProfile | undefined
  sliceOut: string
  camOut: string
  importText: string
  onImportTextChange: (value: string) => void
  drawingExportBusy: boolean
  onOpenProjectFolder: () => void
  onCreateProject: () => void
  onSaveProject: () => void
  onProjectChange: (next: ProjectFile) => void
  onSaveSettingsField: (partial: Partial<AppSettings>) => void
  onRunSlice: () => void
  onRunCam: () => void
  onImportMesh: () => void
  onImportTools: (kind: 'csv' | 'json' | 'fusion' | 'fusion_csv') => void
  onImportToolLibraryFromFile: () => void | Promise<void>
  onExportDrawing: (kind: 'pdf' | 'dxf') => void
  onCatalogStatus: (msg: string) => void
  drawingFile: DrawingFile
  onPatchDrawingFirstSheet: (partial: {
    name?: string
    scale?: string
    viewPlaceholders?: DrawingViewPlaceholder[]
  }) => void
  onSaveDrawingManifest: () => void | Promise<void>
  onExportDesignParameters: () => void | Promise<void>
  onImportDesignParameters: () => void | Promise<void>
  /** Last CAM run hint (Make tab). */
  camLastHint: string
}

const SLICE_PREVIEW = 8000
const CAM_PREVIEW = 8000

export function UtilitiesWorkspacePanels(p: UtilitiesWorkspacePanelsProps): ReactNode {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [camPreviewTick, setCamPreviewTick] = useState(0)
  const [camPreview, setCamPreview] = useState(() => buildCamSimulationPreview(''))

  useEffect(() => {
    if (p.tab !== 'settings') return
    void window.fab.appGetVersion().then(setAppVersion).catch(() => setAppVersion(null))
  }, [p.tab])

  function runCamPreview(): void {
    setCamPreview(buildCamSimulationPreview(p.camOut))
    setCamPreviewTick((v) => v + 1)
  }

  switch (p.tab) {
    case 'project':
      return (
        <section className="panel workspace-util-panel" aria-labelledby="util-project-heading">
          <h2 id="util-project-heading">Project</h2>
          <p className="msg util-panel-intro">
            Open or create a project folder to load <code>project.json</code>, sidecar files, and machine-linked assets.
          </p>
          <DrawingExportRibbon
            projectName={p.project?.name}
            disabled={p.drawingExportBusy}
            onExportPdf={() => void p.onExportDrawing('pdf')}
            onExportDxf={() => void p.onExportDrawing('dxf')}
          />
          <div className="row util-project-actions" role="group" aria-label="Project folder actions">
            <button type="button" className="secondary" onClick={() => void p.onOpenProjectFolder()}>
              Open project folder
            </button>
            <button type="button" className="secondary" onClick={() => void p.onCreateProject()}>
              New project
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void p.onSaveProject()}
              disabled={!p.project}
              title={!p.project ? 'Open or create a project before saving' : undefined}
            >
              Save
            </button>
          </div>
          {p.project ? (
            <div className="msg">
              <p>
                <strong>{p.project.name}</strong> — machine: {p.activeMachine?.name ?? p.project.activeMachineId}
              </p>
              <label htmlFor="util-active-machine-id">
                Active machine ID
                <input
                  id="util-active-machine-id"
                  value={p.project.activeMachineId}
                  onChange={(e) => p.onProjectChange({ ...p.project!, activeMachineId: e.target.value })}
                  list="machine-ids-util"
                  autoComplete="off"
                />
                <datalist id="machine-ids-util">
                  {p.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <div className="row util-project-import" style={{ marginTop: '0.75rem' }} role="group" aria-label="Import 3D models">
                <button type="button" className="secondary" onClick={() => void p.onImportMesh()}>
                  Import 3D model…
                </button>
              </div>
              <p className="msg" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                STL copies to <code>assets/</code>. STEP uses CadQuery. OBJ / PLY / GLTF / GLB / 3MF / OFF / DAE convert via Python{' '}
                <code>trimesh</code> (see <code>engines/mesh/README.md</code>). In the file dialog, use{' '}
                <strong>Ctrl+click</strong> or <strong>Shift+click</strong> to import multiple files. Duplicate names become{' '}
                <code>_2</code>, <code>_3</code>, … under <code>assets/</code>. <code>importHistory</code> in{' '}
                <code>project.json</code> updates when you save the project.
              </p>
              {p.project.meshes.length === 0 ? (
                <p className="msg util-output-placeholder" role="status" style={{ marginTop: '0.5rem' }}>
                  No meshes linked yet — use <strong>Import 3D model…</strong> to add geometry.
                </p>
              ) : null}
              <DrawingManifestPanel
                projectDir={p.projectDir}
                drawingFile={p.drawingFile}
                onPatchDrawingFirstSheet={p.onPatchDrawingFirstSheet}
                onSaveDrawingManifest={p.onSaveDrawingManifest}
              />
              <h3 className="subh" style={{ marginTop: '1rem' }}>
                Design parameters (file I/O)
              </h3>
              <p className="msg">
                Export numeric <code>parameters</code> from <code>design/sketch.json</code> to{' '}
                <code>output/design-parameters.json</code>, or merge keys from a JSON file{' '}
                <code>{`{ "parameters": { "d1": 12 } }`}</code> (overwrites on key collision). Save the design in-app if
                you have unsolved edits before merging.
              </p>
              <div
                className="row util-project-params"
                style={{ flexWrap: 'wrap', gap: '0.5rem' }}
                role="group"
                aria-label="Design parameters file I/O"
              >
                <button
                  type="button"
                  className="secondary"
                  disabled={!p.projectDir}
                  onClick={() => void p.onExportDesignParameters()}
                >
                  Export parameters to output/
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!p.projectDir}
                  onClick={() => void p.onImportDesignParameters()}
                >
                  Merge parameters from JSON…
                </button>
              </div>
              {p.project.meshes.length > 0 ? (
                <>
                  <h3 className="subh util-section-heading" id="util-project-meshes-heading">
                    Meshes in project
                  </h3>
                  <ul className="tools" aria-labelledby="util-project-meshes-heading">
                    {p.project.meshes.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {(p.project.importHistory ?? []).length > 0 && (
                <>
                  <h3 className="subh util-section-heading" id="util-project-imports-heading">
                    Recent imports
                  </h3>
                  <p className="msg" style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }} id="util-project-imports-hint">
                    <strong>Mesh only</strong> — STL or converted mesh. <strong>Partial</strong> — tessellated CAD (e.g. STEP).{' '}
                    <strong>Full</strong> — reserved. Warnings note units, tessellation, and similar importer details.
                  </p>
                  <ul
                    className="tools"
                    aria-labelledby="util-project-imports-heading"
                    aria-describedby="util-project-imports-hint"
                    style={{ maxHeight: 160, overflowY: 'auto' }}
                  >
                    {(p.project.importHistory ?? []).slice(-12).map((e) => (
                      <li key={e.id}>
                        <div>
                          <strong>{e.sourceFileName}</strong> ({e.sourceFormat}) → {e.assetRelativePath}{' '}
                          <span
                            className="msg"
                            title={ROUND_TRIP_HELP[e.roundTripLevel]}
                            aria-label={ROUND_TRIP_HELP[e.roundTripLevel]}
                          >
                            [{ROUND_TRIP_SHORT[e.roundTripLevel]}]
                          </span>
                        </div>
                        {e.warnings && e.warnings.length > 0 ? (
                          <ul
                            className="msg"
                            style={{ margin: '0.2rem 0 0 1rem', fontSize: '0.82rem', listStyle: 'disc' }}
                            aria-label="Import warnings"
                          >
                            {e.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="msg util-output-placeholder" role="status">
              No project open yet. Use <strong>Open project folder</strong> or <strong>New project</strong> above, then{' '}
              <strong>Save</strong> after changes.
            </p>
          )}
        </section>
      )
    case 'settings':
      return p.settings ? (
        <section className="panel workspace-util-panel" aria-labelledby="util-settings-heading">
          <h2 id="util-settings-heading">Settings</h2>
          <p className="msg util-panel-intro" role="status">
            Unified Fab Studio {appVersion ? `v${appVersion}` : '…'}
          </p>
          <fieldset
            className="util-tools-actions util-settings-paths"
            aria-describedby="util-settings-more-info"
          >
            <legend className="util-fieldset-legend">External tool paths</legend>
            <p className="msg util-panel-intro">
              Paths to CuraEngine, Cura definitions, and Python (CadQuery / OpenCAMLib). Used by Utilities → Slice, STEP
              import, and optional CAM. Values save as you type.
            </p>
            <div className="row">
              <label htmlFor="util-cura-engine">
                CuraEngine executable
                <input
                  id="util-cura-engine"
                  value={p.settings.curaEnginePath ?? ''}
                  onChange={(e) => void p.onSaveSettingsField({ curaEnginePath: e.target.value })}
                  placeholder="C:\\Program Files\\Ultimaker Cura 5.x.x\\CuraEngine.exe"
                  autoComplete="off"
                  aria-describedby="util-settings-more-info"
                />
              </label>
            </div>
            <div className="row">
              <label htmlFor="util-cura-defs">
                Cura definitions folder (contains fdmprinter.def.json)
                <input
                  id="util-cura-defs"
                  value={p.settings.curaDefinitionsPath ?? ''}
                  onChange={(e) => void p.onSaveSettingsField({ curaDefinitionsPath: e.target.value })}
                  placeholder="…\\share\\cura\\resources\\definitions"
                  autoComplete="off"
                  aria-describedby="util-settings-more-info"
                />
              </label>
            </div>
            <div className="row">
              <label htmlFor="util-python">
                Python (OpenCAMLib / CadQuery)
                <input
                  id="util-python"
                  value={p.settings.pythonPath ?? ''}
                  onChange={(e) => void p.onSaveSettingsField({ pythonPath: e.target.value })}
                  placeholder="python"
                  autoComplete="off"
                  aria-describedby="util-settings-more-info"
                />
              </label>
            </div>
          </fieldset>
          <p id="util-settings-more-info" className="msg">
            See <code>resources/slicer/README.md</code> for <code>CURA_ENGINE_SEARCH_PATH</code> and bundled profile notes.
          </p>
        </section>
      ) : (
        <section
          className="panel workspace-util-panel"
          aria-labelledby="util-settings-heading"
          aria-busy="true"
        >
          <h2 id="util-settings-heading">Settings</h2>
          <p className="msg util-panel-intro" role="status" aria-live="polite">
            Loading settings…
          </p>
        </section>
      )
    case 'slice': {
      const preset = (p.settings?.curaSlicePreset ?? 'balanced') as CuraSlicePresetId
      const active = resolveCuraSliceParams(preset)
      return (
        <section className="panel workspace-util-panel" aria-labelledby="util-slice-heading">
          <h2 id="util-slice-heading">FDM slice (K2 Plus profile)</h2>
          <p className="msg util-panel-intro">
            Uses CuraEngine with <code>resources/slicer/creality_k2_plus.def.json</code> and paths from{' '}
            <strong>Settings → External tool paths</strong>. Pick a <strong>preset</strong> below (maps to{' '}
            <code>buildCuraSliceArgs</code> <code>-s</code> values in <code>cura-slice-defaults.ts</code>).
          </p>
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="util-slice-preset">
              Slice preset
              <select
                id="util-slice-preset"
                value={preset}
                onChange={(e) =>
                  void p.onSaveSettingsField({ curaSlicePreset: e.target.value as CuraSlicePresetId })
                }
              >
                {CURA_SLICE_PRESET_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                    {id === 'balanced' ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p className="msg" style={{ margin: 0, flex: 1 }}>
              Active: layer <strong>{active.layerHeightMm}</strong> mm, line <strong>{active.lineWidthMm}</strong> mm,{' '}
              <strong>{active.wallLineCount}</strong> walls, <strong>{active.infillSparseDensity}%</strong> sparse infill.
              Raw bundles: <code>{JSON.stringify(CURA_SLICE_PRESETS.balanced)}</code> (balanced),{' '}
              <code>{JSON.stringify(CURA_SLICE_PRESETS.draft)}</code> (draft),{' '}
              <code>{JSON.stringify(CURA_SLICE_PRESETS.fine)}</code> (fine).
            </p>
          </div>
          <p className="msg">
            G-code is <strong>unverified</strong> for your printer until you confirm profiles, temperatures, and limits —{' '}
            see <code>docs/MACHINES.md</code>.
          </p>
          <h3 className="subh util-section-heading" id="util-slice-run-heading">
            Run slice
          </h3>
          <button type="button" className="primary" onClick={() => void p.onRunSlice()} aria-describedby="util-slice-run-heading">
            Slice STL…
          </button>
          {!p.sliceOut?.trim() ? (
            <p className="msg util-output-placeholder" role="status">
              No Cura output yet. Add an STL on the <strong>Project</strong> tab, then run <strong>Slice STL…</strong>.
            </p>
          ) : null}
          {p.sliceOut?.trim() ? (
            <>
              <h3 className="subh util-section-heading" id="util-slice-output-heading">
                Output
              </h3>
              <pre
                className="code"
                tabIndex={0}
                role="status"
                aria-live="polite"
                aria-relevant="text"
                aria-labelledby="util-slice-output-heading"
              >
                {p.sliceOut.slice(0, SLICE_PREVIEW)}
                {p.sliceOut.length > SLICE_PREVIEW ? '\n…' : ''}
              </pre>
            </>
          ) : null}
        </section>
      )
    }
    case 'cam':
      return (
        <section className="panel workspace-util-panel" aria-labelledby="util-cam-heading">
          <h2 id="util-cam-heading">CNC CAM (Laguna / Makera)</h2>
          <p className="msg util-panel-intro">
            Builds G-code from the project mesh. OpenCAMLib is optional; without it, a built-in parallel finish path uses STL
            bounds (set <strong>Python</strong> under Settings for OCL).
          </p>
          <p className="msg">
            G-code is <strong>not verified</strong> for any CNC until you confirm post, units, work offset, and clearances —{' '}
            see <code>docs/MACHINES.md</code>.
          </p>
          <h3 className="subh util-section-heading" id="util-cam-run-heading">
            Generate toolpath
          </h3>
          <div
            className="row util-cam-actions"
            role="group"
            aria-label="CAM generation and preview"
            aria-describedby="util-cam-run-heading"
          >
            <button type="button" className="primary" onClick={() => void p.onRunCam()}>
              Generate toolpath…
            </button>
            <button
              type="button"
              className="secondary"
              onClick={runCamPreview}
              disabled={!p.camOut?.trim()}
              aria-label="Analyze generated G-code for motion and bounds cues (non-physical)"
              title={!p.camOut?.trim() ? 'Generate a toolpath first' : undefined}
            >
              Preview G-code analysis
            </button>
          </div>
          {!p.camOut?.trim() ? (
            <p className="msg util-output-placeholder" role="status">
              No G-code yet. Add a mesh on the <strong>Project</strong> tab, then run <strong>Generate toolpath…</strong>.
            </p>
          ) : null}
          {camPreviewTick > 0 ? (
            <div
              className="msg"
              role="status"
              aria-live="polite"
              style={{ marginTop: '0.5rem' }}
              aria-labelledby="util-cam-preview-heading"
            >
              <h3 className="subh util-section-heading" id="util-cam-preview-heading" style={{ marginTop: 0 }}>
                G-code analysis
              </h3>
              <strong>Text-only summary</strong> (not machine simulation): {camPreview.disclaimer}
              <br />
              Lines: {camPreview.totalLines}, motion: {camPreview.motionLines}, cutting moves: {camPreview.cuttingMoves}
              {camPreview.xyBounds ? (
                <>
                  <br />
                  XY envelope (mm): X {camPreview.xyBounds.minX.toFixed(2)} → {camPreview.xyBounds.maxX.toFixed(2)}, Y{' '}
                  {camPreview.xyBounds.minY.toFixed(2)} → {camPreview.xyBounds.maxY.toFixed(2)}
                </>
              ) : null}
              {camPreview.zRange ? (
                <>
                  <br />
                  Z span (mm): {camPreview.zRange.bottomZ.toFixed(2)} → {camPreview.zRange.topZ.toFixed(2)}
                </>
              ) : null}
              {camPreview.cues.length > 0 ? (
                <>
                  <br />
                  Evolution cues:
                  <ul>
                    {camPreview.cues.map((cue, idx) => (
                      <li key={`${cue.progressPct}-${idx}`}>
                        {cue.progressPct}% — {cue.message}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
          {p.camOut?.trim() ? (
            <>
              <h3 className="subh util-section-heading" id="util-cam-output-heading">
                G-code output
              </h3>
              <CamLastRunHint hint={p.camLastHint} />
              <pre
                className="code"
                tabIndex={0}
                role="status"
                aria-live="polite"
                aria-relevant="text"
                aria-labelledby="util-cam-output-heading"
              >
                {p.camOut.slice(0, CAM_PREVIEW)}
                {p.camOut.length > CAM_PREVIEW ? '\n…' : ''}
              </pre>
            </>
          ) : null}
        </section>
      )
    case 'commands':
      return <CommandCatalogPanel onStatus={p.onCatalogStatus} />
    case 'shortcuts':
      return <KeyboardShortcutsPanel />
    case 'tools':
      return (
        <section className="panel workspace-util-panel" aria-labelledby="util-tools-heading">
          <h2 id="util-tools-heading">Tool library</h2>
          <p className="msg util-panel-intro">
            CNC tool definitions for manufacture workflows. Open a project folder on the <strong>Project</strong> tab before
            importing — paths resolve against the project directory.
          </p>
          <p className="msg">
            Paste CSV or JSON below, or pick <strong>Import library file…</strong> for <code>.csv</code>, <code>.json</code>,{' '}
            <code>.hsmlib</code> / <code>.tpgz</code> (gzipped XML, best-effort HSM-style). Simple paste CSV:{' '}
            <code>name</code>, <code>diameterMm</code>, <code>fluteCount</code>, <code>type</code>. Use <strong>Import Fusion
            CSV</strong> for wide Fusion Manufacture exports.
          </p>
          <label htmlFor="util-tools-import">
            Import data
            <textarea
              id="util-tools-import"
              value={p.importText}
              onChange={(e) => p.onImportTextChange(e.target.value)}
              placeholder="Paste CSV or JSON"
              spellCheck={false}
              aria-describedby="util-tools-import-hint"
            />
          </label>
          <p id="util-tools-import-hint" className="msg">
            Import buttons need an open project folder; open or create a project on the Project tab first.
          </p>
          <fieldset className="util-tools-actions" aria-describedby="util-tools-import-hint">
            <legend className="util-fieldset-legend">Import format</legend>
            <div className="row">
              <button
                type="button"
                onClick={() => void p.onImportToolLibraryFromFile()}
                disabled={!p.projectDir}
              >
                Import library file…
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void p.onImportTools('csv')}
                disabled={!p.projectDir}
              >
                Import CSV
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void p.onImportTools('json')}
                disabled={!p.projectDir}
              >
                Import JSON
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void p.onImportTools('fusion')}
                disabled={!p.projectDir}
              >
                Import Fusion-style JSON
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void p.onImportTools('fusion_csv')}
                disabled={!p.projectDir}
              >
                Import Fusion CSV
              </button>
            </div>
          </fieldset>
          {p.tools && p.tools.tools.length > 0 ? (
            <ul className="tools" aria-label="Tools in library">
              {p.tools.tools.map((t) => (
                <li key={t.id}>
                  {t.name} — Ø{t.diameterMm} mm {t.type} {t.fluteCount != null ? `(${t.fluteCount} fl)` : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {p.projectDir && p.tools && p.tools.tools.length === 0 ? (
            <p className="msg util-output-placeholder" role="status">
              <code>tools.json</code> is empty for this project. Paste data and choose an import format, use{' '}
              <strong>Import library file…</strong>, or add tools from the <strong>Manufacture</strong> workspace — then save
              the project if your workflow writes tools to disk.
            </p>
          ) : null}
          {!p.projectDir ? (
            <p className="msg util-output-placeholder" role="status">
              Open or create a project on the <strong>Project</strong> tab so tool paths resolve and imports can run.
            </p>
          ) : null}
        </section>
      )
    default: {
      const _exhaustive: never = p.tab
      return _exhaustive
    }
  }
}
