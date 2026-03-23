import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { attachKernelPostOpsToPayload, buildKernelBuildPayload } from '../../shared/sketch-profile'
import { partFeaturesFileSchema, type PartFeaturesFile } from '../../shared/part-features-schema'
import { designFileSchemaV2, normalizeDesign } from '../../shared/design-schema'
import { kernelManifestSchema, type KernelManifest } from '../../shared/kernel-manifest-schema'
import { getEnginesRoot } from '../paths'
import { runPythonJson } from './occt-import'

export type KernelBuildResult =
  | { ok: true; stepPath: string; stlPath: string; manifest: KernelManifest }
  | { ok: false; error: string; detail?: string; manifest: KernelManifest }

/**
 * Phase 1: design/sketch.json → JSON payload → CadQuery `build_part.py` → STEP + STL in project output/.
 */
export async function buildKernelPartFromProject(params: {
  projectDir: string
  pythonPath: string
  appRoot: string
}): Promise<KernelBuildResult> {
  const designPath = join(params.projectDir, 'design', 'sketch.json')
  const featuresPath = join(params.projectDir, 'part', 'features.json')
  const outputDir = join(params.projectDir, 'output')
  const partDir = join(params.projectDir, 'part')
  await mkdir(outputDir, { recursive: true })
  await mkdir(partDir, { recursive: true })

  const manifestPath = join(partDir, 'kernel-manifest.json')
  const base = 'kernel-part'
  const payloadPath = join(outputDir, '.kernel-build-payload.json')

  let raw: string
  try {
    raw = await readFile(designPath, 'utf-8')
  } catch {
    const manifest: KernelManifest = {
      version: 1,
      builtAt: new Date().toISOString(),
      ok: false,
      error: 'design_file_missing',
      detail: designPath
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    return { ok: false, error: 'design_file_missing', detail: designPath, manifest }
  }

  const design = normalizeDesign(JSON.parse(raw) as unknown)
  const parsed = designFileSchemaV2.parse(design)
  const designHash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
  const sketchPlaneKind = parsed.sketchPlane.kind
  const sketchPlaneDatum = parsed.sketchPlane.kind === 'datum' ? parsed.sketchPlane.datum : undefined

  let featuresParsed: PartFeaturesFile | null = null
  try {
    const fraw = await readFile(featuresPath, 'utf-8')
    featuresParsed = partFeaturesFileSchema.parse(JSON.parse(fraw) as unknown)
  } catch {
    featuresParsed = null
  }
  const featuresHash = createHash('sha256')
    .update(featuresParsed ? JSON.stringify(featuresParsed) : '')
    .digest('hex')
  const kernelOpsFromFeatures = featuresParsed?.kernelOps

  const payloadResult = buildKernelBuildPayload(parsed)
  if (!payloadResult.ok) {
    const manifest: KernelManifest = {
      version: 1,
      builtAt: new Date().toISOString(),
      ok: false,
      error: payloadResult.error,
      designHash,
      featuresHash,
      solidKind: parsed.solidKind,
      profileCount: 0,
      payloadVersion: 1,
      postSolidOpCount: 0,
      sketchPlaneKind,
      sketchPlaneDatum
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    return { ok: false, error: payloadResult.error, manifest }
  }

  const payload = attachKernelPostOpsToPayload(payloadResult.payload, kernelOpsFromFeatures)
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf-8')

  const script = join(getEnginesRoot(), 'occt', 'build_part.py')
  const { code, json } = await runPythonJson(params.pythonPath, [script, payloadPath, outputDir, base], params.appRoot)

  if (code !== 0 || !json?.ok) {
    const manifest: KernelManifest = {
      version: 1,
      builtAt: new Date().toISOString(),
      ok: false,
      error: (json?.error as string) ?? 'kernel_build_failed',
      detail: json?.detail as string | undefined,
      designHash,
      featuresHash,
      solidKind: parsed.solidKind,
      profileCount: payloadResult.payload.profiles.length,
      payloadVersion: payload.version,
      postSolidOpCount: payload.postSolidOps?.length ?? 0,
      sketchPlaneKind,
      sketchPlaneDatum,
      loftStrategy: typeof json?.loftStrategy === 'string' ? json.loftStrategy : undefined,
      flatPatternStrategy: typeof json?.flatPatternStrategy === 'string' ? json.flatPatternStrategy : undefined
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
    return {
      ok: false,
      error: manifest.error ?? 'kernel_build_failed',
      detail: manifest.detail,
      manifest
    }
  }

  const stepPath = json.stepPath as string
  const stlPath = json.stlPath as string
  const manifest: KernelManifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    ok: true,
    stepPath,
    stlPath,
    designHash,
    featuresHash,
    solidKind: parsed.solidKind,
    profileCount: payloadResult.payload.profiles.length,
    payloadVersion: payload.version,
    postSolidOpCount: payload.postSolidOps?.length ?? 0,
    sketchPlaneKind,
    sketchPlaneDatum,
    loftStrategy: typeof json.loftStrategy === 'string' ? json.loftStrategy : undefined,
    flatPatternStrategy: typeof json.flatPatternStrategy === 'string' ? json.flatPatternStrategy : undefined
  }
  kernelManifestSchema.parse(manifest)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return { ok: true, stepPath, stlPath, manifest }
}
