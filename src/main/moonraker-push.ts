/**
 * Moonraker HTTP API helpers for the Creality K2 Plus (and any Klipper/Moonraker printer).
 *
 * Moonraker is the REST API layer that ships with Klipper on the K2 Plus. This
 * module provides push (upload + optionally start) and status polling helpers
 * that the renderer invokes via IPC (`moonraker:push`, `moonraker:status`,
 * `moonraker:cancel`).
 *
 * Docs: https://moonraker.readthedocs.io/en/latest/web_api/
 *
 * IMPORTANT: This module uses Node.js `http` / `https` — no browser APIs.
 * All requests are made from the main process (Electron main); CORS does not apply.
 */

import { createReadStream, statSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { basename } from 'node:path'
import { URL } from 'node:url'

export type MoonrakerPushPayload = {
  /** Full path to the .gcode file on disk. */
  gcodePath: string
  /**
   * Moonraker base URL, e.g. "http://192.168.1.50" or "http://k2plus.local".
   * Include port if non-default (e.g. "http://192.168.1.50:7125").
   */
  printerUrl: string
  /**
   * Moonraker virtual SD card sub-directory. Defaults to "" (root).
   * Creality K2 Plus typically stores files in the root of the virtual SD.
   */
  uploadPath?: string
  /** If true, start the print immediately after a successful upload. */
  startAfterUpload?: boolean
  /** Timeout for each HTTP request in ms. Defaults to 15 000. */
  timeoutMs?: number
}

export type MoonrakerPushResult =
  | {
      ok: true
      filename: string
      uploadedPath: string
      printStarted: boolean
      printerUrl: string
    }
  | { ok: false; error: string; detail?: string }

export type MoonrakerStatusResult =
  | {
      ok: true
      state: 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error' | 'unknown'
      filename?: string
      progress?: number
      /** Estimated seconds remaining (may be undefined if printer hasn't calculated yet). */
      etaSeconds?: number
      rawState?: string
    }
  | { ok: false; error: string; detail?: string }

// ─── internal HTTP helpers ─────────────────────────────────────────────────

function makeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  rawUrl: string,
  opts: {
    body?: Buffer | string
    contentType?: string
    timeoutMs?: number
  } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl)
    const isHttps = u.protocol === 'https:'
    const lib = isHttps ? https : http
    const reqHeaders: Record<string, string | number> = {}
    if (opts.body != null) {
      const bodyBuf = typeof opts.body === 'string' ? Buffer.from(opts.body, 'utf-8') : opts.body
      reqHeaders['Content-Type'] = opts.contentType ?? 'application/octet-stream'
      reqHeaders['Content-Length'] = bodyBuf.length
    }
    const reqOpts: http.RequestOptions = {
      method,
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : isHttps ? 443 : 80,
      path: u.pathname + u.search,
      headers: reqHeaders
    }
    const timeout = opts.timeoutMs ?? 15_000
    const req = lib.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (d: Buffer) => chunks.push(d))
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') })
      })
    })
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Request timed out after ${timeout} ms`))
    })
    req.on('error', reject)
    if (opts.body != null) {
      const bodyBuf = typeof opts.body === 'string' ? Buffer.from(opts.body, 'utf-8') : opts.body
      req.write(bodyBuf)
    }
    req.end()
  })
}

/**
 * Multipart/form-data upload using Node.js's built-in http module.
 * Moonraker's `/server/files/upload` endpoint requires multipart form data.
 */
async function uploadFileMultipart(
  printerUrl: string,
  localPath: string,
  remoteFilename: string,
  uploadPath: string,
  timeoutMs: number
): Promise<{ status: number; body: string }> {
  const boundary = `----MoonrakerFormBoundary${Date.now().toString(16)}`
  const fileBuffer = await import('node:fs/promises').then((m) => m.readFile(localPath))
  const partHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${remoteFilename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  let pathPart = ''
  if (uploadPath) {
    pathPart =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="path"\r\n\r\n` +
      `${uploadPath}\r\n`
  }
  const trailer = `\r\n--${boundary}--\r\n`
  const body = Buffer.concat([
    Buffer.from(pathPart + partHeader, 'latin1'),
    fileBuffer,
    Buffer.from(trailer, 'latin1')
  ])
  const uploadUrl = `${printerUrl.replace(/\/$/, '')}/server/files/upload`
  return makeRequest('POST', uploadUrl, {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    timeoutMs
  })
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Upload a G-code file to a Moonraker printer and optionally start the print.
 *
 * Endpoint used: POST /server/files/upload
 * Start endpoint: POST /printer/print/start?filename=...
 *
 * Both endpoints require no authentication on most home-network setups;
 * add API key support when the user has enabled it in moonraker.conf.
 */
export async function moonrakerPush(payload: MoonrakerPushPayload): Promise<MoonrakerPushResult> {
  const {
    gcodePath,
    printerUrl,
    uploadPath = '',
    startAfterUpload = false,
    timeoutMs = 15_000
  } = payload

  const filename = basename(gcodePath)

  // Verify the local file exists before trying to push
  try {
    statSync(gcodePath)
  } catch {
    return {
      ok: false,
      error: 'G-code file not found.',
      detail: `Path: ${gcodePath} — generate or export the file first (Manufacture → Run).`
    }
  }

  // Upload
  let uploadResult: { status: number; body: string }
  try {
    uploadResult = await uploadFileMultipart(printerUrl, gcodePath, filename, uploadPath, timeoutMs)
  } catch (e) {
    return {
      ok: false,
      error: 'Upload failed — could not connect to printer.',
      detail: e instanceof Error ? e.message : String(e)
    }
  }

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    let detail = uploadResult.body.slice(0, 300)
    try {
      const parsed = JSON.parse(uploadResult.body)
      if (parsed.error) detail = parsed.error
    } catch { /* ignore */ }
    return {
      ok: false,
      error: `Upload failed — printer returned HTTP ${uploadResult.status}.`,
      detail
    }
  }

  // Determine the uploaded path from the response
  let uploadedPath = filename
  try {
    const parsed = JSON.parse(uploadResult.body)
    uploadedPath = parsed.item?.path ?? parsed.path ?? filename
  } catch { /* ignore */ }

  if (!startAfterUpload) {
    return { ok: true, filename, uploadedPath, printStarted: false, printerUrl }
  }

  // Start print
  const startUrl = `${printerUrl.replace(/\/$/, '')}/printer/print/start?filename=${encodeURIComponent(uploadedPath)}`
  let startResult: { status: number; body: string }
  try {
    startResult = await makeRequest('POST', startUrl, { timeoutMs })
  } catch (e) {
    return {
      ok: false,
      error: 'File uploaded but failed to start print.',
      detail: e instanceof Error ? e.message : String(e)
    }
  }

  if (startResult.status < 200 || startResult.status >= 300) {
    let detail = startResult.body.slice(0, 300)
    try {
      const parsed = JSON.parse(startResult.body)
      if (parsed.error) detail = parsed.error
    } catch { /* ignore */ }
    return {
      ok: false,
      error: `File uploaded but print start failed (HTTP ${startResult.status}).`,
      detail
    }
  }

  return { ok: true, filename, uploadedPath, printStarted: true, printerUrl }
}

/**
 * Query Moonraker for current print status.
 * Endpoint: GET /printer/objects/query?print_stats
 */
export async function moonrakerStatus(
  printerUrl: string,
  timeoutMs = 8_000
): Promise<MoonrakerStatusResult> {
  const url = `${printerUrl.replace(/\/$/, '')}/printer/objects/query?print_stats`
  let result: { status: number; body: string }
  try {
    result = await makeRequest('GET', url, { timeoutMs })
  } catch (e) {
    return {
      ok: false,
      error: 'Could not reach printer.',
      detail: e instanceof Error ? e.message : String(e)
    }
  }

  if (result.status < 200 || result.status >= 300) {
    return { ok: false, error: `Printer returned HTTP ${result.status}.`, detail: result.body.slice(0, 200) }
  }

  let rawState = 'unknown'
  let filename: string | undefined
  let progress: number | undefined
  let etaSeconds: number | undefined
  try {
    const parsed = JSON.parse(result.body)
    const stats = parsed?.result?.status?.print_stats ?? {}
    rawState = stats.state ?? 'unknown'
    filename = stats.filename || undefined
    progress = typeof stats.progress === 'number' ? stats.progress : undefined
    // Moonraker can provide print_duration and total_duration for ETA
    const totalDuration: number | undefined =
      typeof stats.total_duration === 'number' ? stats.total_duration : undefined
    const printDuration: number | undefined =
      typeof stats.print_duration === 'number' ? stats.print_duration : undefined
    if (progress != null && progress > 0 && printDuration != null && printDuration > 0) {
      const totalEstimate = printDuration / progress
      etaSeconds = Math.max(0, Math.round(totalEstimate - printDuration))
    } else if (totalDuration != null && printDuration != null && progress != null && progress > 0) {
      etaSeconds = Math.max(0, Math.round(totalDuration * (1 - progress)))
    }
  } catch {
    // couldn't parse — return unknown state
  }

  type PrinterState = 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error' | 'unknown'
  const knownStates = new Set<string>(['standby', 'printing', 'paused', 'complete', 'cancelled', 'error'])
  const state: PrinterState = knownStates.has(rawState) ? (rawState as PrinterState) : 'unknown'

  return {
    ok: true,
    state,
    filename,
    progress,
    etaSeconds,
    rawState
  }
}

/**
 * Cancel the current print job.
 * Endpoint: POST /printer/print/cancel
 */
export async function moonrakerCancel(
  printerUrl: string,
  timeoutMs = 8_000
): Promise<{ ok: boolean; error?: string }> {
  const url = `${printerUrl.replace(/\/$/, '')}/printer/print/cancel`
  let result: { status: number; body: string }
  try {
    result = await makeRequest('POST', url, { timeoutMs })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  if (result.status < 200 || result.status >= 300) {
    return { ok: false, error: `HTTP ${result.status}: ${result.body.slice(0, 100)}` }
  }
  return { ok: true }
}
