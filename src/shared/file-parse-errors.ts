import { ZodError, type ZodIssue } from 'zod'

/** Node / fs "file missing" — safe in renderer (never true) and main. */
export function isENOENT(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT'
}

export function parseJsonText(raw: string, fileLabel: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (e) {
    const m = e instanceof SyntaxError ? e.message : String(e)
    throw new Error(`${fileLabel}: invalid JSON (${m})`)
  }
}

const MAX_ISSUES = 8

function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length ? issue.path.map(String).join('.') : '(root)'
  if (issue.code === 'invalid_type') {
    const received = issue.received === 'undefined' ? 'missing' : issue.received
    if (issue.expected !== received) {
      return `${path}: ${issue.message} (expected ${issue.expected}, got ${received})`
    }
  }
  if (issue.code === 'invalid_enum_value') {
    return `${path}: ${issue.message} (got ${String(issue.received)})`
  }
  if (issue.code === 'invalid_literal') {
    return `${path}: ${issue.message} (expected ${JSON.stringify(issue.expected)})`
  }
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    return `${path}: ${issue.message}`
  }
  return `${path}: ${issue.message}`
}

/** Human-readable Zod failure for IPC / status lines (Zod 3). */
export function formatZodError(err: unknown, fileLabel: string): string {
  if (err instanceof ZodError) {
    const parts = err.issues.slice(0, MAX_ISSUES).map((issue) => formatZodIssue(issue))
    const more = err.issues.length > MAX_ISSUES ? ` (+${err.issues.length - MAX_ISSUES} more)` : ''
    return `${fileLabel} — ${parts.join('; ')}${more}`
  }
  if (err instanceof Error) return `${fileLabel}: ${err.message}`
  return `${fileLabel}: ${String(err)}`
}

/**
 * Renderer-side: ensure load/IPC rejections name the file even when the message is generic.
 * Main already uses {@link formatZodError} for Zod failures; this avoids duplicate labels.
 */
export function formatLoadRejection(fileLabel: string, reason: unknown): string {
  const inner = reason instanceof Error ? reason.message : String(reason)
  const trimmed = inner.trim()
  if (!trimmed) return `${fileLabel}: load failed`
  if (trimmed.includes(fileLabel)) return trimmed
  return `${fileLabel} — ${trimmed}`
}
