import { LOFT_MAX_PROFILES } from './sketch-profile'

/**
 * User-facing strings for **Build STEP (kernel)** failures. Machine-oriented `error` codes
 * come from `build-kernel-part.ts` / `buildKernelBuildPayload` / `build_part.py`; optional `detail`
 * is appended when present (Python validation text, paths, etc.).
 */
const KERNEL_BUILD_USER: Record<string, string> = {
  design_file_missing: 'Design sketch file is missing. Save the design or check the project layout.',
  no_closed_profile:
    'No closed profile found for this solid. Close a loop or use a closed sketch profile for extrude/revolve/loft.',
  circle_revolve_use_polyline_approximation:
    'Revolve does not support circle profiles in the kernel. Use a closed loop (or polygon approximation).',
  loft_requires_two_profiles: 'Loft needs at least two closed profiles in sketch entity order.',
  loft_too_many_profiles: `Loft supports at most ${LOFT_MAX_PROFILES} closed profiles. Reduce profile count or merge geometry.`,
  invalid_extrude_depth_mm: 'Extrude depth must be a finite positive number (mm).',
  invalid_loft_separation_mm: 'Loft spacing between profiles must be a finite positive number (mm).',
  invalid_revolve_params: 'Revolve angle and axis must be finite; angle must be positive.',
  cadquery_not_installed:
    'CadQuery is not available. Install with pip install cadquery and set the Python path in Settings.',
  invalid_payload: 'Kernel payload failed validation before CadQuery ran.',
  no_solid: 'Could not build a solid from the sketch (check profiles, loft compatibility, or post-ops).',
  build_failed: 'CadQuery or STEP/STL export failed while building the part.',
  kernel_build_failed: 'Kernel build did not complete. See part/kernel-manifest.json or try again.',
  unknown_solid_kind: 'Unsupported solid kind for kernel build.',
  bad_payload_version: 'Kernel payload version is not supported.',
  payload_read_failed: 'Could not read the kernel payload written for Python.',
  output_dir_failed: 'Could not create the project output folder for kernel artifacts.',
  usage: 'Kernel script was invoked incorrectly (internal error).'
}

export function formatKernelBuildStatus(error: string, detail?: string): string {
  const base = KERNEL_BUILD_USER[error] ?? `Kernel build failed (${error})`
  const d = detail?.trim()
  if (d) return `${base} — ${d}`
  return base
}
