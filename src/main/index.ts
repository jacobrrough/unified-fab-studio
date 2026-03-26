import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerCoreIpc } from './ipc-core'
import { registerFabricationIpc } from './ipc-fabrication'
import { registerModelingIpc } from './ipc-modeling'
import { registerMainProcessDiagnostics } from './main-process-diagnostics'
import { getAppProductFromBuild, getAppWindowTitle } from '../shared/app-product'

registerMainProcessDiagnostics()

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: getAppWindowTitle(getAppProductFromBuild())
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    if (process.env.NODE_ENV !== 'production') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  createWindow()

  const ipcCtx = { getMainWindow: () => mainWindow }
  registerCoreIpc(ipcCtx)
  registerModelingIpc(ipcCtx)
  registerFabricationIpc(ipcCtx)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
