import type { ReactNode } from 'react'
import { IconChevronDown } from './designRibbonIcons'

type IconBtnProps = {
  icon: ReactNode
  label: string
  title?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  commandId?: string
}

export function RibbonIconButton({
  icon,
  label,
  title,
  active,
  disabled,
  onClick,
  commandId
}: IconBtnProps) {
  return (
    <button
      type="button"
      className={`ribbon-icon-btn${active ? ' ribbon-icon-btn--active' : ''}`}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      data-fab-command-id={commandId}
    >
      <span className="ribbon-icon-btn__glyph">{icon}</span>
      <span className="ribbon-icon-btn__label">{label}</span>
    </button>
  )
}

type DropdownProps = {
  label: string
  icon?: ReactNode
  title?: string
  children: ReactNode
  /** When true, panel is wider (e.g. pattern forms) */
  wide?: boolean
}

/** Fusion-style split: main label + chevron opens floating panel */
export function RibbonDropdown({ label, icon, title, children, wide }: DropdownProps) {
  return (
    <details className={`ribbon-dropdown${wide ? ' ribbon-dropdown--wide' : ''}`}>
      <summary className="ribbon-dropdown__summary" title={title}>
        {icon ? <span className="ribbon-dropdown__icon">{icon}</span> : null}
        <span className="ribbon-dropdown__text">{label}</span>
        <span className="ribbon-dropdown__chevron" aria-hidden>
          <IconChevronDown />
        </span>
      </summary>
      <div className="ribbon-dropdown__panel">{children}</div>
    </details>
  )
}

type GroupProps = { label: string; children: ReactNode }

export function RibbonFusionGroup({ label, children }: GroupProps) {
  return (
    <div className="ribbon-fusion-group">
      <span className="ribbon-fusion-group__label">{label}</span>
      <div className="ribbon-fusion-group__tools">{children}</div>
    </div>
  )
}

export type DesignRibbonTabId = 'solid' | 'sketch' | 'constraint' | 'modify' | 'inspect'

export const DESIGN_RIBBON_TABS: { id: DesignRibbonTabId; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'constraint', label: 'Constraint' },
  { id: 'modify', label: 'Modify' },
  { id: 'inspect', label: 'Inspect' }
]
