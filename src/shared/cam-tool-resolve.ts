import type { ManufactureOperation } from './manufacture-schema'
import type { ToolLibraryFile, ToolRecord } from './tool-schema'

function positiveNumber(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  return v
}

function positiveNumberFromString(v: unknown): number | undefined {
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseFloat(v)
    return positiveNumber(n)
  }
  return positiveNumber(v)
}

/** Prefer a typical milling tool when the op does not name one. */
const TYPE_PRIORITY: readonly ToolRecord['type'][] = ['endmill', 'ball', 'face', 'vbit', 'drill', 'other']

function firstMillingToolDiameter(lib: ToolLibraryFile): number | undefined {
  for (const typ of TYPE_PRIORITY) {
    const t = lib.tools.find((x) => x.type === typ)
    if (t) return t.diameterMm
  }
  return undefined
}

/**
 * Diameter (mm) for OCL cutter / future CAM: explicit op param → tool library id → first milling tool.
 */
export function resolveCamToolDiameterMm(input: {
  operation: ManufactureOperation | undefined
  tools: ToolLibraryFile | null | undefined
}): number | undefined {
  const op = input.operation
  const p = op?.params
  if (!p || typeof p !== 'object') {
    return input.tools ? firstMillingToolDiameter(input.tools) : undefined
  }

  const direct = positiveNumberFromString(p['toolDiameterMm'])
  if (direct != null) return direct

  const toolId = p['toolId']
  if (typeof toolId === 'string' && toolId.length > 0 && input.tools) {
    const rec = input.tools.tools.find((t) => t.id === toolId)
    if (rec) return rec.diameterMm
  }

  return input.tools ? firstMillingToolDiameter(input.tools) : undefined
}
