import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type {
  AssemblyComponent,
  AssemblyFile,
  AssemblyInterferenceReport,
  AssemblyExplodeViewMetadata,
  AssemblyMotionStudyStub
} from '../../shared/assembly-schema'
import {
  assemblyJointDofHint,
  assemblyJointPresets,
  buildAssemblyBomCsvLines,
  buildAssemblySummaryReport,
  buildBomHierarchyJsonText,
  buildHierarchicalBomText,
  emptyAssembly,
  meshPathLintIssues,
  motionLinkStubIssues,
  motionStudyDofHintLine,
  parseAssemblyFile
} from '../../shared/assembly-schema'
import { lerpMotionRzDeg, parseAssemblyMotionRzKeyframes } from '../../shared/assembly-viewport-math'
import { BomMeshThumb } from './BomMeshThumb'
import { AssemblyViewport3D } from './AssemblyViewport3D'

type Props = {
  projectDir: string | null
  onStatus?: (msg: string) => void
  onAfterSave?: () => void
}

function clampRevolutePreviewAngle(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.revolutePreviewMinDeg ?? -180
  const rMax = c.revolutePreviewMaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.revolutePreviewAngleDeg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampSliderPreviewMm(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.sliderPreviewMinMm ?? -500
  const rMax = c.sliderPreviewMaxMm ?? 500
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.sliderPreviewMm
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampPlanarPreviewUMm(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.planarPreviewUMinMm ?? -500
  const rMax = c.planarPreviewUMaxMm ?? 500
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.planarPreviewUMm
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampPlanarPreviewVMm(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.planarPreviewVMinMm ?? -500
  const rMax = c.planarPreviewVMaxMm ?? 500
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.planarPreviewVMm
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampUniversalPreviewAngle1(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.universalPreviewAngle1MinDeg ?? -180
  const rMax = c.universalPreviewAngle1MaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.universalPreviewAngle1Deg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampUniversalPreviewAngle2(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.universalPreviewAngle2MinDeg ?? -180
  const rMax = c.universalPreviewAngle2MaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.universalPreviewAngle2Deg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampCylindricalSlideMm(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.cylindricalPreviewSlideMinMm ?? -500
  const rMax = c.cylindricalPreviewSlideMaxMm ?? 500
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.cylindricalPreviewSlideMm
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampCylindricalSpinDeg(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.cylindricalPreviewSpinMinDeg ?? -180
  const rMax = c.cylindricalPreviewSpinMaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.cylindricalPreviewSpinDeg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampBallPreviewRx(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.ballPreviewRxMinDeg ?? -180
  const rMax = c.ballPreviewRxMaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.ballPreviewRxDeg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampBallPreviewRy(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.ballPreviewRyMinDeg ?? -180
  const rMax = c.ballPreviewRyMaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.ballPreviewRyDeg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

function clampBallPreviewRz(c: AssemblyComponent): { lo: number; hi: number; clamped: number } {
  const rMin = c.ballPreviewRzMinDeg ?? -180
  const rMax = c.ballPreviewRzMaxDeg ?? 180
  const lo = Math.min(rMin, rMax)
  const hi = Math.max(rMin, rMax)
  const raw = c.ballPreviewRzDeg
  const clamped =
    raw != null && Number.isFinite(raw) ? Math.max(lo, Math.min(hi, raw)) : 0
  return { lo, hi, clamped }
}

/** Absolute path → POSIX-style path relative to `projectDir`, or null if outside the project. */
function relativePathFromProject(projectDir: string, absolutePath: string): string | null {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '')
  const pd = norm(projectDir)
  const ap = norm(absolutePath)
  const prefix = `${pd}/`
  if (ap.length <= pd.length) return null
  if (ap.toLowerCase().slice(0, prefix.length) !== prefix.toLowerCase()) return null
  return ap.slice(prefix.length)
}

function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function summaryReportToText(s: ReturnType<typeof buildAssemblySummaryReport>): string {
  const joints = Object.entries(s.jointCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join(', ')
  const bomByPath = Object.entries(s.bomQuantityByPartPath)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, n]) => `${path}×${n}`)
    .join('; ')
  const refTags = Object.entries(s.referenceTagCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t}:${n}`)
    .join(', ')
  const extRefs = Object.entries(s.externalComponentRefCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => `${t}:${n}`)
    .join(', ')
  const motionLinkKinds = Object.entries(s.motionLinkKindCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join(', ')
  return [
    `Assembly: ${s.name}`,
    `Rows ${s.componentCount} (active ${s.activeComponentCount}, suppressed ${s.suppressedCount})`,
    `BOM qty sum ${s.totalBomQuantity} | by path: ${bomByPath || '—'}`,
    `Mesh paths (active): ${s.activeWithMeshPathCount}`,
    `Motion-isolated ${s.motionIsolatedCount} | grounded ${s.groundedActiveCount} | roots ${s.rootActiveCount} / children ${s.childActiveCount}`,
    s.invalidParentRefActiveCount > 0 ? `Broken parentId (active): ${s.invalidParentRefActiveCount}` : null,
    `Same-transform pairs (active): ${s.sameTransformActivePairCount}`,
    `Distinct PNs: ${s.distinctActivePartNumbers.length ? s.distinctActivePartNumbers.join(', ') : '—'}`,
    `Ref tags: ${refTags || '—'}`,
    `External component refs (tallies): ${extRefs || '—'}`,
    `Distinct external refs: ${s.distinctActiveExternalRefs.length ? s.distinctActiveExternalRefs.join(', ') : '—'}`,
    `Active rows with BOM notes: ${s.activeWithBomNotesCount}`,
    s.activeParentSelfRefCount > 0 ? `Parent self-ref (active): ${s.activeParentSelfRefCount}` : null,
    s.activeParentGraphHasCycle ? 'Parent graph (active): cycle detected — fix parentId chain' : null,
    s.activePartPathsWithMultipleRows > 0
      ? `Part paths with 2+ active rows: ${s.activePartPathsWithMultipleRows}`
      : null,
    s.activePartNumbersWithMultipleRows > 0
      ? `Part numbers with 2+ active rows: ${s.activePartNumbersWithMultipleRows}`
      : null,
    s.multipleActiveGrounded ? 'Warning: more than one active row is grounded' : null,
    `Joints: ${joints || '—'}`,
    `Unique part paths (all rows): ${s.uniquePartPaths.length}`,
    `Explode metadata: ${s.hasExplodeViewMetadata ? 'yes' : 'no'} | Motion study stub: ${s.hasMotionStudyStub ? 'yes' : 'no'}`,
    `Motion link stubs (complete): ${s.activeMotionLinkStubCount} | Linked rows (active): ${s.activeWithLinkedInstanceCount}`,
    s.invalidLinkedInstanceRefActiveCount > 0
      ? `Invalid linkedInstanceId (active): ${s.invalidLinkedInstanceRefActiveCount}`
      : null,
    s.activeMotionLinkIncompleteCount > 0
      ? `Incomplete motion link fields (active): ${s.activeMotionLinkIncompleteCount}`
      : null,
    `Motion link kinds (active): ${motionLinkKinds || '—'}`
  ]
    .filter(Boolean)
    .join('\n')
}

export function AssemblyWorkspace({ projectDir, onStatus, onAfterSave }: Props) {
  const [asm, setAsm] = useState<AssemblyFile>(() => emptyAssembly())
  const [interferenceReport, setInterferenceReport] = useState<AssemblyInterferenceReport | null>(null)
  const [explodePreview, setExplodePreview] = useState(0.65)
  const [motionU, setMotionU] = useState(0)
  const [motionPlaying, setMotionPlaying] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const fab = window.fab

  const summary = useMemo(() => buildAssemblySummaryReport(asm), [asm])

  const componentIdToName = useMemo(
    () => new Map(asm.components.map((c) => [c.id, c.name] as const)),
    [asm.components]
  )

  const motionSamples = useMemo(
    () => parseAssemblyMotionRzKeyframes(asm.motionStudy?.keyframesJson),
    [asm.motionStudy?.keyframesJson]
  )

  const motionRzDeg = useMemo(
    () => (motionSamples ? lerpMotionRzDeg(motionSamples, motionU) : 0),
    [motionSamples, motionU]
  )

  useEffect(() => {
    if (!motionPlaying || !motionSamples) return
    const t0 = performance.now()
    let id = 0
    const loop = (now: number) => {
      setMotionU(((now - t0) % 4000) / 4000)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [motionPlaying, motionSamples])

  const keyframesJsonHint = useMemo(() => {
    const j = asm.motionStudy?.keyframesJson?.trim()
    if (j == null || j === '') return null
    try {
      JSON.parse(j)
      const s = parseAssemblyMotionRzKeyframes(asm.motionStudy?.keyframesJson)
      if (!s) {
        return 'Need at least two samples like { "t": 0, "rzDeg": 0 }, { "t": 1, "rzDeg": 45 } for motion scrub/play.'
      }
      return null
    } catch {
      return 'This text is not valid JSON.'
    }
  }, [asm.motionStudy?.keyframesJson])

  useEffect(() => {
    if (!projectDir) {
      setAsm(emptyAssembly())
      return
    }
    void fab
      .assemblyLoad(projectDir)
      .then(setAsm)
      .catch((e) => {
        onStatus?.(e instanceof Error ? e.message : String(e))
        setAsm(emptyAssembly())
      })
  }, [fab, projectDir])

  const save = useCallback(async () => {
    if (!projectDir) return
    try {
      await fab.assemblySave(projectDir, JSON.stringify(asm))
      onStatus?.('Assembly saved.')
      onAfterSave?.()
    } catch (e) {
      onStatus?.(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir, asm, onStatus, onAfterSave])

  const downloadBomCsvFromEditor = useCallback(() => {
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    const body = buildAssemblyBomCsvLines(asm).join('\n')
    downloadTextFile(`${name}-bom.csv`, body, 'text/csv;charset=utf-8')
    onStatus?.('Downloaded BOM CSV from the table above (unsaved edits included). Use Export BOM to write output/bom.csv from saved assembly.json.')
  }, [asm, onStatus])

  const downloadBomTreeTxtFromEditor = useCallback(() => {
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    downloadTextFile(`${name}-bom-hierarchical.txt`, buildHierarchicalBomText(asm), 'text/plain;charset=utf-8')
    onStatus?.('Downloaded BOM tree (.txt) from editor (all rows + suppressed). Export to output/ uses saved assembly.json.')
  }, [asm, onStatus])

  const downloadBomHierarchyJsonFromEditor = useCallback(() => {
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    downloadTextFile(`${name}-bom-hierarchy.json`, buildBomHierarchyJsonText(asm), 'application/json')
    onStatus?.('Downloaded BOM hierarchy JSON (active tree) from editor — same shape as output/bom-hierarchy.json.')
  }, [asm, onStatus])

  const exportBom = useCallback(async () => {
    if (!projectDir) return
    const p = await fab.assemblyExportBom(projectDir)
    onStatus?.(`BOM: ${p}`)
  }, [fab, projectDir, onStatus])

  const exportBomHierarchical = useCallback(async () => {
    if (!projectDir) return
    const p = await fab.assemblyExportBomHierarchical(projectDir)
    onStatus?.(`BOM tree: ${p}`)
  }, [fab, projectDir, onStatus])

  const exportBomHierarchyJson = useCallback(async () => {
    if (!projectDir) return
    const p = await fab.assemblyExportBomHierarchyJson(projectDir)
    onStatus?.(`BOM hierarchy JSON: ${p}`)
  }, [fab, projectDir, onStatus])

  const exportAssemblyJson = useCallback(() => {
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    downloadTextFile(`${name}-export.json`, JSON.stringify(asm, null, 2), 'application/json')
    onStatus?.('Exported assembly JSON (download).')
  }, [asm, onStatus])

  const exportSummaryTxt = useCallback(() => {
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    const body = summaryReportToText(summary)
    downloadTextFile(`${name}-summary.txt`, body, 'text/plain;charset=utf-8')
    onStatus?.('Exported assembly summary (.txt).')
  }, [asm.name, summary, onStatus])

  const copySummary = useCallback(async () => {
    const t = summaryReportToText(summary)
    try {
      await navigator.clipboard.writeText(t)
      onStatus?.('Summary copied to clipboard.')
    } catch {
      onStatus?.('Clipboard unavailable; summary is shown in the panel above.')
    }
  }, [summary, onStatus])

  const onPickImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (!f) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '')
          const data = JSON.parse(text) as unknown
          const next = parseAssemblyFile(data)
          setAsm(next)
          onStatus?.(`Imported assembly (“${next.name}”, ${next.components.length} row(s)). Save to write assembly.json.`)
        } catch (err) {
          onStatus?.(err instanceof Error ? err.message : 'Import failed: invalid JSON or assembly shape.')
        }
      }
      reader.onerror = () => onStatus?.('Import failed: could not read file.')
      reader.readAsText(f)
    },
    [onStatus]
  )

  const interferenceStub = useCallback(async () => {
    if (!projectDir) return
    const r = await fab.assemblyInterferenceCheck(projectDir)
    setInterferenceReport(r)
    onStatus?.(r.message)
  }, [fab, projectDir, onStatus])

  const exportInterferenceJson = useCallback(() => {
    if (!interferenceReport) return
    const name = (asm.name || 'assembly').replace(/[^\w\-]+/g, '_')
    downloadTextFile(`${name}-interference.json`, JSON.stringify(interferenceReport, null, 2), 'application/json')
    onStatus?.('Exported interference report (download).')
  }, [asm.name, interferenceReport, onStatus])

  const saveInterferenceToProject = useCallback(async () => {
    if (!projectDir || !interferenceReport) return
    try {
      const p = await fab.assemblySaveInterferenceReport(projectDir, JSON.stringify(interferenceReport))
      onStatus?.(`Saved interference report: ${p}`)
    } catch (e) {
      onStatus?.(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir, interferenceReport, onStatus])

  function addComponent(): void {
    const id = crypto.randomUUID()
    const c: AssemblyComponent = {
      id,
      name: `Part_${asm.components.length + 1}`,
      partPath: 'design/sketch.json',
      transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
      grounded: asm.components.length === 0,
      bomQuantity: 1,
      suppressed: false,
      motionIsolated: false
    }
    setAsm((a) => ({ ...a, components: [...a.components, c] }))
  }

  function update(i: number, patch: Partial<AssemblyComponent>): void {
    setAsm((a) => {
      const next = [...a.components]
      next[i] = { ...next[i]!, ...patch }
      return { ...a, components: next }
    })
  }

  function remove(i: number): void {
    setAsm((a) => ({ ...a, components: a.components.filter((_, j) => j !== i) }))
  }

  function duplicateComponent(i: number): void {
    setAsm((a) => {
      const c = a.components[i]
      if (!c) return a
      const copy: AssemblyComponent = {
        ...c,
        id: crypto.randomUUID(),
        name: `${c.name} (copy)`,
        parentId: undefined,
        linkedInstanceId: undefined,
        motionLinkKind: undefined
      }
      return { ...a, components: [...a.components, copy] }
    })
    onStatus?.('Duplicated row (new instance id); adjust parent / links as needed.')
  }

  const insertComponentFromProject = useCallback(async () => {
    if (!projectDir) return
    try {
      const abs = await fab.dialogOpenFile([{ name: 'Sketch / part JSON', extensions: ['json'] }], projectDir)
      if (!abs) return
      const rel = relativePathFromProject(projectDir, abs)
      if (!rel) {
        onStatus?.('Choose a file inside the project folder.')
        return
      }
      const base = rel
        .split('/')
        .pop()
        ?.replace(/\.json$/i, '')
      const label = base && base.trim() !== '' ? base : 'Part'
      setAsm((a) => {
        const id = crypto.randomUUID()
        const c: AssemblyComponent = {
          id,
          name: `Part_${label}`,
          partPath: rel,
          transform: { x: 0, y: 0, z: 0, rxDeg: 0, ryDeg: 0, rzDeg: 0 },
          grounded: a.components.length === 0,
          bomQuantity: 1,
          suppressed: false,
          motionIsolated: false
        }
        return { ...a, components: [...a.components, c] }
      })
      onStatus?.(`Inserted row from project: ${rel}`)
    } catch (e) {
      onStatus?.(e instanceof Error ? e.message : String(e))
    }
  }, [fab, projectDir, onStatus])

  if (!projectDir) {
    return <p className="msg panel">Open a project to edit the assembly.</p>
  }

  return (
    <div className="panel">
      <h2>Build model (assembly)</h2>
      <p className="msg">
        Components, transforms, parent links, optional <strong>motion link stub</strong> (linked instance + mate/contact/align
        — no kinematic solver), joint kinds (rigid through universal / ball), BOM quantity per line, optional reference
        tags, part numbers, <strong>external component ref</strong> (PDM/ERP id) and <strong>BOM notes</strong>, optional{' '}
        <strong>mesh path</strong> (binary STL) for <strong>3D preview</strong>, coarse AABB interference + narrow-phase
        SAT (capped), motion-isolated flag, and suppress for analysis. Optional{' '}
        <strong>explode view metadata</strong> drives preview separation along +X/+Y/+Z; <strong>motion study</strong>{' '}
        keyframes can scrub/play <strong>preview-only</strong> world rotation (not a kinematic solver). Paths are
        relative to the project folder.
      </p>
      <p className="msg msg--muted" style={{ marginTop: '-0.25rem' }}>
        <strong>Interference check</strong> reads saved <code>assembly.json</code> on disk — save after edits so the
        report matches the table below.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '0.35rem' }}>
        <label style={{ flex: '1 1 14rem', minWidth: '12rem' }}>
          Assembly name
          <input
            value={asm.name}
            onChange={(e) => setAsm((a) => ({ ...a, name: e.target.value.trim() === '' ? 'Assembly' : e.target.value }))}
            maxLength={200}
            aria-label="Assembly display name (saved in assembly.json)"
          />
        </label>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="secondary" onClick={addComponent}>
          Add component
        </button>
        <button type="button" className="secondary" onClick={() => void save()}>
          Save assembly.json
        </button>
        <button type="button" className="secondary" onClick={exportAssemblyJson}>
          Export JSON
        </button>
        <button type="button" className="secondary" onClick={exportSummaryTxt}>
          Export summary (.txt)
        </button>
        <button type="button" className="secondary" onClick={() => importInputRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-hidden
          onChange={onPickImportFile}
        />
        <button type="button" className="secondary" onClick={() => void interferenceStub()}>
          Interference check
        </button>
        <button type="button" className="secondary" onClick={() => void copySummary()}>
          Copy summary
        </button>
        <button type="button" className="secondary" onClick={downloadBomCsvFromEditor}>
          Download BOM CSV (editor)
        </button>
        <button type="button" className="primary" onClick={() => void exportBom()}>
          Export BOM (CSV to output/)
        </button>
        <button type="button" className="secondary" onClick={() => void exportBomHierarchical()}>
          Export BOM (tree .txt)
        </button>
        <button type="button" className="secondary" onClick={() => void exportBomHierarchyJson()}>
          Export BOM (tree .json)
        </button>
      </div>

      <section className="panel panel--nested" style={{ marginTop: '1rem' }} aria-label="Assembly 3D preview">
        <h3 className="subh">3D preview (mesh paths)</h3>
        <AssemblyViewport3D
          projectDir={projectDir}
          asm={asm}
          explodeFactor={asm.explodeView ? explodePreview : 0}
          motionRzDeg={motionRzDeg}
        />
        <p className="msg msg--muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
          <strong>Preview order:</strong> joint row transforms (slider / planar / revolute / universal / cylindrical /
          ball) apply to subtrees first; motion study keyframes then add a <strong>whole-assembly</strong> rotation
          about world +Y
          (preview-only, not a solver).
        </p>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center', gap: '0.75rem' }}>
          {asm.explodeView ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '12rem' }}>
              Explode preview ({asm.explodeView.axis.toUpperCase()}, {asm.explodeView.stepMm} mm/step)
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(explodePreview * 100)}
                onChange={(e) => setExplodePreview(Math.max(0, Math.min(1, Number(e.target.value) / 100)))}
              />
            </label>
          ) : null}
          {motionSamples ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '12rem' }}>
                Motion scrub (keyframes → +Y °)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(motionU * 100)}
                  onChange={(e) => {
                    setMotionPlaying(false)
                    setMotionU(Math.max(0, Math.min(1, Number(e.target.value) / 100)))
                  }}
                />
              </label>
              <button type="button" className="secondary" onClick={() => setMotionPlaying((p) => !p)}>
                {motionPlaying ? 'Pause motion' : 'Play motion'}
              </button>
            </>
          ) : null}
        </div>
      </section>

      <section
        className="panel panel--nested"
        style={{ marginTop: '1rem' }}
        aria-label="Explode view and motion study metadata"
      >
        <h3 className="subh">Explode view &amp; motion study (saved in assembly.json)</h3>
        <p className="msg msg--muted" style={{ marginTop: '-0.25rem' }}>
          Metadata below is persisted; the viewport above uses it for separation and optional keyframe rotation (no joint
          limits or B-rep clash solver).
        </p>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="panel--nested" style={{ flex: '1 1 14rem', minWidth: '12rem' }}>
            <h4 className="subh" style={{ margin: '0 0 0.5rem' }}>
              Explode view
            </h4>
            {!asm.explodeView ? (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setAsm((a) => ({
                    ...a,
                    explodeView: { axis: 'z', stepMm: 10 }
                  }))
                }
              >
                Add explode metadata
              </button>
            ) : (
              <>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <label>
                    Axis
                    <select
                      value={asm.explodeView.axis}
                      onChange={(e) =>
                        setAsm((a) => ({
                          ...a,
                          explodeView: {
                            ...(a.explodeView as AssemblyExplodeViewMetadata),
                            axis: e.target.value as AssemblyExplodeViewMetadata['axis']
                          }
                        }))
                      }
                    >
                      <option value="x">+X separation</option>
                      <option value="y">+Y separation</option>
                      <option value="z">+Z separation</option>
                    </select>
                  </label>
                  <label>
                    Step (mm)
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={asm.explodeView.stepMm}
                      onChange={(e) =>
                        setAsm((a) => ({
                          ...a,
                          explodeView: {
                            ...(a.explodeView as AssemblyExplodeViewMetadata),
                            stepMm: Math.max(0, Number(e.target.value) || 0)
                          }
                        }))
                      }
                    />
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: '0.5rem' }}>
                  Notes
                  <textarea
                    rows={2}
                    style={{ width: '100%' }}
                    placeholder="e.g. Exploded for assembly drawing A-12"
                    value={asm.explodeView.notes ?? ''}
                    onChange={(e) =>
                      setAsm((a) => ({
                        ...a,
                        explodeView: {
                          ...(a.explodeView as AssemblyExplodeViewMetadata),
                          notes: e.target.value === '' ? undefined : e.target.value
                        }
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setAsm((a) => ({ ...a, explodeView: undefined }))}
                >
                  Remove explode metadata
                </button>
              </>
            )}
          </div>
          <div className="panel--nested" style={{ flex: '1 1 16rem', minWidth: '12rem' }}>
            <h4 className="subh" style={{ margin: '0 0 0.5rem' }}>
              Motion study (stub)
            </h4>
            {!asm.motionStudy ? (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setAsm((a) => ({
                    ...a,
                    motionStudy: { name: 'Motion study (stub)', dofHint: 'none' }
                  }))
                }
              >
                Add motion study stub
              </button>
            ) : (
              <>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <label>
                    Name
                    <input
                      value={asm.motionStudy.name}
                      onChange={(e) =>
                        setAsm((a) => ({
                          ...a,
                          motionStudy: {
                            ...(a.motionStudy as AssemblyMotionStudyStub),
                            name: e.target.value || 'Motion study (stub)'
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    DOF hint
                    <select
                      value={asm.motionStudy.dofHint}
                      onChange={(e) =>
                        setAsm((a) => ({
                          ...a,
                          motionStudy: {
                            ...(a.motionStudy as AssemblyMotionStudyStub),
                            dofHint: e.target.value as AssemblyMotionStudyStub['dofHint']
                          }
                        }))
                      }
                    >
                      <option value="none">None (rigid)</option>
                      <option value="planar2d">Planar 2D</option>
                      <option value="spatial6">Spatial (6 DOF)</option>
                    </select>
                  </label>
                </div>
                <p className="msg msg--muted" style={{ marginTop: '0.35rem' }}>
                  {motionStudyDofHintLine(asm.motionStudy.dofHint)}
                </p>
                <label style={{ display: 'block', marginTop: '0.5rem' }}>
                  Keyframes (JSON)
                  <textarea
                    rows={3}
                    style={{ width: '100%' }}
                    placeholder='e.g. [{"t":0,"rzDeg":0},{"t":1,"rzDeg":45}] — preview +Y rotation'
                    value={asm.motionStudy.keyframesJson ?? ''}
                    onChange={(e) =>
                      setAsm((a) => ({
                        ...a,
                        motionStudy: {
                          ...(a.motionStudy as AssemblyMotionStudyStub),
                          keyframesJson: e.target.value === '' ? undefined : e.target.value
                        }
                      }))
                    }
                  />
                </label>
                {keyframesJsonHint ? <p className="msg msg--muted">{keyframesJsonHint}</p> : null}
                <label style={{ display: 'block', marginTop: '0.5rem' }}>
                  Notes
                  <textarea
                    rows={2}
                    style={{ width: '100%' }}
                    value={asm.motionStudy.notes ?? ''}
                    onChange={(e) =>
                      setAsm((a) => ({
                        ...a,
                        motionStudy: {
                          ...(a.motionStudy as AssemblyMotionStudyStub),
                          notes: e.target.value === '' ? undefined : e.target.value
                        }
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setAsm((a) => ({ ...a, motionStudy: undefined }))}
                >
                  Remove motion study stub
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel assembly-summary panel--nested" style={{ marginTop: '1rem' }} aria-label="Assembly summary">
        <h3 className="subh">Summary (current editor)</h3>
        <div className="assembly-summary-grid">
          <div>
            <span className="assembly-summary-k">Assembly</span>
            <span className="assembly-summary-v">{summary.name}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Rows</span>
            <span className="assembly-summary-v">
              {summary.componentCount} total · {summary.activeComponentCount} active · {summary.suppressedCount}{' '}
              suppressed
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">BOM qty (sum)</span>
            <span className="assembly-summary-v">{summary.totalBomQuantity}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Mesh paths (active)</span>
            <span className="assembly-summary-v">{summary.activeWithMeshPathCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Part paths (2+ active rows)</span>
            <span className="assembly-summary-v">
              {summary.activePartPathsWithMultipleRows > 0 ? (
                <strong>{summary.activePartPathsWithMultipleRows}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Multiple grounded (active)</span>
            <span className="assembly-summary-v">
              {summary.multipleActiveGrounded ? <strong>yes</strong> : 'no'}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Motion isolated</span>
            <span className="assembly-summary-v">{summary.motionIsolatedCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Grounded / roots / children</span>
            <span className="assembly-summary-v">
              {summary.groundedActiveCount} / {summary.rootActiveCount} / {summary.childActiveCount}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Broken parentId</span>
            <span className="assembly-summary-v">
              {summary.invalidParentRefActiveCount > 0 ? (
                <strong>{summary.invalidParentRefActiveCount}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Parent self-ref (active)</span>
            <span className="assembly-summary-v">
              {summary.activeParentSelfRefCount > 0 ? (
                <strong>{summary.activeParentSelfRefCount}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Parent cycle (active)</span>
            <span className="assembly-summary-v">
              {summary.activeParentGraphHasCycle ? <strong>yes — fix chain</strong> : 'no'}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Same-transform pairs</span>
            <span className="assembly-summary-v">{summary.sameTransformActivePairCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Distinct part numbers</span>
            <span className="assembly-summary-v">
              {summary.distinctActivePartNumbers.length
                ? summary.distinctActivePartNumbers.join(', ')
                : '—'}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">PNs with 2+ active rows</span>
            <span className="assembly-summary-v">
              {summary.activePartNumbersWithMultipleRows > 0 ? (
                <strong>{summary.activePartNumbersWithMultipleRows}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">External component refs</span>
            <span className="assembly-summary-v">
              {summary.distinctActiveExternalRefs.length
                ? summary.distinctActiveExternalRefs.join(', ')
                : '—'}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Active rows with BOM notes</span>
            <span className="assembly-summary-v">{summary.activeWithBomNotesCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Explode metadata</span>
            <span className="assembly-summary-v">{summary.hasExplodeViewMetadata ? 'on' : 'off'}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Motion study stub</span>
            <span className="assembly-summary-v">{summary.hasMotionStudyStub ? 'on' : 'off'}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Motion link stubs (complete)</span>
            <span className="assembly-summary-v">{summary.activeMotionLinkStubCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Rows with linked instance (active)</span>
            <span className="assembly-summary-v">{summary.activeWithLinkedInstanceCount}</span>
          </div>
          <div>
            <span className="assembly-summary-k">Invalid linkedInstanceId (active)</span>
            <span className="assembly-summary-v">
              {summary.invalidLinkedInstanceRefActiveCount > 0 ? (
                <strong>{summary.invalidLinkedInstanceRefActiveCount}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
          <div>
            <span className="assembly-summary-k">Incomplete motion link fields (active)</span>
            <span className="assembly-summary-v">
              {summary.activeMotionLinkIncompleteCount > 0 ? (
                <strong>{summary.activeMotionLinkIncompleteCount}</strong>
              ) : (
                '0'
              )}
            </span>
          </div>
        </div>
        <h4 className="subh" style={{ margin: '0.75rem 0 0.35rem' }}>
          Joints (active)
        </h4>
        <ul className="interference-pair-list">
          {Object.keys(summary.jointCounts).length === 0 ? (
            <li className="msg msg--muted">No joint kinds set on active rows.</li>
          ) : (
            Object.entries(summary.jointCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([joint, n]) => (
                <li key={joint}>
                  <strong>{joint}</strong>: {n}
                </li>
              ))
          )}
        </ul>
        <h4 className="subh" style={{ margin: '0.75rem 0 0.35rem' }}>
          Motion link kinds (active)
        </h4>
        <ul className="interference-pair-list">
          {Object.keys(summary.motionLinkKindCounts).length === 0 ? (
            <li className="msg msg--muted">No motion link kinds set on active rows.</li>
          ) : (
            Object.entries(summary.motionLinkKindCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([kind, n]) => (
                <li key={kind}>
                  <strong>{kind}</strong>: {n}
                </li>
              ))
          )}
        </ul>
      </section>

      <section className="panel panel--nested" style={{ marginTop: '1rem' }} aria-label="BOM preview">
        <h3 className="subh">BOM preview (same columns as output/bom.csv)</h3>
        <div className="assembly-bom-scroll">
          <table className="assembly-bom-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Part path</th>
                <th>Mesh</th>
                <th>Thumb</th>
                <th>Grounded</th>
                <th>Joint</th>
                <th>Parent</th>
                <th>Ref tag</th>
                <th>PN</th>
                <th>Ext. ref</th>
                <th>Notes</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Vendor</th>
                <th>Cost ea.</th>
                <th>Supp.</th>
                <th>Motion iso.</th>
                <th>Link peer</th>
                <th>Link kind</th>
                <th>Instance ID</th>
              </tr>
            </thead>
            <tbody>
              {asm.components.length === 0 ? (
                <tr>
                  <td colSpan={20} className="msg msg--muted">
                    No components yet.
                  </td>
                </tr>
              ) : (
                asm.components.map((c) => {
                  const meshLint = meshPathLintIssues(c.meshPath)
                  return (
                    <tr
                      key={c.id}
                      className={meshLint.length > 0 ? 'assembly-bom-row--mesh-warn' : undefined}
                      aria-label={
                        meshLint.length > 0
                          ? `${c.name}: mesh path has portability or format hints`
                          : undefined
                      }
                    >
                      <td>{c.name}</td>
                      <td>{c.partPath}</td>
                      <td>{c.meshPath ?? '—'}</td>
                      <td>
                        <BomMeshThumb projectDir={projectDir!} meshPath={c.meshPath} />
                      </td>
                      <td>{c.grounded ? 'yes' : ''}</td>
                      <td>{c.joint ?? '—'}</td>
                      <td>{c.parentId ? (componentIdToName.get(c.parentId) ?? c.parentId) : '—'}</td>
                      <td>{c.referenceTag ?? '—'}</td>
                      <td>{c.partNumber ?? '—'}</td>
                      <td>{c.externalComponentRef ?? '—'}</td>
                      <td>{c.bomNotes ?? '—'}</td>
                      <td>{c.bomQuantity}</td>
                      <td>{c.bomUnit ?? '—'}</td>
                      <td>{c.bomVendor ?? '—'}</td>
                      <td>{c.bomCostEach ?? '—'}</td>
                      <td>{c.suppressed ? 'yes' : ''}</td>
                      <td>{c.motionIsolated ? 'yes' : ''}</td>
                      <td>
                        {c.linkedInstanceId
                          ? componentIdToName.get(c.linkedInstanceId) ?? c.linkedInstanceId
                          : '—'}
                      </td>
                      <td>{c.motionLinkKind ?? '—'}</td>
                      <td title={c.id} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8em" }}>
                        {c.id.length > 12 ? `${c.id.slice(0, 8)}…` : c.id}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {interferenceReport ? (
        <section
          id="assembly-interference-report"
          className="panel assembly-interference panel--nested"
          style={{ marginTop: '1rem' }}
          aria-live="polite"
        >
          <h3 className="subh">Last interference report</h3>
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <button type="button" className="secondary" onClick={exportInterferenceJson}>
              Export report JSON
            </button>
            <button type="button" className="secondary" onClick={() => void saveInterferenceToProject()}>
              Save report to project output/
            </button>
          </div>
          <p className="msg">{interferenceReport.message}</p>
          {interferenceReport.assemblyStats ? (
            <div className="assembly-stats panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                Assembly summary (active components)
              </h4>
              <p className="msg">
                Instances: {interferenceReport.assemblyStats.activeComponentCount} · BOM qty sum:{' '}
                {interferenceReport.assemblyStats.totalBomQuantity}
                {interferenceReport.assemblyStats.motionIsolatedCount != null ? (
                  <>
                    {' '}
                    · Motion-isolated: {interferenceReport.assemblyStats.motionIsolatedCount}
                  </>
                ) : null}
              </p>
              <ul className="interference-pair-list">
                {Object.entries(interferenceReport.assemblyStats.jointCounts)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([joint, n]) => (
                    <li key={joint}>
                      Joint <strong>{joint}</strong>: {n}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {interferenceReport.meshWarnings && interferenceReport.meshWarnings.length > 0 ? (
            <div className="panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                Mesh load notes
              </h4>
              <ul className="interference-pair-list">
                {interferenceReport.meshWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {interferenceReport.meshResolvedCount != null && interferenceReport.meshResolvedCount > 0 ? (
            <p className="msg msg--muted" style={{ marginTop: '0.75rem' }}>
              Meshes resolved for interference: {interferenceReport.meshResolvedCount} (binary STL + transform → world
              AABB).
            </p>
          ) : null}
          {interferenceReport.meshAabbOverlapPairs && interferenceReport.meshAabbOverlapPairs.length > 0 ? (
            <div className="panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                World AABB overlap (coarse)
              </h4>
              <ul className="interference-pair-list">
                {interferenceReport.meshAabbOverlapPairs.map((p) => (
                  <li key={`mesh-${p.aId}-${p.bId}`}>
                    <strong>{p.aName}</strong> ↔ <strong>{p.bName}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : interferenceReport.meshResolvedCount != null && interferenceReport.meshResolvedCount >= 2 ? (
            <p className="msg msg--muted" style={{ marginTop: '0.75rem' }}>
              No world AABB overlaps between resolved meshes.
            </p>
          ) : null}
          {interferenceReport.triangleStubPairs && interferenceReport.triangleStubPairs.length > 0 ? (
            <div className="panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                Triangle SAT stub (first triangle vs first triangle)
              </h4>
              <ul className="interference-pair-list">
                {interferenceReport.triangleStubPairs.map((p) => (
                  <li key={`tri-${p.aId}-${p.bId}`}>
                    <strong>{p.aName}</strong> ↔ <strong>{p.bName}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {interferenceReport.narrowPhaseOverlapPairs && interferenceReport.narrowPhaseOverlapPairs.length > 0 ? (
            <div className="panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                Narrow-phase mesh overlap (spatial hash + SAT, capped)
              </h4>
              <ul className="interference-pair-list">
                {interferenceReport.narrowPhaseOverlapPairs.map((p) => (
                  <li key={`np-${p.aId}-${p.bId}`}>
                    <strong>{p.aName}</strong> ↔ <strong>{p.bName}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {interferenceReport.meshNarrowPhaseNotes && interferenceReport.meshNarrowPhaseNotes.length > 0 ? (
            <div className="panel--nested" style={{ marginTop: '0.75rem' }}>
              <h4 className="subh" style={{ margin: '0 0 0.35rem' }}>
                Narrow-phase notes
              </h4>
              <ul className="interference-pair-list">
                {interferenceReport.meshNarrowPhaseNotes.map((w, i) => (
                  <li key={`npn-${i}`}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {interferenceReport.sameTransformPairs && interferenceReport.sameTransformPairs.length > 0 ? (
            <ul className="interference-pair-list">
              {interferenceReport.sameTransformPairs.map((p) => (
                <li key={`${p.aId}-${p.bId}`}>
                  Same transform: <strong>{p.aName}</strong> ↔ <strong>{p.bName}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="msg msg--muted">No identical-transform pairs among active components.</p>
          )}
        </section>
      ) : null}
      <ul className="tools entity-list" style={{ marginTop: '1rem' }}>
        {asm.components.map((c, i) => {
          const meshIssues = meshPathLintIssues(c.meshPath)
          const revoluteClamp = c.joint === 'revolute' ? clampRevolutePreviewAngle(c) : null
          const sliderClamp = c.joint === 'slider' ? clampSliderPreviewMm(c) : null
          const planarClampU = c.joint === 'planar' ? clampPlanarPreviewUMm(c) : null
          const planarClampV = c.joint === 'planar' ? clampPlanarPreviewVMm(c) : null
          const universalClamp1 = c.joint === 'universal' ? clampUniversalPreviewAngle1(c) : null
          const universalClamp2 = c.joint === 'universal' ? clampUniversalPreviewAngle2(c) : null
          const cylindricalSlideClamp = c.joint === 'cylindrical' ? clampCylindricalSlideMm(c) : null
          const cylindricalSpinClamp = c.joint === 'cylindrical' ? clampCylindricalSpinDeg(c) : null
          const ballClampRx = c.joint === 'ball' ? clampBallPreviewRx(c) : null
          const ballClampRy = c.joint === 'ball' ? clampBallPreviewRy(c) : null
          const ballClampRz = c.joint === 'ball' ? clampBallPreviewRz(c) : null
          return (
            <li key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="row" style={{ width: '100%' }}>
                <label>
                  Name
                  <input value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
                </label>
                <label>
                  Part path
                  <input value={c.partPath} onChange={(e) => update(i, { partPath: e.target.value })} />
                </label>
                <label>
                  Mesh (STL)
                  <input
                    placeholder="e.g. output/part.stl"
                    value={c.meshPath ?? ''}
                    onChange={(e) =>
                      update(i, { meshPath: e.target.value === '' ? undefined : e.target.value })
                    }
                  />
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={c.grounded}
                    onChange={(e) => update(i, { grounded: e.target.checked })}
                  />
                  Grounded
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={c.suppressed}
                    onChange={(e) => update(i, { suppressed: e.target.checked })}
                  />
                  Suppressed
                </label>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={c.motionIsolated}
                    onChange={(e) => update(i, { motionIsolated: e.target.checked })}
                  />
                  Motion isolated
                </label>
                <button type="button" className="secondary" onClick={() => remove(i)}>
                  Remove
                </button>
                <button type="button" className="secondary" onClick={() => duplicateComponent(i)}>
                  Duplicate row
                </button>
              </div>
              {meshIssues.length > 0 ? (
                <ul className="interference-pair-list assembly-mesh-hint" aria-live="polite">
                  {meshIssues.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
              ) : null}
              <div className="row">
                <label>
                  Parent
                  <select
                    value={c.parentId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      update(i, { parentId: v === '' ? undefined : v })
                    }}
                  >
                    <option value="">—</option>
                    {asm.components
                      .filter((o) => o.id !== c.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Link peer (stub)
                  <select
                    value={c.linkedInstanceId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      update(i, { linkedInstanceId: v === '' ? undefined : v })
                    }}
                  >
                    <option value="">—</option>
                    {asm.components
                      .filter((o) => o.id !== c.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Link kind
                  <select
                    value={c.motionLinkKind ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      update(
                        i,
                        v === ''
                          ? { motionLinkKind: undefined }
                          : { motionLinkKind: v as NonNullable<AssemblyComponent['motionLinkKind']> }
                      )
                    }}
                  >
                    <option value="">—</option>
                    <option value="mate">Mate</option>
                    <option value="contact">Contact</option>
                    <option value="align">Align</option>
                  </select>
                </label>
                <label>
                  Reference tag
                  <input
                    placeholder="Item / drawing ref"
                    value={c.referenceTag ?? ''}
                    onChange={(e) =>
                      update(i, { referenceTag: e.target.value === '' ? undefined : e.target.value })
                    }
                  />
                </label>
                <label>
                  Part number
                  <input
                    placeholder="PN / stock no."
                    value={c.partNumber ?? ''}
                    onChange={(e) =>
                      update(i, { partNumber: e.target.value === '' ? undefined : e.target.value })
                    }
                  />
                </label>
                <label>
                  External component ref
                  <input
                    placeholder="PDM / ERP id"
                    value={c.externalComponentRef ?? ''}
                    onChange={(e) =>
                      update(i, {
                        externalComponentRef: e.target.value === '' ? undefined : e.target.value
                      })
                    }
                  />
                </label>
                <label>
                  BOM notes
                  <input
                    placeholder="Mfg / kitting notes"
                    value={c.bomNotes ?? ''}
                    onChange={(e) => update(i, { bomNotes: e.target.value === '' ? undefined : e.target.value })}
                  />
                </label>
                <label>
                  BOM qty
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={c.bomQuantity}
                    onChange={(e) =>
                      update(i, { bomQuantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })
                    }
                  />
                </label>
                <label>
                  Unit
                  <input
                    placeholder="ea, m, kg…"
                    value={c.bomUnit ?? ''}
                    onChange={(e) => update(i, { bomUnit: e.target.value === '' ? undefined : e.target.value })}
                  />
                </label>
                <label>
                  Vendor
                  <input
                    placeholder="Supplier"
                    value={c.bomVendor ?? ''}
                    onChange={(e) => update(i, { bomVendor: e.target.value === '' ? undefined : e.target.value })}
                  />
                </label>
                <label>
                  Cost each
                  <input
                    placeholder="e.g. 12.50 USD"
                    value={c.bomCostEach ?? ''}
                    onChange={(e) => update(i, { bomCostEach: e.target.value === '' ? undefined : e.target.value })}
                  />
                </label>
              </div>
              {motionLinkStubIssues(c).length > 0 ? (
                <ul className="interference-pair-list assembly-mesh-hint" aria-live="polite">
                  {motionLinkStubIssues(c).map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
              ) : null}
              <div className="row">
                <label>
                  X mm
                  <input
                    type="number"
                    value={c.transform.x}
                    onChange={(e) =>
                      update(i, { transform: { ...c.transform, x: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Y mm
                  <input
                    type="number"
                    value={c.transform.y}
                    onChange={(e) =>
                      update(i, { transform: { ...c.transform, y: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Z mm
                  <input
                    type="number"
                    value={c.transform.z}
                    onChange={(e) =>
                      update(i, { transform: { ...c.transform, z: Number(e.target.value) || 0 } })
                    }
                  />
                </label>
                <label>
                  Joint
                  <select
                    value={c.joint ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      update(i, { joint: v === '' ? undefined : (v as NonNullable<AssemblyComponent['joint']>) })
                    }}
                  >
                    <option value="">—</option>
                    <option value="rigid">Rigid</option>
                    <option value="slider">Slider</option>
                    <option value="revolute">Revolute</option>
                    <option value="planar">Planar</option>
                    <option value="cylindrical">Cylindrical</option>
                    <option value="ball">Ball (spherical)</option>
                    <option value="universal">Universal (Cardan)</option>
                  </select>
                </label>
                <label>
                  Preset
                  <select
                    aria-label={`Joint preset for ${c.name}`}
                    key={`${c.id}-${c.joint ?? 'none'}`}
                    defaultValue=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (id === '') return
                      const pr = assemblyJointPresets.find((p) => p.id === id)
                      if (pr) update(i, { joint: pr.joint })
                      e.currentTarget.selectedIndex = 0
                    }}
                  >
                    <option value="">Quick…</option>
                    {assemblyJointPresets.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="msg msg--muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                {assemblyJointDofHint(c.joint)}
              </p>
              {c.joint === 'revolute' && revoluteClamp ? (
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label>
                    Axis frame
                    <select
                      value={c.revolutePreviewAxisFrame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          revolutePreviewAxisFrame: e.target.value as NonNullable<
                            AssemblyComponent['revolutePreviewAxisFrame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Revolute axis (+X/+Y/+Z)
                    <select
                      value={c.revolutePreviewAxis ?? 'z'}
                      onChange={(e) =>
                        update(i, {
                          revolutePreviewAxis: e.target.value as NonNullable<
                            AssemblyComponent['revolutePreviewAxis']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '14rem' }}>
                    Revolute preview (°) — viewport only at this row pivot
                    <input
                      type="range"
                      min={revoluteClamp.lo}
                      max={revoluteClamp.hi}
                      step={1}
                      value={Math.round(revoluteClamp.clamped)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { revolutePreviewAngleDeg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Angle value
                    <input
                      type="number"
                      step={1}
                      value={c.revolutePreviewAngleDeg ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { revolutePreviewAngleDeg: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { revolutePreviewAngleDeg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Min °
                    <input
                      type="number"
                      step={1}
                      value={c.revolutePreviewMinDeg ?? ''}
                      placeholder="-180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { revolutePreviewMinDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { revolutePreviewMinDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Max °
                    <input
                      type="number"
                      step={1}
                      value={c.revolutePreviewMaxDeg ?? ''}
                      placeholder="180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { revolutePreviewMaxDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { revolutePreviewMaxDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {c.joint === 'slider' && sliderClamp ? (
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label>
                    Axis frame
                    <select
                      value={c.sliderPreviewAxisFrame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          sliderPreviewAxisFrame: e.target.value as NonNullable<
                            AssemblyComponent['sliderPreviewAxisFrame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Slider axis (+X/+Y/+Z)
                    <select
                      value={c.sliderPreviewAxis ?? 'z'}
                      onChange={(e) =>
                        update(i, {
                          sliderPreviewAxis: e.target.value as NonNullable<
                            AssemblyComponent['sliderPreviewAxis']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '14rem' }}>
                    Slider preview (mm) — viewport only
                    <input
                      type="range"
                      min={sliderClamp.lo}
                      max={sliderClamp.hi}
                      step={0.5}
                      value={sliderClamp.clamped}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { sliderPreviewMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    mm
                    <input
                      type="number"
                      step={0.5}
                      value={c.sliderPreviewMm ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { sliderPreviewMm: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { sliderPreviewMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Min mm
                    <input
                      type="number"
                      step={1}
                      value={c.sliderPreviewMinMm ?? ''}
                      placeholder="-500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { sliderPreviewMinMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { sliderPreviewMinMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Max mm
                    <input
                      type="number"
                      step={1}
                      value={c.sliderPreviewMaxMm ?? ''}
                      placeholder="500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { sliderPreviewMaxMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { sliderPreviewMaxMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {c.joint === 'planar' && planarClampU && planarClampV ? (
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <p className="msg msg--muted" style={{ width: '100%', margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                    Planar preview — translate in the plane orthogonal to the normal; **U** and **V** are an orthonormal
                    in-plane pair derived from that normal (viewport only).
                  </p>
                  <label>
                    Normal frame
                    <select
                      value={c.planarPreviewNormalFrame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          planarPreviewNormalFrame: e.target.value as NonNullable<
                            AssemblyComponent['planarPreviewNormalFrame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Plane normal (+X/+Y/+Z)
                    <select
                      value={c.planarPreviewNormalAxis ?? 'z'}
                      onChange={(e) =>
                        update(i, {
                          planarPreviewNormalAxis: e.target.value as NonNullable<
                            AssemblyComponent['planarPreviewNormalAxis']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    U (mm)
                    <input
                      type="range"
                      min={planarClampU.lo}
                      max={planarClampU.hi}
                      step={0.5}
                      value={planarClampU.clamped}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { planarPreviewUMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    U mm
                    <input
                      type="number"
                      step={0.5}
                      value={c.planarPreviewUMm ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { planarPreviewUMm: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { planarPreviewUMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    U min
                    <input
                      type="number"
                      step={1}
                      value={c.planarPreviewUMinMm ?? ''}
                      placeholder="-500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { planarPreviewUMinMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { planarPreviewUMinMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    U max
                    <input
                      type="number"
                      step={1}
                      value={c.planarPreviewUMaxMm ?? ''}
                      placeholder="500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { planarPreviewUMaxMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { planarPreviewUMaxMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    V (mm)
                    <input
                      type="range"
                      min={planarClampV.lo}
                      max={planarClampV.hi}
                      step={0.5}
                      value={planarClampV.clamped}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { planarPreviewVMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    V mm
                    <input
                      type="number"
                      step={0.5}
                      value={c.planarPreviewVMm ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { planarPreviewVMm: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { planarPreviewVMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    V min
                    <input
                      type="number"
                      step={1}
                      value={c.planarPreviewVMinMm ?? ''}
                      placeholder="-500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { planarPreviewVMinMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { planarPreviewVMinMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    V max
                    <input
                      type="number"
                      step={1}
                      value={c.planarPreviewVMaxMm ?? ''}
                      placeholder="500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { planarPreviewVMaxMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { planarPreviewVMaxMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {c.joint === 'universal' && universalClamp1 && universalClamp2 ? (
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <p className="msg msg--muted" style={{ width: '100%', margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                    Universal (Cardan) preview — rotate about axis 1, then axis 2 at this row pivot. Viewport only.
                  </p>
                  <label>
                    Axis 1 frame
                    <select
                      value={c.universalPreviewAxis1Frame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          universalPreviewAxis1Frame: e.target.value as NonNullable<
                            AssemblyComponent['universalPreviewAxis1Frame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Axis 1 (+X/+Y/+Z)
                    <select
                      value={c.universalPreviewAxis1 ?? 'z'}
                      onChange={(e) =>
                        update(i, {
                          universalPreviewAxis1: e.target.value as NonNullable<
                            AssemblyComponent['universalPreviewAxis1']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    Angle 1 (°)
                    <input
                      type="range"
                      min={universalClamp1.lo}
                      max={universalClamp1.hi}
                      step={1}
                      value={Math.round(universalClamp1.clamped)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { universalPreviewAngle1Deg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Value
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle1Deg ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { universalPreviewAngle1Deg: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { universalPreviewAngle1Deg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Min °
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle1MinDeg ?? ''}
                      placeholder="-180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { universalPreviewAngle1MinDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { universalPreviewAngle1MinDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Max °
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle1MaxDeg ?? ''}
                      placeholder="180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { universalPreviewAngle1MaxDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { universalPreviewAngle1MaxDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Axis 2 frame
                    <select
                      value={c.universalPreviewAxis2Frame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          universalPreviewAxis2Frame: e.target.value as NonNullable<
                            AssemblyComponent['universalPreviewAxis2Frame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Axis 2 (+X/+Y/+Z)
                    <select
                      value={c.universalPreviewAxis2 ?? 'x'}
                      onChange={(e) =>
                        update(i, {
                          universalPreviewAxis2: e.target.value as NonNullable<
                            AssemblyComponent['universalPreviewAxis2']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    Angle 2 (°)
                    <input
                      type="range"
                      min={universalClamp2.lo}
                      max={universalClamp2.hi}
                      step={1}
                      value={Math.round(universalClamp2.clamped)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { universalPreviewAngle2Deg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Value
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle2Deg ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { universalPreviewAngle2Deg: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { universalPreviewAngle2Deg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Min °
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle2MinDeg ?? ''}
                      placeholder="-180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { universalPreviewAngle2MinDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { universalPreviewAngle2MinDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Max °
                    <input
                      type="number"
                      step={1}
                      value={c.universalPreviewAngle2MaxDeg ?? ''}
                      placeholder="180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { universalPreviewAngle2MaxDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { universalPreviewAngle2MaxDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {c.joint === 'cylindrical' && cylindricalSlideClamp && cylindricalSpinClamp ? (
                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <p className="msg msg--muted" style={{ width: '100%', margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                    Cylindrical preview — slide along axis, then spin about the same axis through this pivot. Viewport
                    only.
                  </p>
                  <label>
                    Axis frame
                    <select
                      value={c.cylindricalPreviewAxisFrame ?? 'world'}
                      onChange={(e) =>
                        update(i, {
                          cylindricalPreviewAxisFrame: e.target.value as NonNullable<
                            AssemblyComponent['cylindricalPreviewAxisFrame']
                          >
                        })
                      }
                    >
                      <option value="world">World</option>
                      <option value="parent">Parent local</option>
                    </select>
                  </label>
                  <label>
                    Shared axis (+X/+Y/+Z)
                    <select
                      value={c.cylindricalPreviewAxis ?? 'z'}
                      onChange={(e) =>
                        update(i, {
                          cylindricalPreviewAxis: e.target.value as NonNullable<
                            AssemblyComponent['cylindricalPreviewAxis']
                          >
                        })
                      }
                    >
                      <option value="x">+X</option>
                      <option value="y">+Y</option>
                      <option value="z">+Z</option>
                    </select>
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    Slide (mm)
                    <input
                      type="range"
                      min={cylindricalSlideClamp.lo}
                      max={cylindricalSlideClamp.hi}
                      step={0.5}
                      value={cylindricalSlideClamp.clamped}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { cylindricalPreviewSlideMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    mm
                    <input
                      type="number"
                      step={0.5}
                      value={c.cylindricalPreviewSlideMm ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { cylindricalPreviewSlideMm: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { cylindricalPreviewSlideMm: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Slide min mm
                    <input
                      type="number"
                      step={1}
                      value={c.cylindricalPreviewSlideMinMm ?? ''}
                      placeholder="-500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { cylindricalPreviewSlideMinMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { cylindricalPreviewSlideMinMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Slide max mm
                    <input
                      type="number"
                      step={1}
                      value={c.cylindricalPreviewSlideMaxMm ?? ''}
                      placeholder="500"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { cylindricalPreviewSlideMaxMm: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { cylindricalPreviewSlideMaxMm: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label style={{ minWidth: '12rem' }}>
                    Spin (°)
                    <input
                      type="range"
                      min={cylindricalSpinClamp.lo}
                      max={cylindricalSpinClamp.hi}
                      step={1}
                      value={Math.round(cylindricalSpinClamp.clamped)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        update(i, { cylindricalPreviewSpinDeg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    °
                    <input
                      type="number"
                      step={1}
                      value={c.cylindricalPreviewSpinDeg ?? ''}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          update(i, { cylindricalPreviewSpinDeg: undefined })
                          return
                        }
                        const v = Number(raw)
                        update(i, { cylindricalPreviewSpinDeg: Number.isFinite(v) ? v : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Spin min °
                    <input
                      type="number"
                      step={1}
                      value={c.cylindricalPreviewSpinMinDeg ?? ''}
                      placeholder="-180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { cylindricalPreviewSpinMinDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { cylindricalPreviewSpinMinDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                  <label>
                    Spin max °
                    <input
                      type="number"
                      step={1}
                      value={c.cylindricalPreviewSpinMaxDeg ?? ''}
                      placeholder="180"
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === '') {
                          update(i, { cylindricalPreviewSpinMaxDeg: undefined })
                          return
                        }
                        const n = Number(raw)
                        update(i, { cylindricalPreviewSpinMaxDeg: Number.isFinite(n) ? n : undefined })
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {c.joint === 'ball' && ballClampRx && ballClampRy && ballClampRz ? (
                <div className="panel--nested" style={{ marginTop: '0.5rem' }}>
                  <p className="msg msg--muted" style={{ margin: '0 0 0.35rem', fontSize: '0.82rem' }}>
                    Ball preview (viewport only): rotations about world <strong>+X</strong>, then <strong>+Y</strong>,
                    then <strong>+Z</strong> through this row’s pivot.
                  </p>
                  <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <label>
                      Rx ° (slider)
                      <input
                        type="range"
                        min={ballClampRx.lo}
                        max={ballClampRx.hi}
                        value={Math.round(ballClampRx.clamped)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          update(i, { ballPreviewRxDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rx °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRxDeg ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRxDeg: undefined })
                            return
                          }
                          const v = Number(raw)
                          update(i, { ballPreviewRxDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rx min °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRxMinDeg ?? ''}
                        placeholder="-180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRxMinDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRxMinDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rx max °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRxMaxDeg ?? ''}
                        placeholder="180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRxMaxDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRxMaxDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <label>
                      Ry ° (slider)
                      <input
                        type="range"
                        min={ballClampRy.lo}
                        max={ballClampRy.hi}
                        value={Math.round(ballClampRy.clamped)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          update(i, { ballPreviewRyDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Ry °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRyDeg ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRyDeg: undefined })
                            return
                          }
                          const v = Number(raw)
                          update(i, { ballPreviewRyDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Ry min °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRyMinDeg ?? ''}
                        placeholder="-180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRyMinDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRyMinDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Ry max °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRyMaxDeg ?? ''}
                        placeholder="180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRyMaxDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRyMaxDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <label>
                      Rz ° (slider)
                      <input
                        type="range"
                        min={ballClampRz.lo}
                        max={ballClampRz.hi}
                        value={Math.round(ballClampRz.clamped)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          update(i, { ballPreviewRzDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rz °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRzDeg ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRzDeg: undefined })
                            return
                          }
                          const v = Number(raw)
                          update(i, { ballPreviewRzDeg: Number.isFinite(v) ? v : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rz min °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRzMinDeg ?? ''}
                        placeholder="-180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRzMinDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRzMinDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                    <label>
                      Rz max °
                      <input
                        type="number"
                        step={1}
                        value={c.ballPreviewRzMaxDeg ?? ''}
                        placeholder="180"
                        onChange={(e) => {
                          const raw = e.target.value.trim()
                          if (raw === '') {
                            update(i, { ballPreviewRzMaxDeg: undefined })
                            return
                          }
                          const n = Number(raw)
                          update(i, { ballPreviewRzMaxDeg: Number.isFinite(n) ? n : undefined })
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
