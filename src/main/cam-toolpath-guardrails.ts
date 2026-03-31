import { CAM_FEED_PLUNGE_FLOOR_MM_MIN } from '../shared/cam-numeric-floors'

/**
 * CAM toolpath guardrails — numeric sanity and milling heuristics.
 *
 * Context (industry / HSM practice, summarized):
 * - **Radial engagement (stepover)** strongly affects cutting force and tool life; very small
 *   stepovers improve finish but explode path length; stepover larger than tool Ø skips stock.
 * - **Axial DOC** is strategy- and machine-specific; we do not override zPassMm here (sign
 *   differs by op: 2D vs waterline vs 4-axis radial).
 * - **Feeds** must be finite and positive to avoid invalid or stationary G1.
 *
 * These clamps prevent degenerate configs (zero stepover, absurd tool size) and reduce
 * runaway G-code size when stepover is far too small vs part span (see parallel-finish cap
 * in `cam-local.ts`).
 */

export const CAM_GUARDRAIL_TOOL_DIAM_MIN_MM = 0.05
export const CAM_GUARDRAIL_TOOL_DIAM_MAX_MM = 500

/** Minimum stepover (mm) — below this, passes become unstable / enormous file size. */
export const CAM_GUARDRAIL_STEPOVER_MIN_MM = 0.01

/**
 * Stepover must stay below tool Ø so adjacent passes overlap the stock envelope
 * (flat endmill; ignores corner-radius tools).
 */
export const CAM_GUARDRAIL_STEPOVER_MAX_FRAC_OF_TOOL = 0.98

/** Floor as fraction of tool Ø — avoids near-zero stepover when user enters tiny values. */
export const CAM_GUARDRAIL_STEPOVER_MIN_FRAC_OF_TOOL = 0.02

export const CAM_GUARDRAIL_FEED_MIN_MM_MIN = CAM_FEED_PLUNGE_FLOOR_MM_MIN
export const CAM_GUARDRAIL_PLUNGE_MIN_MM_MIN = CAM_FEED_PLUNGE_FLOOR_MM_MIN
export const CAM_GUARDRAIL_SAFE_Z_MIN_MM = 0.05

/** Numeric slice of `CamJobConfig` (`cam-runner.ts`) that guardrails adjust. */
export type CamGuardrailJob = {
  toolDiameterMm?: number
  stepoverMm: number
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
}

export type CamToolpathGuardrailsResult<J extends CamGuardrailJob = CamGuardrailJob> = {
  job: J
  /** Non-empty when any field was clamped or coerced. */
  notes: string[]
}

function clampFinite(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

export function clampToolDiameterMm(raw: number | undefined, fallbackMm: number): { value: number; note?: string } {
  const base = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : fallbackMm
  const v = clampFinite(base, CAM_GUARDRAIL_TOOL_DIAM_MIN_MM, CAM_GUARDRAIL_TOOL_DIAM_MAX_MM)
  if (Math.abs(v - base) > 1e-6) {
    return { value: v, note: `tool Ø clamped to ${v.toFixed(3)} mm` }
  }
  return { value: v }
}

export function clampStepoverMm(stepoverMm: number, toolDiameterMm: number): { value: number; note?: string } {
  const d = Math.max(CAM_GUARDRAIL_TOOL_DIAM_MIN_MM, toolDiameterMm)
  const lo = Math.max(CAM_GUARDRAIL_STEPOVER_MIN_MM, d * CAM_GUARDRAIL_STEPOVER_MIN_FRAC_OF_TOOL)
  const hi = d * CAM_GUARDRAIL_STEPOVER_MAX_FRAC_OF_TOOL
  const v = clampFinite(stepoverMm, lo, hi)
  if (Math.abs(v - stepoverMm) > 1e-6) {
    return { value: v, note: `stepover clamped ${stepoverMm.toFixed(3)} → ${v.toFixed(3)} mm (tool Ø ${d.toFixed(3)} mm)` }
  }
  return { value: v }
}

export function clampFeedPlungeSafeZ(input: {
  feedMmMin: number
  plungeMmMin: number
  safeZMm: number
}): { feedMmMin: number; plungeMmMin: number; safeZMm: number; notes: string[] } {
  const notes: string[] = []
  let feedMmMin = input.feedMmMin
  let plungeMmMin = input.plungeMmMin
  let safeZMm = input.safeZMm

  if (!Number.isFinite(feedMmMin) || feedMmMin < CAM_GUARDRAIL_FEED_MIN_MM_MIN) {
    notes.push(`feed raised to ${CAM_GUARDRAIL_FEED_MIN_MM_MIN} mm/min`)
    feedMmMin = CAM_GUARDRAIL_FEED_MIN_MM_MIN
  }
  if (!Number.isFinite(plungeMmMin) || plungeMmMin < CAM_GUARDRAIL_PLUNGE_MIN_MM_MIN) {
    notes.push(`plunge raised to ${CAM_GUARDRAIL_PLUNGE_MIN_MM_MIN} mm/min`)
    plungeMmMin = CAM_GUARDRAIL_PLUNGE_MIN_MM_MIN
  }
  if (!Number.isFinite(safeZMm) || safeZMm < CAM_GUARDRAIL_SAFE_Z_MIN_MM) {
    notes.push(`safe Z raised to ${CAM_GUARDRAIL_SAFE_Z_MIN_MM} mm`)
    safeZMm = CAM_GUARDRAIL_SAFE_Z_MIN_MM
  }

  return { feedMmMin, plungeMmMin, safeZMm, notes }
}

/**
 * Apply tool/stepover/feed/safe-Z guardrails to a CAM job. Does **not** change `zPassMm`
 * (operation-specific sign and meaning).
 */
export function applyCamToolpathGuardrails<J extends CamGuardrailJob>(job: J): CamToolpathGuardrailsResult<J> {
  const notes: string[] = []
  const fallbackTool = job.toolDiameterMm ?? 6
  const td = clampToolDiameterMm(job.toolDiameterMm, fallbackTool)
  if (td.note) notes.push(td.note)

  const so = clampStepoverMm(job.stepoverMm, td.value)
  if (so.note) notes.push(so.note)

  const fps = clampFeedPlungeSafeZ({
    feedMmMin: job.feedMmMin,
    plungeMmMin: job.plungeMmMin,
    safeZMm: job.safeZMm
  })
  notes.push(...fps.notes)

  const next = {
    ...job,
    toolDiameterMm: td.value,
    stepoverMm: so.value,
    feedMmMin: fps.feedMmMin,
    plungeMmMin: fps.plungeMmMin,
    safeZMm: fps.safeZMm
  } as J

  return { job: next, notes }
}
