type Props = {
  /** Shown in the exported title block when set */
  projectName?: string
  disabled?: boolean
  onExportPdf: () => void
  onExportDxf: () => void
}

/**
 * Fusion-style “Drawing” strip for Utilities: real PDF/DXF template export (no 2D views from the model yet).
 */
export function DrawingExportRibbon({ projectName, disabled, onExportPdf, onExportDxf }: Props) {
  return (
    <div
      className="design-ribbon drawing-export-ribbon"
      role="region"
      aria-label="Drawing template export"
      aria-busy={disabled === true}
      data-fab-ribbon="drawing-export"
    >
      <div className="ribbon-group">
        <span className="ribbon-group-label">Drawing</span>
        <p className="msg drawing-export-hint">
          Export a printable <strong>PDF title block</strong> (A4) or a minimal <strong>DXF</strong> sheet. Model
          projection is not wired yet — use Design for meshes or Manufacture for toolpaths.
          {projectName ? (
            <>
              {' '}
              Current document: <strong>{projectName}</strong>.
            </>
          ) : null}
        </p>
        <div className="ribbon-row" role="group" aria-label="Drawing export formats">
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={onExportPdf}
            aria-label="Export drawing as PDF title block"
          >
            Export PDF…
          </button>
          <button
            type="button"
            className="secondary"
            disabled={disabled}
            onClick={onExportDxf}
            aria-label="Export drawing as placeholder DXF"
          >
            Export DXF…
          </button>
        </div>
      </div>
    </div>
  )
}
