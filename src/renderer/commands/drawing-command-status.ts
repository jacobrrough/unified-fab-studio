import type { FusionStyleCommand } from '../../shared/fusion-style-command-catalog'

/** Status line when a drawing-related command is run from the palette (Stream E). */
export function drawingPaletteStatusFor(cmd: FusionStyleCommand): string {
  switch (cmd.id) {
    case 'dr_new_sheet':
      return 'Drawing manifest — set primary sheet name/scale on the Project tab, save, then export PDF/DXF.'
    case 'dr_base_view':
      return 'Base view — Project tab: **+ Base view slot**, set **View from**, edit the label, save, then export PDF/DXF. Preview metadata on the sheet only — no projected model geometry.'
    case 'dr_projected_view':
      return 'Projected view — Project tab: **+ Projected view slot**, pick **parent** + **direction**, save, then export PDF/DXF. Preview metadata only — no projected model geometry.'
    default:
      return `${cmd.label} — Project tab: drawing manifest and export shell.`
  }
}
