import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWriteFile,
  mockReadFile,
  mockShowSaveDialog,
  mockLoadURL,
  mockPrintToPDF,
  mockDestroy,
  MockBrowserWindow,
  mockLoadDrawingFile
} = vi.hoisted(() => {
  const mockWriteFile = vi.fn()
  const mockReadFile = vi.fn()
  const mockShowSaveDialog = vi.fn()
  const mockLoadURL = vi.fn()
  const mockPrintToPDF = vi.fn()
  const mockDestroy = vi.fn()
  const MockBrowserWindow = vi.fn()
  const mockLoadDrawingFile = vi.fn()
  return {
    mockWriteFile,
    mockReadFile,
    mockShowSaveDialog,
    mockLoadURL,
    mockPrintToPDF,
    mockDestroy,
    MockBrowserWindow,
    mockLoadDrawingFile
  }
})

const mockProjectDrawingViews = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  readFile: mockReadFile
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: mockShowSaveDialog
  },
  BrowserWindow: MockBrowserWindow,
  app: { getAppPath: () => 'C:\\\\app' }
}))

vi.mock('./drawing-file-store', () => ({
  loadDrawingFile: (...args: unknown[]) => mockLoadDrawingFile(...args)
}))

vi.mock('./settings-store', () => ({
  loadSettings: vi.fn().mockResolvedValue({ theme: 'dark' as const })
}))

vi.mock('./drawing-project-model-views', () => ({
  projectDrawingViewsFromKernelStl: mockProjectDrawingViews
}))

import { runDrawingExport } from './drawing-export-service'

function fakeParent() {
  return {} as Electron.BrowserWindow
}

describe('runDrawingExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectDrawingViews.mockResolvedValue({ ok: false, error: 'kernel_stl_missing' })
    mockLoadDrawingFile.mockResolvedValue({ version: 1, sheets: [] })
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockRejectedValue(new Error('missing'))
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

  it('writes flat pattern DXF geometry when project has sketch + features', async () => {
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\tmp\\flat.dxf'
    })
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith('design\\sketch.json')) {
        return JSON.stringify({
          version: 2,
          points: {
            p1: { x: 0, y: 0 },
            p2: { x: 20, y: 0 },
            p3: { x: 20, y: 10 },
            p4: { x: 0, y: 10 }
          },
          entities: [{ id: 'poly', kind: 'polyline', pointIds: ['p1', 'p2', 'p3', 'p4'], closed: true }],
          constraints: [],
          dimensions: [],
          parameters: {},
          extrudeDepthMm: 5
        })
      }
      if (path.endsWith('part\\features.json')) {
        return JSON.stringify({
          version: 1,
          items: [],
          kernelOps: [{ kind: 'sheet_fold', bendLineYMm: 5, bendRadiusMm: 1, bendAngleDeg: 90, kFactor: 0.44 }]
        })
      }
      throw new Error('unexpected path')
    })
    const res = await runDrawingExport(fakeParent(), { kind: 'dxf', projectName: 'Flat', projectDir: 'C:\\proj' })
    expect(res).toEqual({ ok: true, path: 'C:\\tmp\\flat.dxf' })
    const [, body] = mockWriteFile.mock.calls[0]
    expect(String(body)).toContain('BEND')
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

  it('embeds Tier A projection in PDF when kernel projector succeeds', async () => {
    mockProjectDrawingViews.mockResolvedValueOnce({
      ok: true,
      views: [
        {
          id: 'v1',
          label: 'Front',
          axis: 'front',
          segments: [
            { x1: 0, y1: 0, x2: 10, y2: 0 },
            { x1: 10, y1: 0, x2: 10, y2: 10 }
          ]
        }
      ]
    })
    mockLoadDrawingFile.mockResolvedValueOnce({
      version: 1,
      sheets: [
        {
          id: 's',
          name: 'S1',
          viewPlaceholders: [{ id: 'v1', kind: 'base' as const, label: 'Front', viewFrom: 'front' as const }]
        }
      ]
    })
    mockShowSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\tmp\\proj.pdf'
    })
    await runDrawingExport(fakeParent(), { kind: 'pdf', projectDir: 'C:\\proj', projectName: 'P' })
    const dataUrl = mockLoadURL.mock.calls[0]?.[0] as string
    expect(dataUrl.startsWith('data:text/html;charset=utf-8,')).toBe(true)
    const html = decodeURIComponent(dataUrl.slice('data:text/html;charset=utf-8,'.length))
    expect(html).toContain('Tier A')
    expect(html).toContain('<line ')
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
