import type { ReactNode } from 'react'

/** Inspect tab while still in 2D sketch phase — nudge user back to model for 3D tools. */
export function InspectRibbonSketchGatePanel(): ReactNode {
  return (
    <div className="ribbon-toolbar-strip">
      <div className="ribbon-group ribbon-group--in-tab">
        <p className="msg sketch-gate-msg">
          <strong>Finish sketch</strong> to use 3D measure and section on the model view.
        </p>
      </div>
    </div>
  )
}
