import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { resolveExportViewRows } from '../shared/drawing-sheet-schema'
import {
  buildPlaceholderDxf,
  buildTitleBlockHtml,
  sanitizeFileStem
} from './drawing-export-templates'
import { loadDrawingFile } from './drawing-file-store'

export type DrawingExportPayload = { kind: 'pdf' | 'dxf'; projectName?: string; projectDir?: string }

export type DrawingExportResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error: string }

export async function runDrawingExport(
  parent: BrowserWindow,
  payload: DrawingExportPayload
): Promise<DrawingExportResult> {
  const stem = sanitizeFileStem(payload.projectName ?? 'drawing')
  const defaultName = payload.kind === 'pdf' ? `${stem}_sheet.pdf` : `${stem}_sheet.dxf`
  const filters =
    payload.kind === 'pdf'
      ? [{ name: 'PDF', extensions: ['pdf'] }]
      : [{ name: 'DXF', extensions: ['dxf'] }]

  const picked = await dialog.showSaveDialog(parent, {
    title: payload.kind === 'pdf' ? 'Export drawing PDF' : 'Export drawing DXF',
    defaultPath: defaultName,
    filters
  })

  if (picked.canceled || !picked.filePath) {
    return { ok: false, canceled: true, error: 'Canceled' }
  }

  const outPath = picked.filePath
  const now = new Date().toISOString()
  const projectTitle = payload.projectName?.trim() || 'Untitled project'

  let sheetTitle: string | undefined
  let sheetScale: string | undefined
  let viewPlaceholders: { kind: string; label: string; detailLine?: string }[] | undefined
  if (payload.projectDir) {
    try {
      const df = await loadDrawingFile(payload.projectDir)
      const sh = df.sheets[0]
      if (sh) {
        sheetTitle = sh.name
        sheetScale = sh.scale
        if (sh.viewPlaceholders?.length) {
          viewPlaceholders = resolveExportViewRows(sh.viewPlaceholders)
        }
      }
    } catch {
      /* malformed drawing.json — still export template */
    }
  }

  try {
    if (payload.kind === 'dxf') {
      const body = buildPlaceholderDxf({
        projectTitle,
        generatedAtIso: now,
        sheetTitle,
        sheetScale,
        viewPlaceholders
      })
      await writeFile(outPath, body, 'utf-8')
      return { ok: true, path: outPath }
    }

    const html = buildTitleBlockHtml({
      projectTitle,
      generatedAtIso: now,
      appLabel: 'Unified Fab Studio',
      sheetTitle,
      sheetScale,
      viewPlaceholders
    })
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`

    const hidden = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    try {
      await hidden.loadURL(dataUrl)
      const pdf = await hidden.webContents.printToPDF({
        printBackground: true,
        landscape: false,
        pageSize: 'A4',
        margins: { marginType: 'default' }
      })
      await writeFile(outPath, pdf)
    } finally {
      hidden.destroy()
    }

    return { ok: true, path: outPath }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const label = payload.kind === 'pdf' ? 'PDF' : 'DXF'
    const detail = msg.trim() || 'unknown error'
    return { ok: false, error: `${label} export failed: ${detail}` }
  }
}
