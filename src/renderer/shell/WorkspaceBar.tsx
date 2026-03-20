import { memo } from 'react'

export type Workspace = 'design' | 'assemble' | 'manufacture' | 'utilities'

type Props = {
  workspace: Workspace
  onChange: (w: Workspace) => void
}

const ITEMS: { id: Workspace; label: string }[] = [
  { id: 'design', label: 'Design' },
  { id: 'assemble', label: 'Assemble' },
  { id: 'manufacture', label: 'Manufacture' },
  { id: 'utilities', label: 'Utilities' }
]

export const WorkspaceBar = memo(function WorkspaceBar({ workspace, onChange }: Props) {
  return (
    <nav className="workspace-bar" aria-label="Workspace">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={workspace === it.id ? 'active' : ''}
          aria-current={workspace === it.id ? 'page' : undefined}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  )
})
