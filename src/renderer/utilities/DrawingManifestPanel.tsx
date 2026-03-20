import { useCallback, useId, useState, type ReactNode } from 'react'
import type { DrawingFile, DrawingViewPlaceholder, ViewFromAxis } from '../../shared/drawing-sheet-schema'
import { patchViewPlaceholder, replaceViewPlaceholderLabel } from '../../shared/drawing-sheet-schema'

const VIEW_AXES: { value: ViewFromAxis; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'iso', label: 'Iso' }
]

export type DrawingManifestPanelProps = {
  projectDir: string | null
  drawingFile: DrawingFile
  onPatchDrawingFirstSheet: (partial: {
    name?: string
    scale?: string
    viewPlaceholders?: DrawingViewPlaceholder[]
  }) => void
  onSaveDrawingManifest: () => void | Promise<void>
}

/**
 * Utilities → Project: `drawing/drawing.json` first-sheet metadata and view placeholder slots (labels only — no 2D projection).
 */
export function DrawingManifestPanel({
  projectDir,
  drawingFile,
  onPatchDrawingFirstSheet,
  onSaveDrawingManifest
}: DrawingManifestPanelProps): ReactNode {
  const sheet = drawingFile.sheets[0]
  const announceId = useId()
  const [announce, setAnnounce] = useState('')

  const pushAnnounce = useCallback((msg: string) => {
    setAnnounce(msg)
  }, [])

  const patchSheet = useCallback(
    (partial: { name?: string; scale?: string; viewPlaceholders?: DrawingViewPlaceholder[] }) => {
      onPatchDrawingFirstSheet(partial)
    },
    [onPatchDrawingFirstSheet]
  )

  const onPlaceholderLabelChange = useCallback(
    (id: string, label: string) => {
      if (!sheet?.name?.trim()) return
      const next = replaceViewPlaceholderLabel(sheet.viewPlaceholders ?? [], id, label)
      patchSheet({ name: sheet.name, scale: sheet.scale ?? '', viewPlaceholders: next })
    },
    [patchSheet, sheet]
  )

  const addSlot = useCallback(
    (kind: 'base' | 'projected') => {
      if (!sheet?.name?.trim()) return
      const n = (sheet.viewPlaceholders?.length ?? 0) + 1
      const existing = sheet.viewPlaceholders ?? []
      const firstBase = existing.find((x) => x.kind === 'base')
      const next: DrawingViewPlaceholder[] = [
        ...existing,
        kind === 'base'
          ? {
              id: crypto.randomUUID(),
              kind,
              label: `Base ${n}`,
              viewFrom: 'front' as const
            }
          : {
              id: crypto.randomUUID(),
              kind,
              label: `Projected ${n}`,
              parentPlaceholderId: firstBase?.id,
              projectionDirection: 'right' as const
            }
      ]
      patchSheet({ name: sheet.name, scale: sheet.scale ?? '', viewPlaceholders: next })
      pushAnnounce(
        kind === 'base'
          ? `Added base view slot. ${next.length} placeholder${next.length === 1 ? '' : 's'} on sheet.`
          : `Added projected view slot. ${next.length} placeholder${next.length === 1 ? '' : 's'} on sheet.`
      )
    },
    [patchSheet, pushAnnounce, sheet]
  )

  const onPlaceholderMetaChange = useCallback(
    (id: string, patch: Partial<Pick<DrawingViewPlaceholder, 'viewFrom' | 'parentPlaceholderId' | 'projectionDirection'>>) => {
      if (!sheet?.name?.trim()) return
      const next = patchViewPlaceholder(sheet.viewPlaceholders ?? [], id, patch)
      patchSheet({ name: sheet.name, scale: sheet.scale ?? '', viewPlaceholders: next })
    },
    [patchSheet, sheet]
  )

  const removeSlot = useCallback(
    (id: string) => {
      if (!sheet?.name?.trim()) return
      const next = (sheet.viewPlaceholders ?? []).filter((x) => x.id !== id)
      patchSheet({ name: sheet.name, scale: sheet.scale ?? '', viewPlaceholders: next })
      pushAnnounce(
        next.length === 0
          ? 'Removed placeholder. No view placeholders on sheet.'
          : `Removed placeholder. ${next.length} remain.`
      )
    },
    [patchSheet, pushAnnounce, sheet]
  )

  const clearSlots = useCallback(() => {
    if (!sheet?.name?.trim()) return
    patchSheet({ name: sheet.name, scale: sheet.scale ?? '', viewPlaceholders: [] })
    pushAnnounce('Cleared all view placeholders.')
  }, [patchSheet, pushAnnounce, sheet])

  const placeholders = sheet?.viewPlaceholders ?? []

  return (
    <section
      className="drawing-manifest-panel"
      aria-labelledby="util-drawing-manifest-heading"
    >
      <h3 id="util-drawing-manifest-heading" className="subh util-section-heading" style={{ marginTop: '1rem' }}>
        Drawing manifest
      </h3>
      {!projectDir ? (
        <p className="msg util-output-placeholder" role="status">
          Open a project folder on the <strong>Project</strong> tab to edit and save <code>drawing/drawing.json</code>.
        </p>
      ) : null}
      <p className="msg util-panel-intro">
        Optional <code>drawing/drawing.json</code>: sheet <strong>name</strong> and <strong>scale</strong> feed PDF/DXF title
        blocks. <strong>View placeholders</strong> carry <strong>labels</strong> plus <strong>view direction</strong> metadata
        for the export shell — still <strong>no</strong> 2D projection from the 3D model (preview text only).
      </p>
      <div id={announceId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <label htmlFor="util-drawing-sheet-name">
          Primary sheet name
          <input
            id="util-drawing-sheet-name"
            value={sheet?.name ?? ''}
            onChange={(e) =>
              patchSheet({
                name: e.target.value,
                scale: sheet?.scale ?? ''
              })
            }
            placeholder="e.g. General"
            disabled={!projectDir}
            autoComplete="off"
          />
        </label>
        <label htmlFor="util-drawing-sheet-scale">
          Scale (optional)
          <input
            id="util-drawing-sheet-scale"
            value={sheet?.scale ?? ''}
            onChange={(e) =>
              patchSheet({
                name: sheet?.name ?? '',
                scale: e.target.value
              })
            }
            placeholder="1:1"
            disabled={!projectDir}
            autoComplete="off"
          />
        </label>
      </div>
      <button
        type="button"
        className="secondary"
        style={{ marginTop: '0.5rem' }}
        disabled={!projectDir}
        onClick={() => void onSaveDrawingManifest()}
      >
        Save drawing manifest
      </button>
      <fieldset
        className="drawing-manifest-placeholders-fieldset"
        style={{ marginTop: '0.75rem', border: '1px solid var(--border)', borderRadius: 6, padding: '0.65rem 0.75rem' }}
      >
        <legend className="util-fieldset-legend">View placeholders</legend>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            className="secondary"
            disabled={!projectDir || !sheet?.name?.trim()}
            onClick={() => addSlot('base')}
          >
            + Base view slot
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!projectDir || !sheet?.name?.trim()}
            onClick={() => addSlot('projected')}
          >
            + Projected view slot
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!projectDir || !sheet?.name?.trim()}
            onClick={clearSlots}
          >
            Clear view slots
          </button>
        </div>
        {placeholders.length > 0 ? (
          <ul className="tools drawing-manifest-placeholder-list" aria-label="Drawing view placeholders" style={{ marginTop: '0.5rem' }}>
            {placeholders.map((v) => (
              <li key={v.id} className="drawing-manifest-placeholder-item">
                <span className="drawing-manifest-kind" aria-hidden="true">
                  {v.kind}
                </span>
                <label className="drawing-manifest-label-edit">
                  <span className="sr-only">
                    {v.kind === 'base' ? 'Base' : 'Projected'} view placeholder label
                  </span>
                  <input
                    value={v.label}
                    onChange={(e) => onPlaceholderLabelChange(v.id, e.target.value)}
                    placeholder={v.kind === 'base' ? 'e.g. Front' : 'e.g. Right'}
                    autoComplete="off"
                  />
                </label>
                {v.kind === 'base' ? (
                  <label className="drawing-manifest-axis" style={{ marginLeft: '0.5rem' }}>
                    <span className="sr-only">View from axis</span>
                    <select
                      value={v.viewFrom ?? 'front'}
                      onChange={(e) =>
                        onPlaceholderMetaChange(v.id, { viewFrom: e.target.value as ViewFromAxis })
                      }
                      aria-label="Base view orthographic axis"
                    >
                      {VIEW_AXES.map((o) => (
                        <option key={o.value} value={o.value}>
                          From {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="drawing-manifest-axis" style={{ marginLeft: '0.5rem' }}>
                      <span className="sr-only">Parent base view</span>
                      <select
                        value={v.parentPlaceholderId ?? ''}
                        onChange={(e) =>
                          onPlaceholderMetaChange(v.id, {
                            parentPlaceholderId: e.target.value || undefined
                          })
                        }
                        aria-label="Projected view parent"
                      >
                        <option value="">Parent…</option>
                        {placeholders
                          .filter((b) => b.kind === 'base')
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label.trim() || 'Base view'}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="drawing-manifest-axis" style={{ marginLeft: '0.35rem' }}>
                      <span className="sr-only">Projection direction</span>
                      <select
                        value={v.projectionDirection ?? 'right'}
                        onChange={(e) =>
                          onPlaceholderMetaChange(v.id, {
                            projectionDirection: e.target.value as ViewFromAxis
                          })
                        }
                        aria-label="Projected view direction"
                      >
                        {VIEW_AXES.map((o) => (
                          <option key={o.value} value={o.value}>
                            Dir {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button
                  type="button"
                  className="secondary"
                  style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}
                  onClick={() => removeSlot(v.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="msg" style={{ marginTop: '0.5rem', marginBottom: 0 }} role="status">
            No view placeholders yet. Add a slot when the sheet name is set.
          </p>
        )}
      </fieldset>
    </section>
  )
}
