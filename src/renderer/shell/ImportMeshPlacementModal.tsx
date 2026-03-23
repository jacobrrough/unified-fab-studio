import { useEffect, useId, useState } from 'react'
import type { MeshImportPlacement, MeshImportUpAxis } from '../../shared/mesh-import-placement'
import { MESH_IMPORT_PLACEMENT_DEFAULTS } from '../../shared/mesh-import-placement'

type Props = {
  open: boolean
  fileCount: number
  onConfirm: (placement: MeshImportPlacement, upAxis: MeshImportUpAxis) => void
  onCancel: () => void
}

const PLACEMENT_OPTIONS: { id: MeshImportPlacement; label: string; hint: string }[] = [
  {
    id: 'as_is',
    label: 'Keep file origin',
    hint: 'No translation; use when the model is already positioned for Y-up / mm.'
  },
  {
    id: 'center_origin',
    label: 'Center at world origin',
    hint: 'Moves the bounding box center to (0, 0, 0).'
  },
  {
    id: 'center_xy_ground_z',
    label: 'Center on ground (XY centered, bottom at Z = 0)',
    hint: 'Useful for parts that should sit on the build plane.'
  }
]

const UP_AXIS_OPTIONS: { id: MeshImportUpAxis; label: string; hint: string }[] = [
  { id: 'y_up', label: 'Y-up (default)', hint: 'Matches this app’s viewport and sketch axes.' },
  {
    id: 'z_up',
    label: 'Z-up (CAD-style) → rotate to Y-up',
    hint: 'Applies a −90° rotation about X so model “up” becomes +Y before placement.'
  }
]

export function ImportMeshPlacementModal({ open, fileCount, onConfirm, onCancel }: Props) {
  const titleId = useId()
  const [placement, setPlacement] = useState<MeshImportPlacement>(MESH_IMPORT_PLACEMENT_DEFAULTS.placement)
  const [upAxis, setUpAxis] = useState<MeshImportUpAxis>(MESH_IMPORT_PLACEMENT_DEFAULTS.upAxis)

  useEffect(() => {
    if (!open) return
    setPlacement(MESH_IMPORT_PLACEMENT_DEFAULTS.placement)
    setUpAxis(MESH_IMPORT_PLACEMENT_DEFAULTS.upAxis)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const fileLabel = fileCount === 1 ? '1 file' : `${fileCount} files`

  return (
    <div
      className="import-placement-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="import-placement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="import-placement-title">
          Import positioning
        </h2>
        <p className="import-placement-lead msg msg--muted">
          {fileLabel} selected. Choose how meshes are placed in model space. The same options apply to each file. Binary STL
          output under <code>assets/</code> is updated; ASCII STL cannot be repositioned (you will get a clear error).
        </p>

        <fieldset className="import-placement-fieldset">
          <legend className="import-placement-legend">Position</legend>
          {PLACEMENT_OPTIONS.map((o) => (
            <label key={o.id} className="import-placement-radio">
              <input
                type="radio"
                name="import-placement"
                value={o.id}
                checked={placement === o.id}
                onChange={() => setPlacement(o.id)}
              />
              <span className="import-placement-radio-body">
                <span className="import-placement-radio-label">{o.label}</span>
                <span className="import-placement-radio-hint">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="import-placement-fieldset">
          <legend className="import-placement-legend">Up axis</legend>
          {UP_AXIS_OPTIONS.map((o) => (
            <label key={o.id} className="import-placement-radio">
              <input
                type="radio"
                name="import-up-axis"
                value={o.id}
                checked={upAxis === o.id}
                onChange={() => setUpAxis(o.id)}
              />
              <span className="import-placement-radio-body">
                <span className="import-placement-radio-label">{o.label}</span>
                <span className="import-placement-radio-hint">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="import-placement-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onConfirm(placement, upAxis)} autoFocus>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
