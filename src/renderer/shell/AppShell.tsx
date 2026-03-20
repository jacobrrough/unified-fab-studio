import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ShellResizeHandle } from './ShellResizeHandle'
import { ShellStatusFooter } from './ShellStatusFooter'
import { useShellResizableColumns } from './useShellResizableColumns'
import { WorkspaceBar, type Workspace } from './WorkspaceBar'

export type { Workspace }

export type UtilityTab = 'project' | 'settings' | 'slice' | 'cam' | 'tools' | 'commands' | 'shortcuts'

type Props = {
  docTitle: string
  headerActions?: ReactNode
  workspace: Workspace
  onWorkspaceChange: (w: Workspace) => void
  utilityTab: UtilityTab
  onUtilityTabChange: (t: UtilityTab) => void
  browser: ReactNode
  timeline: ReactNode | null
  properties: ReactNode
  showProperties: boolean
  onToggleProperties?: () => void
  statusText?: string
  children: ReactNode
}

const UTIL_TABS: { id: UtilityTab; label: string }[] = [
  { id: 'project', label: 'Project' },
  { id: 'settings', label: 'Settings' },
  { id: 'slice', label: 'Slice' },
  { id: 'cam', label: 'CAM' },
  { id: 'tools', label: 'Tools' },
  { id: 'commands', label: 'Commands' },
  { id: 'shortcuts', label: 'Shortcuts' }
]

export function AppShell({
  docTitle,
  headerActions,
  workspace,
  onWorkspaceChange,
  utilityTab,
  onUtilityTabChange,
  browser,
  timeline,
  properties,
  showProperties,
  onToggleProperties,
  statusText,
  children
}: Props) {
  const {
    browserPx,
    propertiesPx,
    onBrowserResizePointerDown,
    onPropertiesResizePointerDown
  } = useShellResizableColumns(showProperties)

  const prevWorkspaceRef = useRef<Workspace | null>(null)
  useEffect(() => {
    const was = prevWorkspaceRef.current
    prevWorkspaceRef.current = workspace
    if (workspace === 'utilities' && was != null && was !== 'utilities') {
      queueMicrotask(() => document.getElementById(`util-tab-${utilityTab}`)?.focus())
    }
  }, [workspace, utilityTab])

  const onUtilityTabButtonKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, tabId: UtilityTab) => {
      const idx = UTIL_TABS.findIndex((x) => x.id === tabId)
      if (idx < 0) return
      let nextIdx = -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        nextIdx = (idx + 1) % UTIL_TABS.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        nextIdx = (idx - 1 + UTIL_TABS.length) % UTIL_TABS.length
      } else if (e.key === 'Home') {
        e.preventDefault()
        nextIdx = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        nextIdx = UTIL_TABS.length - 1
      }
      if (nextIdx < 0) return
      const next = UTIL_TABS[nextIdx]!
      onUtilityTabChange(next.id)
      queueMicrotask(() => document.getElementById(`util-tab-${next.id}`)?.focus())
    },
    [onUtilityTabChange]
  )

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <div className="app-shell-header-left">
          <h1 className="app-title">Unified Fab Studio</h1>
          <span className="app-doc-name" title={docTitle}>
            {docTitle}
          </span>
        </div>
        <div className="app-shell-header-mid">
          <WorkspaceBar workspace={workspace} onChange={onWorkspaceChange} />
        </div>
        <div className="app-shell-header-right">
          {headerActions}
          <button
            type="button"
            className={`secondary properties-toggle ${showProperties ? 'active' : ''}`}
            onClick={onToggleProperties}
            aria-pressed={showProperties}
            aria-expanded={showProperties}
          >
            Properties
          </button>
        </div>
      </header>

      {workspace === 'utilities' && (
        <div className="utility-strip-outer">
          <div
            className="utility-strip"
            role="tablist"
            aria-label="Utilities workspace tabs"
            aria-orientation="horizontal"
            aria-describedby="utility-tablist-kbd-hint"
          >
            {UTIL_TABS.map((t) => (
              <button
                key={t.id}
                id={`util-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={utilityTab === t.id}
                aria-controls="utility-workspace-panel"
                tabIndex={utilityTab === t.id ? 0 : -1}
                className={utilityTab === t.id ? 'active' : ''}
                onClick={() => onUtilityTabChange(t.id)}
                onKeyDown={(e) => onUtilityTabButtonKeyDown(e, t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p id="utility-tablist-kbd-hint" className="sr-only">
            With a tab focused, use Left/Right or Up/Down arrows to move between tabs. Home and End jump to the first or last
            tab.
          </p>
        </div>
      )}

      <div className="app-shell-body">
        <aside className="app-browser" aria-label="Browser" style={{ width: browserPx }}>
          {browser}
        </aside>
        <ShellResizeHandle ariaLabel="Resize browser column" onPointerDown={onBrowserResizePointerDown} />
        <div className="app-content-col">
          <main className="app-content-main" id="app-main" aria-label="Workspace">
            {children}
          </main>
          {timeline != null && <div className="app-timeline">{timeline}</div>}
        </div>
        {showProperties ? (
          <>
            <ShellResizeHandle
              ariaLabel="Resize properties column"
              onPointerDown={onPropertiesResizePointerDown}
            />
            <aside className="app-properties" aria-label="Properties" style={{ width: propertiesPx }}>
              {properties}
            </aside>
          </>
        ) : null}
      </div>

      <ShellStatusFooter statusText={statusText} />
    </div>
  )
}
