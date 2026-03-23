import { useState, type ReactNode } from 'react'
import type { MachineProfile } from '../../shared/machine-schema'
import {
  CURA_SLICE_PRESETS,
  CURA_SLICE_PRESET_IDS,
  mergeCuraSliceInvocationSettings,
  parseCuraSliceProfilesJson,
  resolveCuraSliceParams,
  type CuraSlicePresetId
} from '../../shared/cura-slice-defaults'
import type { AppSettings, ProjectFile } from '../../shared/project-schema'
import type { ToolLibraryFile } from '../../shared/tool-schema'
import { buildCamSimulationPreview } from '../../shared/cam-simulation-preview'
import { formatFdmLayerSummaryHuman, summarizeFdmGcodeLayers } from '../../shared/fdm-gcode-layer-summary'
import { CamLastRunHint } from '../utilities/CamLastRunHint'

const SLICE_PREVIEW = 8000
const CAM_PREVIEW = 8000
const countVisibleLines = (text: string): number => text.split(/\r?\n/).length

export type ManufactureAuxPanelsProps = {
  machines: MachineProfile[]
  settings: AppSettings | null
  project: ProjectFile | null
  projectDir: string | null
  tools: ToolLibraryFile | null
  activeMachine: MachineProfile | undefined
  sliceOut: string
  camOut: string
  camLastHint: string
  importText: string
  onImportTextChange: (value: string) => void
  onSaveSettingsField: (partial: Partial<AppSettings>) => void
  onRunSlice: () => void
  onRunCam: () => void
  onImportTools: (kind: 'csv' | 'json' | 'fusion' | 'fusion_csv') => void
  onImportToolLibraryFromFile: () => void | Promise<void>
}

export function SliceManufacturePanel(p: ManufactureAuxPanelsProps): ReactNode {
  const preset = (p.settings?.curaSlicePreset ?? 'balanced') as CuraSlicePresetId
  const active = resolveCuraSliceParams(preset)
  const namedProfiles = parseCuraSliceProfilesJson(p.settings?.curaSliceProfilesJson)
  const mergedMap = mergeCuraSliceInvocationSettings(p.settings ?? null)
  const mergedPreview = [...mergedMap.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .slice(0, 24)
    .join(', ')
  const activeProfileId = p.settings?.curaActiveSliceProfileId ?? ''
  return (
    <section className="panel workspace-util-panel" aria-labelledby="mfg-slice-heading">
      <h2 id="mfg-slice-heading">FDM slice (K2 Plus profile)</h2>
      <p className="msg util-panel-intro">
        Uses CuraEngine with the bundled <code>resources/slicer/creality_k2_plus.def.json</code> unless you set{' '}
        <strong>machine definition (-j)</strong> under <strong>File → Settings → External tool paths</strong>. Paths also come
        from that section. Pick a <strong>preset</strong> below (maps to{' '}
        <code>buildCuraSliceArgs</code> <code>-s</code> values in <code>cura-slice-defaults.ts</code>). Optional{' '}
        <strong>named profiles</strong> and extra JSON are configured under <strong>File → Settings → CuraEngine advanced</strong>.
      </p>
      <div className="row">
        <label htmlFor="mfg-slice-preset">
          Slice preset
          <select
            id="mfg-slice-preset"
            value={preset}
            onChange={(e) => void p.onSaveSettingsField({ curaSlicePreset: e.target.value as CuraSlicePresetId })}
          >
            {CURA_SLICE_PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
                {id === 'balanced' ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="mfg-slice-named-profile">
          Named profile
          <select
            id="mfg-slice-named-profile"
            value={activeProfileId}
            onChange={(e) =>
              void p.onSaveSettingsField({
                curaActiveSliceProfileId: e.target.value.trim() ? e.target.value : undefined
              })
            }
          >
            <option value="">— none —</option>
            {namedProfiles.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.label} ({pr.id})
              </option>
            ))}
          </select>
        </label>
        <p className="msg msg-row-flex">
          Base preset (when no profile): layer <strong>{active.layerHeightMm}</strong> mm, line{' '}
          <strong>{active.lineWidthMm}</strong> mm, <strong>{active.wallLineCount}</strong> walls,{' '}
          <strong>{active.infillSparseDensity}%</strong> sparse infill. Raw bundles:{' '}
          <code>{JSON.stringify(CURA_SLICE_PRESETS.balanced)}</code> (balanced),{' '}
          <code>{JSON.stringify(CURA_SLICE_PRESETS.draft)}</code> (draft),{' '}
          <code>{JSON.stringify(CURA_SLICE_PRESETS.fine)}</code> (fine).
        </p>
      </div>
      <p className="msg util-panel-intro">
        <strong>Effective CuraEngine `-s` preview</strong> (first keys, sorted):{' '}
        <code className="code-break-all">{mergedPreview || '(preset only)'}</code>
        {mergedMap.size > 24 ? ` … +${mergedMap.size - 24} more` : null}
      </p>
      <p className="msg">
        G-code is <strong>unverified</strong> for your printer until you confirm profiles, temperatures, and limits —{' '}
        see <code>docs/MACHINES.md</code>.
      </p>
      <h3 className="subh util-section-heading" id="mfg-slice-run-heading">
        Run slice
      </h3>
      <button type="button" className="primary" onClick={() => void p.onRunSlice()} aria-describedby="mfg-slice-run-heading">
        Slice STL…
      </button>
      {!p.sliceOut?.trim() ? (
        <p className="msg util-output-placeholder" role="status">
          No Cura output yet. Add an STL on the <strong>File → Project</strong> tab, then run <strong>Slice STL…</strong>.
        </p>
      ) : null}
      {p.sliceOut?.trim() ? (
        <>
          <h3 className="subh util-section-heading" id="mfg-slice-output-heading">
            Output
          </h3>
          {(() => {
            const fdmLayerSummary = summarizeFdmGcodeLayers(p.sliceOut ?? '')
            const line = formatFdmLayerSummaryHuman(fdmLayerSummary)
            return line ? (
              <p className="msg util-panel-intro" role="status">
                {line}
              </p>
            ) : null
          })()}
          <p className="sr-only" role="status" aria-live="polite">
            Slice output updated, showing {countVisibleLines(p.sliceOut.slice(0, SLICE_PREVIEW))} lines.
          </p>
          <pre className="code" tabIndex={0} aria-labelledby="mfg-slice-output-heading">
            {p.sliceOut.slice(0, SLICE_PREVIEW)}
            {p.sliceOut.length > SLICE_PREVIEW ? '\n…' : ''}
          </pre>
        </>
      ) : null}
    </section>
  )
}

export function CamManufacturePanel(p: ManufactureAuxPanelsProps): ReactNode {
  const [camPreviewTick, setCamPreviewTick] = useState(0)
  const [camPreview, setCamPreview] = useState(() => buildCamSimulationPreview(''))

  function runCamPreview(): void {
    setCamPreview(buildCamSimulationPreview(p.camOut))
    setCamPreviewTick((v) => v + 1)
  }

  return (
    <section className="panel workspace-util-panel" aria-labelledby="mfg-cam-heading">
      <h2 id="mfg-cam-heading">CNC CAM (Laguna / Makera)</h2>
      <p className="msg util-panel-intro">
        Builds G-code from the project mesh. OpenCAMLib is optional; without it, a built-in parallel finish path uses STL
        bounds (set <strong>Python</strong> under File → Settings for OCL). Last run output reports which engine ran and why any
        fallback happened.
      </p>
      <p className="msg">
        G-code is <strong>not verified</strong> for any CNC until you confirm post, units, work offset, and clearances —{' '}
        see <code>docs/MACHINES.md</code>.
      </p>
      <h3 className="subh util-section-heading" id="mfg-cam-run-heading">
        Generate toolpath
      </h3>
      <div
        className="row util-cam-actions"
        role="group"
        aria-label="CAM generation and preview"
        aria-describedby="mfg-cam-run-heading"
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
          No G-code yet. Add a mesh on the <strong>File → Project</strong> tab, then run <strong>Generate toolpath…</strong>.
        </p>
      ) : null}
      {camPreviewTick > 0 ? (
        <div className="msg mfg-cam-preview-wrap" role="status" aria-live="polite" aria-labelledby="mfg-cam-preview-heading">
          <h3 className="subh util-section-heading mfg-cam-preview-h3" id="mfg-cam-preview-heading">
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
          <h3 className="subh util-section-heading" id="mfg-cam-output-heading">
            G-code output
          </h3>
          <CamLastRunHint hint={p.camLastHint} />
          <p className="sr-only" role="status" aria-live="polite">
            CAM output updated, showing {countVisibleLines(p.camOut.slice(0, CAM_PREVIEW))} lines.
          </p>
          <pre className="code" tabIndex={0} aria-labelledby="mfg-cam-output-heading">
            {p.camOut.slice(0, CAM_PREVIEW)}
            {p.camOut.length > CAM_PREVIEW ? '\n…' : ''}
          </pre>
        </>
      ) : null}
    </section>
  )
}

export function ToolsManufacturePanel(p: ManufactureAuxPanelsProps): ReactNode {
  return (
    <section className="panel workspace-util-panel" aria-labelledby="mfg-tools-heading">
      <h2 id="mfg-tools-heading">Tool library</h2>
      <p className="msg util-panel-intro">
        CNC tool definitions for manufacture workflows. Open a project folder on the <strong>File → Project</strong> tab before
        importing — paths resolve against the project directory.
      </p>
      <p className="msg">
        Paste CSV or JSON below, or pick <strong>Import library file…</strong> for <code>.csv</code>, <code>.json</code>,{' '}
        <code>.hsmlib</code> / <code>.tpgz</code> (gzipped XML, best-effort HSM-style). Simple paste CSV:{' '}
        <code>name</code>, <code>diameterMm</code>, <code>fluteCount</code>, <code>type</code>. Use <strong>Import Fusion
        CSV</strong> for wide Fusion Manufacture exports.
      </p>
      <label htmlFor="mfg-tools-import">
        Import data
        <textarea
          id="mfg-tools-import"
          value={p.importText}
          onChange={(e) => p.onImportTextChange(e.target.value)}
          placeholder="Paste CSV or JSON"
          spellCheck={false}
          aria-describedby="mfg-tools-import-hint"
        />
      </label>
      <p id="mfg-tools-import-hint" className="msg">
        Import buttons need an open project folder; open or create a project on the File tab first.
      </p>
      <fieldset className="util-tools-actions" aria-describedby="mfg-tools-import-hint">
        <legend className="util-fieldset-legend">Import format</legend>
        <div className="row">
          <button type="button" onClick={() => void p.onImportToolLibraryFromFile()} disabled={!p.projectDir}>
            Import library file…
          </button>
          <button type="button" className="secondary" onClick={() => void p.onImportTools('csv')} disabled={!p.projectDir}>
            Import CSV
          </button>
          <button type="button" className="secondary" onClick={() => void p.onImportTools('json')} disabled={!p.projectDir}>
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
          <strong>Import library file…</strong>, or add tools from the <strong>Plan</strong> tab in Manufacture — then save the
          project if your workflow writes tools to disk.
        </p>
      ) : null}
      {!p.projectDir ? (
        <p className="msg util-output-placeholder" role="status">
          Open or create a project on the <strong>File → Project</strong> tab so tool paths resolve and imports can run.
        </p>
      ) : null}
    </section>
  )
}
