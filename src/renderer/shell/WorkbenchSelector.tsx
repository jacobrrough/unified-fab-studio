import { memo } from 'react'
import type { Workspace } from './WorkspaceBar'

type Props = {
  workspace: Workspace
  onChange: (w: Workspace) => void
  id?: string
}

const OPTIONS: { id: Workspace; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'assemble', label: 'Assemble' },
  { id: 'manufacture', label: 'Manufacture' },
  { id: 'utilities', label: 'File' }
]

export const WorkbenchSelector = memo(function WorkbenchSelector({ workspace, onChange, id }: Props) {
  return (
    <label className="workbench-selector">
      <span className="workbench-selector__label">Workbench</span>
      <select
        id={id}
        className="workbench-selector__select"
        value={workspace}
        onChange={(e) => onChange(e.target.value as Workspace)}
        aria-label="Workbench"
        title="Switch workbench (workspace)"
      >
        {OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
})
