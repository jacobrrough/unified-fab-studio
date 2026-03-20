import { z } from 'zod'

/** Orthographic “view from” / projection direction (documentation metadata; no real 2D projection yet). */
export const viewFromAxisSchema = z.enum(['front', 'top', 'right', 'back', 'left', 'bottom', 'iso'])

export type ViewFromAxis = z.infer<typeof viewFromAxisSchema>

/** Placeholder slots for documentation exports (no real model projection). */
export const drawingViewPlaceholderSchema = z.object({
  id: z.string(),
  kind: z.enum(['base', 'projected']),
  label: z.string().default(''),
  /** Base view: primary viewing direction for the documentation shell. */
  viewFrom: viewFromAxisSchema.optional(),
  /** Projected: parent view slot id (usually a base view). */
  parentPlaceholderId: z.string().optional(),
  /** Projected: which orthographic direction this view represents relative to the parent. */
  projectionDirection: viewFromAxisSchema.optional()
})

export type DrawingViewPlaceholder = z.infer<typeof drawingViewPlaceholderSchema>

/** One row for PDF/DXF title-block lists (resolved labels + preview copy). */
export type DrawingExportViewRow = {
  kind: string
  label: string
  /** Extra line for export shell (preview pipeline — not projected geometry). */
  detailLine?: string
}

/** One logical drawing sheet (title block metadata — no projected geometry yet). */
export const drawingSheetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** e.g. "1:1", "1:2" — shown in exports when present */
  scale: z.string().optional(),
  /** Listed on PDF/DXF title-block shell as planned view regions. */
  viewPlaceholders: z.array(drawingViewPlaceholderSchema).optional()
})

export const drawingFileSchema = z.object({
  version: z.literal(1),
  sheets: z.array(drawingSheetSchema).default([])
})

export type DrawingSheet = z.infer<typeof drawingSheetSchema>
export type DrawingFile = z.infer<typeof drawingFileSchema>

/** Immutable update of a single placeholder’s label (export list / PDF shell). */
export function replaceViewPlaceholderLabel(
  placeholders: DrawingViewPlaceholder[],
  id: string,
  label: string
): DrawingViewPlaceholder[] {
  return patchViewPlaceholder(placeholders, id, { label })
}

export function patchViewPlaceholder(
  placeholders: DrawingViewPlaceholder[],
  id: string,
  patch: Partial<
    Pick<DrawingViewPlaceholder, 'label' | 'viewFrom' | 'parentPlaceholderId' | 'projectionDirection'>
  >
): DrawingViewPlaceholder[] {
  return placeholders.map((p) => (p.id === id ? { ...p, ...patch } : p))
}

function placeholderLabelOrId(all: DrawingViewPlaceholder[], id: string): string {
  const p = all.find((x) => x.id === id)
  const t = p?.label?.trim()
  return t || id.slice(0, 8)
}

/** Build export list rows with human-readable preview lines (still no model geometry). */
export function resolveExportViewRows(placeholders: DrawingViewPlaceholder[]): DrawingExportViewRow[] {
  return placeholders.map((p) => {
    if (p.kind === 'base') {
      const axis = p.viewFrom ?? 'front'
      return {
        kind: p.kind,
        label: p.label,
        detailLine: `Base · view from ${axis} — preview metadata only (no projected geometry)`
      }
    }
    const parent = p.parentPlaceholderId
      ? placeholderLabelOrId(placeholders, p.parentPlaceholderId)
      : 'unspecified parent'
    const dir = p.projectionDirection ?? 'right'
    return {
      kind: p.kind,
      label: p.label,
      detailLine: `Projected · parent “${parent}” · direction ${dir} — preview metadata only (no projected geometry)`
    }
  })
}

export function emptyDrawingFile(): DrawingFile {
  return { version: 1, sheets: [] }
}

export function parseDrawingFile(data: unknown): DrawingFile {
  return drawingFileSchema.parse(data)
}
