import type { ReactNode } from 'react'

export type SplashScreenProps = {
  recentProjectPaths: string[]
  lastProjectPath: string | undefined
  statusMessage: string
  onOpenCommands: () => void
  onOpenSettings: () => void
  onOpenProject: () => void | Promise<void>
  onOpenRecent: (path: string) => void | Promise<void>
  onRemoveRecent: (path: string) => void | Promise<void>
  onNewProject: () => void | Promise<void>
  onNewFromImport: () => void | Promise<void>
  onResumeLast: () => void | Promise<void>
}

export function SplashScreen({
  recentProjectPaths,
  lastProjectPath,
  statusMessage,
  onOpenCommands,
  onOpenSettings,
  onOpenProject,
  onOpenRecent,
  onRemoveRecent,
  onNewProject,
  onNewFromImport,
  onResumeLast
}: SplashScreenProps): ReactNode {
  const showResume = Boolean(lastProjectPath?.trim())

  return (
    <div className="splash-screen">
      <header className="splash-screen-top" aria-label="Splash toolbar">
        <span className="splash-screen-brand">Unified Fab Studio</span>
        <div className="splash-screen-top-actions">
          <button type="button" className="secondary" onClick={onOpenCommands}>
            Commands
          </button>
          <button type="button" className="secondary" onClick={onOpenSettings}>
            Settings
          </button>
        </div>
      </header>
      <main className="splash-screen-main" aria-labelledby="splash-welcome-heading">
        <div className="splash-card">
          <h1 id="splash-welcome-heading" className="splash-card-title">
            Welcome
          </h1>
          <p className="splash-card-lead">
            Open an existing project folder or start a new one. Everything stays on your machine.
          </p>

          {showResume ? (
            <div className="splash-actions splash-actions--primary">
              <button type="button" className="primary splash-btn-large" onClick={() => void onResumeLast()}>
                Open last project
              </button>
              <p className="msg msg--compact splash-last-path" title={lastProjectPath}>
                {lastProjectPath}
              </p>
            </div>
          ) : null}

          <div className={`splash-actions${showResume ? ' splash-actions--secondary' : ''}`} role="group" aria-label="Start">
            <button type="button" className="primary splash-btn-large" onClick={() => void onOpenProject()}>
              Open project folder…
            </button>
            <button type="button" className="secondary splash-btn-large" onClick={() => void onNewProject()}>
              New project
            </button>
            <button
              type="button"
              className="secondary splash-btn-large"
              title="Create a project folder and import STL / STEP / mesh into assets/"
              onClick={() => void onNewFromImport()}
            >
              New project from 3D file…
            </button>
          </div>

          <h2 className="splash-recent-heading" id="splash-recent-heading">
            Recent projects
          </h2>
          {recentProjectPaths.length === 0 ? (
            <p className="msg util-output-placeholder" role="status" aria-labelledby="splash-recent-heading">
              No recent projects yet — use the buttons above.
            </p>
          ) : (
            <ul className="util-recent-list splash-recent-list" aria-labelledby="splash-recent-heading">
              {recentProjectPaths.map((path) => (
                <li key={path} className="util-recent-row">
                  <button
                    type="button"
                    className="secondary util-recent-path"
                    onClick={() => void onOpenRecent(path)}
                    title={path}
                  >
                    {path}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void onRemoveRecent(path)}
                    aria-label={`Remove ${path} from recent projects`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {statusMessage ? (
            <p className="msg splash-status" role="status" aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
