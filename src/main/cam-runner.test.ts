import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MachineProfile } from '../shared/machine-schema'
import {
  builtinOclFailureHint,
  drillOperationHints,
  manufactureKindUsesOclStrategy,
  manufactureKindUsesOclWaterline,
  readStlBufferForCam,
  resolveContourPathOptions,
  resolveDrillCycleDecision,
  resolveDrillCycleMode,
  runCamPipeline,
  shouldAppendFinalPocketFinishPass,
  validate2dOperationGeometry
} from './cam-runner'

const testMill: MachineProfile = {
  id: 'test-mill',
  name: 'Test mill',
  kind: 'cnc',
  workAreaMm: { x: 200, y: 200, z: 100 },
  maxFeedMmMin: 5000,
  postTemplate: 'cnc_generic_mm.hbs',
  dialect: 'grbl'
}

function buildOneTriangleBinaryStl(): Buffer {
  const header = Buffer.alloc(80, 0)
  const count = Buffer.alloc(4)
  count.writeUInt32LE(1, 0)
  const tri = Buffer.alloc(50)
  let o = 0
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(0, o)
  o += 4
  tri.writeFloatLE(1, o)
  o += 4
  const verts: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0]
  ]
  for (const [x, y, z] of verts) {
    tri.writeFloatLE(x, o)
    o += 4
    tri.writeFloatLE(y, o)
    o += 4
    tri.writeFloatLE(z, o)
    o += 4
  }
  tri.writeUInt16LE(0, o)
  return Buffer.concat([header, count, tri])
}

describe('readStlBufferForCam', () => {
  it('accepts a minimal binary STL', async () => {
    const p = join(tmpdir(), 'ufs-cam-binary-ok.stl')
    await writeFile(p, buildOneTriangleBinaryStl())
    try {
      const r = await readStlBufferForCam(p)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.buf.length).toBeGreaterThan(80)
    } finally {
      await unlink(p).catch(() => {})
    }
  })

  it('rejects missing files with ENOENT-style hint', async () => {
    const r = await readStlBufferForCam(join(tmpdir(), 'ufs-cam-missing-test-file.stl'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/not found/i)
      expect(r.hint).toMatch(/path|STL|disk/i)
    }
  })

  it('rejects ASCII STL', async () => {
    const p = join(tmpdir(), 'ufs-cam-ascii-test.stl')
    await writeFile(p, 'solid test\nendsolid\n')
    try {
      const r = await readStlBufferForCam(p)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toMatch(/ASCII/i)
        expect(r.hint).toMatch(/binary/i)
      }
    } finally {
      await unlink(p).catch(() => {})
    }
  })
})

describe('builtinOclFailureHint', () => {
  it('covers Python OCL error tokens for waterline vs raster wording', () => {
    expect(builtinOclFailureHint('{"error":"stl_missing"}', 'cnc_waterline')).toMatch(/missing STL path/i)
    expect(builtinOclFailureHint('{"error":"stl_missing"}', 'cnc_raster')).toMatch(/mesh or orthogonal/i)
    expect(builtinOclFailureHint('{"error":"config_missing_keys"}', 'cnc_adaptive')).toMatch(/temp config JSON/i)
    expect(builtinOclFailureHint('invalid_numeric_params', undefined)).toMatch(/feed|tool|stepover/i)
    expect(builtinOclFailureHint('{"ok":false,"error":"stl_read_error"}', 'cnc_waterline')).toMatch(
      /could not read the STL/i
    )
  })

  it('differentiates waterline vs adaptive for OCL install and empty-toolpath fallbacks', () => {
    expect(builtinOclFailureHint('opencamlib_not_installed', 'cnc_waterline')).toMatch(/Waterline[^A]|Waterline;/)
    expect(builtinOclFailureHint('opencamlib_not_installed', 'cnc_waterline')).not.toMatch(/AdaptiveWaterline/)
    expect(builtinOclFailureHint('opencamlib_not_installed', 'cnc_adaptive')).toMatch(/AdaptiveWaterline/)
    expect(builtinOclFailureHint('ocl_empty_toolpath', 'cnc_waterline')).toMatch(/OpenCAMLib Waterline did not produce/)
    expect(builtinOclFailureHint('ocl_runtime_error', 'cnc_adaptive')).toMatch(/OpenCAMLib AdaptiveWaterline did not produce/)
    expect(builtinOclFailureHint('{"error":"stl_missing"}', 'cnc_waterline')).toMatch(/Waterline intent/)
    expect(builtinOclFailureHint('{"error":"stl_missing"}', 'cnc_adaptive')).toMatch(/Adaptive clearing intent/)
  })
})

describe('runCamPipeline', () => {
  it('returns builtin hint for cnc_parallel (STL bounds, unverified copy)', async () => {
    const p = join(tmpdir(), 'ufs-cam-parallel-hint.stl')
    const out = join(tmpdir(), 'ufs-cam-parallel-hint.nc')
    await writeFile(p, buildOneTriangleBinaryStl())
    try {
      const resourcesRoot = join(process.cwd(), 'resources')
      const r = await runCamPipeline({
        stlPath: p,
        outputGcodePath: out,
        machine: testMill,
        resourcesRoot,
        appRoot: process.cwd(),
        zPassMm: 1,
        stepoverMm: 2,
        feedMmMin: 500,
        plungeMmMin: 300,
        safeZMm: 5,
        pythonPath: 'python',
        operationKind: 'cnc_parallel'
      })
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.usedEngine).toBe('builtin')
        expect(r.hint).toMatch(/parallel finish.*STL bounding box/i)
        expect(r.hint).toMatch(/unverified|MACHINES\.md/i)
      }
    } finally {
      await unlink(p).catch(() => {})
      await unlink(out).catch(() => {})
    }
  })

  it('merges drill depth/retract hints for cnc_drill', async () => {
    const out = join(tmpdir(), 'ufs-cam-drill-hint.nc')
    const mill: MachineProfile = { ...testMill, dialect: 'mach3' }
    const resourcesRoot = join(process.cwd(), 'resources')
    const r = await runCamPipeline({
      stlPath: join(tmpdir(), 'unused-drill.stl'),
      outputGcodePath: out,
      machine: mill,
      resourcesRoot,
      appRoot: process.cwd(),
      zPassMm: -4,
      stepoverMm: 2,
      feedMmMin: 500,
      plungeMmMin: 300,
      safeZMm: 10,
      pythonPath: 'python',
      operationKind: 'cnc_drill',
      operationParams: { drillPoints: [[0, 0]] }
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.hint).toMatch(/safeZMm \(10\.0 mm\)/)
      expect(r.hint).toMatch(/zPassMm \(-4\.000 mm\)/)
    }
    await unlink(out).catch(() => {})
  })
})

describe('drillOperationHints', () => {
  it('notes retract fallback when retractMm is unset', () => {
    const h = drillOperationHints({ drillPoints: [[0, 0]] }, { zPassMm: -3, safeZMm: 12 })
    expect(h.join(' ')).toMatch(/safeZMm \(12\.0 mm\)/)
    expect(h.join(' ')).toMatch(/zPassMm \(-3\.000 mm\)/)
  })

  it('omits retract fallback copy when retractMm is set', () => {
    const h = drillOperationHints({ drillPoints: [[0, 0]], retractMm: 8 }, { zPassMm: -2, safeZMm: 10 })
    expect(h.some((x) => x.includes('because retractMm is unset'))).toBe(false)
  })
})

describe('manufactureKindUsesOclStrategy', () => {
  it('maps waterline, adaptive, and raster', () => {
    expect(manufactureKindUsesOclStrategy('cnc_waterline')).toBe('waterline')
    expect(manufactureKindUsesOclStrategy('cnc_adaptive')).toBe('adaptive_waterline')
    expect(manufactureKindUsesOclStrategy('cnc_raster')).toBe('raster')
    expect(manufactureKindUsesOclStrategy('cnc_parallel')).toBe(null)
    expect(manufactureKindUsesOclStrategy(undefined)).toBe(null)
  })
})

describe('manufactureKindUsesOclWaterline', () => {
  it('maps waterline and adaptive kinds only', () => {
    expect(manufactureKindUsesOclWaterline('cnc_waterline')).toBe('waterline')
    expect(manufactureKindUsesOclWaterline('cnc_adaptive')).toBe('adaptive_waterline')
    expect(manufactureKindUsesOclWaterline('cnc_raster')).toBe(null)
    expect(manufactureKindUsesOclWaterline('cnc_parallel')).toBe(null)
    expect(manufactureKindUsesOclWaterline(undefined)).toBe(null)
  })
})

describe('resolveDrillCycleMode', () => {
  it('defaults to expanded for grbl and G81 otherwise', () => {
    expect(resolveDrillCycleMode({ dialect: 'grbl' })).toBe('expanded')
    expect(resolveDrillCycleMode({ dialect: 'mach3' })).toBe('g81')
    expect(resolveDrillCycleMode({ dialect: 'generic_mm' })).toBe('g81')
  })

  it('honors explicit operation param override', () => {
    expect(resolveDrillCycleMode({ dialect: 'grbl', operationParams: { drillCycle: 'g83', peckMm: 1 } })).toBe('g83')
    expect(resolveDrillCycleMode({ dialect: 'mach3', operationParams: { drillCycle: 'g82', dwellMs: 250 } })).toBe('g82')
    expect(resolveDrillCycleMode({ dialect: 'mach3', operationParams: { drillCycle: 'expanded' } })).toBe('expanded')
  })

  it('infers cycle from peck/dwell params when cycle is not explicitly set', () => {
    expect(resolveDrillCycleMode({ dialect: 'mach3', operationParams: { peckMm: 1 } })).toBe('g83')
    expect(resolveDrillCycleMode({ dialect: 'mach3', operationParams: { dwellMs: 250 } })).toBe('g82')
    expect(resolveDrillCycleMode({ dialect: 'mach3', operationParams: { peckMm: 1, dwellMs: 250 } })).toBe('g83')
    // grbl keeps expanded fallback unless operator explicitly picks a canned cycle.
    expect(resolveDrillCycleMode({ dialect: 'grbl', operationParams: { peckMm: 1 } })).toBe('expanded')
  })
})

describe('resolveDrillCycleDecision', () => {
  it('returns mode plus explanatory hint', () => {
    expect(resolveDrillCycleDecision({ dialect: 'mach3', operationParams: { drillCycle: 'g82', dwellMs: 250 } })).toEqual({
      mode: 'g82',
      hint: 'Drill cycle: using explicit override (G82).'
    })
    expect(resolveDrillCycleDecision({ dialect: 'mach3', operationParams: { peckMm: 1 } })).toEqual({
      mode: 'g83',
      hint: 'Drill cycle: auto-selected G83 from peckMm (1).'
    })
    expect(resolveDrillCycleDecision({ dialect: 'grbl' })).toEqual({
      mode: 'expanded',
      hint: 'Drill cycle: grbl defaulted to expanded (G0/G1) unless you explicitly choose a canned cycle.'
    })
  })

  it('falls back to G81 when explicit canned cycle params are missing', () => {
    expect(resolveDrillCycleDecision({ dialect: 'mach3', operationParams: { drillCycle: 'g83' } })).toEqual({
      mode: 'g81',
      hint: 'Drill cycle: requested G83 but peckMm is missing/invalid; falling back to G81.'
    })
    expect(resolveDrillCycleDecision({ dialect: 'mach3', operationParams: { drillCycle: 'g82' } })).toEqual({
      mode: 'g81',
      hint: 'Drill cycle: requested G82 but dwellMs is missing/invalid; falling back to G81.'
    })
  })
})

describe('validate2dOperationGeometry', () => {
  it('requires contourPoints for contour/pocket', () => {
    const missing = validate2dOperationGeometry('cnc_contour', {})
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.error).toMatch(/missing/i)
      expect(missing.hint).toMatch(/contourPoints/i)
    }
    expect(validate2dOperationGeometry('cnc_pocket', { contourPoints: [[0, 0], [10, 0], [10, 5]] }).ok).toBe(true)
  })

  it('requires drillPoints for drill', () => {
    const missing = validate2dOperationGeometry('cnc_drill', {})
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.error).toMatch(/missing/i)
      expect(missing.hint).toMatch(/drillPoints/i)
    }
    expect(validate2dOperationGeometry('cnc_drill', { drillPoints: [[0, 0]] }).ok).toBe(true)
  })

  it('hard-fails invalid 2D geometry payloads with actionable hints', () => {
    const badContour = validate2dOperationGeometry('cnc_contour', { contourPoints: [['x', 0], [1, 2], [3, 4]] })
    expect(badContour.ok).toBe(false)
    if (!badContour.ok) {
      expect(badContour.error).toMatch(/invalid|incomplete/i)
      expect(badContour.hint).toMatch(/valid|numeric|points/i)
    }
    expect(validate2dOperationGeometry('cnc_pocket', { contourPoints: [[0, 0], [1], [2, 2]] }).ok).toBe(false)
    const badDrill = validate2dOperationGeometry('cnc_drill', { drillPoints: [[0, 'y']] })
    expect(badDrill.ok).toBe(false)
    if (!badDrill.ok) {
      expect(badDrill.error).toMatch(/invalid/i)
      expect(badDrill.hint).toMatch(/drillPoints/i)
    }
  })
})

describe('resolveContourPathOptions', () => {
  it('defaults to climb with zero leads', () => {
    expect(resolveContourPathOptions()).toEqual({ contourSide: 'climb', leadInMm: 0, leadOutMm: 0 })
  })

  it('parses side and clamps leads nonnegative', () => {
    expect(resolveContourPathOptions({ contourSide: 'conventional', leadInMm: 1.2, leadOutMm: -2 })).toEqual({
      contourSide: 'conventional',
      leadInMm: 1.2,
      leadOutMm: 0
    })
  })
})

describe('shouldAppendFinalPocketFinishPass', () => {
  it('only appends a final finish pass when enabled and not finishing each depth', () => {
    expect(shouldAppendFinalPocketFinishPass({ finishPass: true, finishEachDepth: false })).toBe(true)
    expect(shouldAppendFinalPocketFinishPass({ finishPass: true, finishEachDepth: true })).toBe(false)
    expect(shouldAppendFinalPocketFinishPass({ finishPass: false, finishEachDepth: false })).toBe(false)
    expect(shouldAppendFinalPocketFinishPass({ finishPass: false, finishEachDepth: true })).toBe(false)
  })
})
