import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWriteFile,
  mockShowSaveDialog,
  mockLoadURL,
  mockPrintToPDF,
  mockDestroy,
  MockBrowserWindow,
  mockLoadDrawingFile
} = vi.hoisted(() => {
  const mockWriteFile = vi.fn()
  const mockShowSaveDialog = vi.fn()
  const mockLoadURL = vi.fn()
  const mockPrintToPDF = vi.fn()
  const mockDestroy = vi.fn()
  const MockBrowserWindow = vi.fn()
  const mockLoadDrawingFile = vi.fn()
  return {
    mockWriteFile,
    mockShowSaveDialog,
    mockLoadURL,
    mockPrintToPDF,
    mockDestroy,
    MockBrowserWindow,
    mockLoadDrawingFile
  }
})

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: mockShowSaveDialog
  },
  BrowserWindow: MockBrowserWindow
}))

vi.mock('./drawing-file-store', () => ({
  loadDrawingFile: (...args: unknown[]) => mockLoadDrawingFile(...args)
}))

import { runDrawingExport } from './drawing-export-service'

function fakeParent() {
  return {} as Electron.BrowserWindow
}

describe('runDrawingExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadDrawingFile.mockResolvedValue({ version: 1, sheets: [] })
    mockWriteFile.mockResolvedValue(undefined)
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: 'C:\\tmp\\out.dxf'
    })
    MockBrowserWindow.mockImplementation(() => ({
      loadURL: mockLoadURL.mockResolvedValue(undefined),
      webContents: { printToPDF: mockPrintToPDF.mockResolvedValue(Buffer.from('%PDF')) },
      destroy: mockDestroy
    }))
  })

  it('returns canceled when save dialog is dismissed', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: undefined })
    const res = await runDrawingExport(fakeParent(), { kind: 'dxf' })
    expect(res).toEqual({ ok: false, canceled: true, error: 'Canceled' })
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('loads drawing manifest when projectDir is set', async () => {
    mockLoadDrawingFile.mockResolvedValueOnce({
      version: 1,
      sheets: [{ id: 's', name: 'Primary', scale: '1:4' }]
    })
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\tmp\\x.dxf'
    })
    await runDrawingExport(fakeParent(), { kind: 'dxf', projectName: 'P', projectDir: 'C:\\proj' })
    expect(mockLoadDrawingFile).toHaveBeenCalledWith('C:\\proj')
    const [, body] = mockWriteFile.mock.calls[0]
    expect(String(body)).toContain('Primary')
    expect(String(body)).toContain('1:4')
  })

  it('writes placeholder DXF when kind is dxf', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\tmp\\proj_sheet.dxf'
    })
    const res = await runDrawingExport(fakeParent(), { kind: 'dxf', projectName: 'My Proj' })
    expect(res).toEqual({ ok: true, path: 'C:\\tmp\\proj_sheet.dxf' })
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [, body] = mockWriteFile.mock.calls[0]
    expect(typeof body).toBe('string')
    expect(String(body)).toContain('SECTION')
    expect(String(body)).toContain('My Proj')
  })

  it('prints to PDF and writes buffer when kind is pdf', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\tmp\\sheet.pdf'
    })
    const res = await runDrawingExport(fakeParent(), { kind: 'pdf', projectName: 'P' })
    expect(res).toEqual({ ok: true, path: 'C:\\tmp\\sheet.pdf' })
    expect(MockBrowserWindow).toHaveBeenCalled()
    expect(mockLoadURL).toHaveBeenCalled()
    expect(mockPrintToPDF).toHaveBeenCalled()
    expect(mockDestroy).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledWith('C:\\tmp\\sheet.pdf', expect.any(Buffer))
  })

  it('prefixes failures with export kind', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('disk full'))
    const res = await runDrawingExport(fakeParent(), { kind: 'pdf' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('PDF export failed: disk full')
    }
  })
})
