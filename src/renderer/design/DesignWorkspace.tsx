import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Vector3 } from 'three'
import type { DesignFileV2, SketchConstraint } from '../../shared/design-schema'
import type { KernelPostSolidOp } from '../../shared/part-features-schema'
import { formatKernelBuildStatus } from '../../shared/kernel-build-messages'
import { circleThroughThreePoints } from '../../shared/sketch-profile'
import {
  circularPatternSketchInstances,
  linearPatternSketchInstances,
  offsetClosedPolylineEntity
} from './design-ops'
import { useDesignCommandListener } from './design-command-bridge'
import { meshToStlBase64 } from './export-stl'
import { Sketch2DCanvas, type SketchTool } from './Sketch2DCanvas'
import { Viewport3D } from './Viewport3D'
import { worldPointToSketchMm } from './sketch-preview-placement'
import { worldYRangeFromExtrudeMeshGeometry } from './viewport3d-bounds'
import { useDesignSession } from './DesignSessionContext'
import {
  IconArc,
  IconCircle,
  IconConstraint,
  IconDim,
  IconExport,
  IconKernel,
  IconLine,
  IconLoft,
  IconMeasure,
  IconMirror,
  IconParams,
  IconPattern,
  IconPolygon,
  IconPolyline,
  IconRect,
  IconRevolve,
  IconSave,
  IconSection,
  IconSketchPoint,
  IconSketchFillet,
  IconChamfer,
  IconSlot,
  IconSlotOverall,
  IconTrim,
  IconUndo
} from './ribbon/designRibbonIcons'
import {
  DESIGN_RIBBON_TABS,
  type DesignRibbonTabId,
  RibbonFusionGroup,
  RibbonIconButton
} from './ribbon/RibbonPrimitives'

function sketchDatumLabel(plane: DesignFileV2['sketchPlane']): string {
  if (plane.kind === 'face') return 'Picked face'
  const labels = { XY: 'Top (XY)', XZ: 'Front (XZ)', YZ: 'Right (YZ)' } as const
  return labels[plane.datum]
}

export function DesignWorkspace() {
  const ctx = useDesignSession()
  const {
    projectDir,
    design,
    loaded,
    geometry,
    onDesignChange,
    dispatch,
    saveDesign,
    exportStl,
    removeEntity,
    addPresetRect,
    addConstraint,
    runSolve,
    setParameter,
    mirrorX,
    pattern40X,
    undo,
    pastLength,
    solveReport,
    onStatus,
    onExportedStl,
    appendKernelOp,
    removeKernelOpAt,
    moveKernelOp,
    setKernelOpSuppressedAt,
    features
  } = ctx

  const [tool, setTool] = useState<SketchTool>('rect')
  const [gridMm, setGridMm] = useState(1)
  const [cType, setCType] = useState<SketchConstraint['type']>('horizontal')
  const [cA, setCA] = useState('')
  const [cB, setCB] = useState('')
  const [cC, setCC] = useState('')
  const [cD, setCD] = useState('')
  const [cParam, setCParam] = useState('d1')
  const [pickSlot, setPickSlot] = useState<null | 'cA' | 'cB' | 'cC' | 'cD'>(null)
  const [entityPickSlot, setEntityPickSlot] = useState<null | 'cA' | 'cB'>(null)
  const [kernelFilletMm, setKernelFilletMm] = useState(1)
  const [sketchFilletMm, setSketchFilletMm] = useState(2)
  const [sketchChamferMm, setSketchChamferMm] = useState(2)
  const [sketchRotateDeg, setSketchRotateDeg] = useState(15)
  const [sketchScaleFactor, setSketchScaleFactor] = useState(1.05)
  /** Linear pattern: total instance count (original + copies along Δ). */
  const [sketchPatternInstances, setSketchPatternInstances] = useState(2)
  const [sketchPatternDx, setSketchPatternDx] = useState(40)
  const [sketchPatternDy, setSketchPatternDy] = useState(0)
  const [sketchPatternMode, setSketchPatternMode] = useState<'linear' | 'circular'>('linear')
  const [sketchCircPivotX, setSketchCircPivotX] = useState(0)
  const [sketchCircPivotY, setSketchCircPivotY] = useState(0)
  const [sketchCircTotalDeg, setSketchCircTotalDeg] = useState(360)
  const [sketchCircStartDeg, setSketchCircStartDeg] = useState(0)
  const [kernelChamferMm, setKernelChamferMm] = useState(1)
  const [kernelEdgeDirection, setKernelEdgeDirection] = useState<'+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'>('+Z')
  const [kernelShellMm, setKernelShellMm] = useState(2)
  const [kernelShellOpenDirection, setKernelShellOpenDirection] = useState<
    '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  >('+Z')
  const [kernelPatX, setKernelPatX] = useState(2)
  const [kernelPatY, setKernelPatY] = useState(1)
  const [kernelPatDx, setKernelPatDx] = useState(40)
  const [kernelPatDy, setKernelPatDy] = useState(0)
  const [kernelPatCircN, setKernelPatCircN] = useState(6)
  const [kernelPatCircCx, setKernelPatCircCx] = useState(0)
  const [kernelPatCircCy, setKernelPatCircCy] = useState(0)
  const [kernelPatCircTotalDeg, setKernelPatCircTotalDeg] = useState(360)
  const [kernelPatCircStartDeg, setKernelPatCircStartDeg] = useState(0)
  const [kernelLin3dN, setKernelLin3dN] = useState(3)
  const [kernelLin3dDx, setKernelLin3dDx] = useState(25)
  const [kernelLin3dDy, setKernelLin3dDy] = useState(0)
  const [kernelLin3dDz, setKernelLin3dDz] = useState(0)
  const [kernelPathPatternCount, setKernelPathPatternCount] = useState(5)
  const [kernelPathPatternEntityId, setKernelPathPatternEntityId] = useState('')
  const [kernelMirrorPlane, setKernelMirrorPlane] = useState<'YZ' | 'XZ' | 'XY'>('YZ')
  const [kernelMirrorPivotMm, setKernelMirrorPivotMm] = useState(0)
  const [kernelIxMin, setKernelIxMin] = useState(-12)
  const [kernelIxMax, setKernelIxMax] = useState(12)
  const [kernelIyMin, setKernelIyMin] = useState(-12)
  const [kernelIyMax, setKernelIyMax] = useState(12)
  const [kernelIzMin, setKernelIzMin] = useState(0)
  const [kernelIzMax, setKernelIzMax] = useState(8)
  const [kernelCombineMode, setKernelCombineMode] = useState<'union' | 'subtract' | 'intersect'>('subtract')
  const [kernelCombineProfileIndex, setKernelCombineProfileIndex] = useState(0)
  const [kernelCombineDepthMm, setKernelCombineDepthMm] = useState(8)
  const [kernelCombineZStartMm, setKernelCombineZStartMm] = useState(0)
  const [kernelSplitAxis, setKernelSplitAxis] = useState<'X' | 'Y' | 'Z'>('Z')
  const [kernelSplitOffsetMm, setKernelSplitOffsetMm] = useState(0)
  const [kernelSplitKeep, setKernelSplitKeep] = useState<'positive' | 'negative'>('positive')
  const [kernelHoleProfileIndex, setKernelHoleProfileIndex] = useState(0)
  const [kernelHoleMode, setKernelHoleMode] = useState<'depth' | 'through_all'>('depth')
  const [kernelHoleDepthMm, setKernelHoleDepthMm] = useState(8)
  const [kernelHoleZStartMm, setKernelHoleZStartMm] = useState(0)
  const [kernelThreadCx, setKernelThreadCx] = useState(0)
  const [kernelThreadCy, setKernelThreadCy] = useState(0)
  const [kernelThreadR, setKernelThreadR] = useState(4)
  const [kernelThreadPitch, setKernelThreadPitch] = useState(1.5)
  const [kernelThreadLen, setKernelThreadLen] = useState(8)
  const [kernelThreadDepth, setKernelThreadDepth] = useState(0.4)
  const [kernelThreadZ0, setKernelThreadZ0] = useState(0)
  const [kernelMoveDx, setKernelMoveDx] = useState(10)
  const [kernelMoveDy, setKernelMoveDy] = useState(0)
  const [kernelMoveDz, setKernelMoveDz] = useState(0)
  const [kernelMoveKeepOriginal, setKernelMoveKeepOriginal] = useState(false)
  const [kernelPressPullProfileIndex, setKernelPressPullProfileIndex] = useState(0)
  const [kernelPressPullDeltaMm, setKernelPressPullDeltaMm] = useState(2)
  const [kernelPressPullZStartMm, setKernelPressPullZStartMm] = useState(0)
  const [kernelSweepProfileIndex, setKernelSweepProfileIndex] = useState(0)
  const [kernelSweepPathEntityId, setKernelSweepPathEntityId] = useState('')
  const [kernelSweepZStartMm, setKernelSweepZStartMm] = useState(0)
  const [kernelPipePathEntityId, setKernelPipePathEntityId] = useState('')
  const [kernelPipeOuterRadiusMm, setKernelPipeOuterRadiusMm] = useState(2)
  const [kernelPipeWallThicknessMm, setKernelPipeWallThicknessMm] = useState(0)
  const [kernelPipeUseWall, setKernelPipeUseWall] = useState(false)
  const [kernelPipeZStartMm, setKernelPipeZStartMm] = useState(0)
  const [kernelThickenDeltaMm, setKernelThickenDeltaMm] = useState(1)
  const [kernelCoilCx, setKernelCoilCx] = useState(0)
  const [kernelCoilCy, setKernelCoilCy] = useState(0)
  const [kernelCoilRadius, setKernelCoilRadius] = useState(4)
  const [kernelCoilPitch, setKernelCoilPitch] = useState(1.5)
  const [kernelCoilTurns, setKernelCoilTurns] = useState(4)
  const [kernelCoilDepth, setKernelCoilDepth] = useState(0.4)
  const [kernelCoilZ0, setKernelCoilZ0] = useState(0)
  const [kernelTabCx, setKernelTabCx] = useState(0)
  const [kernelTabCy, setKernelTabCy] = useState(0)
  const [kernelTabZBase, setKernelTabZBase] = useState(8)
  const [kernelTabLen, setKernelTabLen] = useState(14)
  const [kernelTabWid, setKernelTabWid] = useState(8)
  const [kernelTabHt, setKernelTabHt] = useState(5)
  const [offsetPolyId, setOffsetPolyId] = useState('')
  const [offsetMm, setOffsetMm] = useState(2)
  const [linearDimStep, setLinearDimStep] = useState<'off' | 'a' | 'b'>('off')
  const [linearDimAId, setLinearDimAId] = useState('')
  const [alignedDimStep, setAlignedDimStep] = useState<'off' | 'a' | 'b'>('off')
  const [alignedDimAId, setAlignedDimAId] = useState('')
  const [angularDimStep, setAngularDimStep] = useState<'off' | 'l1' | 'l2'>('off')
  const [angularDimL1, setAngularDimL1] = useState<{ a: string; b: string } | null>(null)
  const [dimEntityId, setDimEntityId] = useState('')
  const [dimEntityPickMode, setDimEntityPickMode] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePts, setMeasurePts] = useState<Array<{ x: number; y: number; z: number }>>([])
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionYMm, setSectionYMm] = useState(20)
  const [ribbonTab, setRibbonTab] = useState<DesignRibbonTabId>('solid')
  /** Model = 3D viewport + plane pick; Sketch = full-screen 2D grid only. */
  const [canvasPhase, setCanvasPhase] = useState<'model' | 'sketch'>('model')
  const [facePickMode, setFacePickMode] = useState(false)
  /** Click solid in 3D → project hit points onto sketch plane; Commit adds a polyline. */
  const [projectSketchMode, setProjectSketchMode] = useState(false)
  const [projectSketchDraftMm, setProjectSketchDraftMm] = useState<Array<{ x: number; y: number }>>([])

  const kernelOpActiveCount = features?.kernelOps?.filter((o) => !o.suppressed).length ?? 0
  const kernelOpTotal = features?.kernelOps?.length ?? 0
  const polylineEntityIds = useMemo(
    () =>
      design.entities
        .filter((e) => e.kind === 'polyline')
        .map((e) => e.id)
        .sort((a, b) => a.localeCompare(b)),
    [design.entities]
  )

  useEffect(() => {
    if (polylineEntityIds.length === 0) {
      if (kernelPathPatternEntityId !== '') setKernelPathPatternEntityId('')
      return
    }
    if (!polylineEntityIds.includes(kernelPathPatternEntityId)) {
      setKernelPathPatternEntityId(polylineEntityIds[0] ?? '')
    }
  }, [kernelPathPatternEntityId, polylineEntityIds])

  useEffect(() => {
    if (polylineEntityIds.length === 0) {
      if (kernelSweepPathEntityId !== '') setKernelSweepPathEntityId('')
      return
    }
    if (!polylineEntityIds.includes(kernelSweepPathEntityId)) {
      setKernelSweepPathEntityId(polylineEntityIds[0] ?? '')
    }
  }, [kernelSweepPathEntityId, polylineEntityIds])

  useEffect(() => {
    if (polylineEntityIds.length === 0) {
      if (kernelPipePathEntityId !== '') setKernelPipePathEntityId('')
      return
    }
    if (!polylineEntityIds.includes(kernelPipePathEntityId)) {
      setKernelPipePathEntityId(polylineEntityIds[0] ?? '')
    }
  }, [kernelPipePathEntityId, polylineEntityIds])

  const twoLineConstraint =
    cType === 'perpendicular' || cType === 'parallel' || cType === 'equal' || cType === 'angle'
  const threePointConstraint = cType === 'collinear' || cType === 'midpoint'
  const symmetricConstraint = cType === 'symmetric'
  const tangentConstraint = cType === 'tangent'

  const applyCommandFromPalette = useCallback(
    (commandId: string) => {
      const tools: Record<string, SketchTool> = {
        sk_rect: 'rect',
        sk_rect_3pt: 'rect_3pt',
        sk_slot_center: 'slot_center',
        sk_slot_overall: 'slot_overall',
        sk_circle_center: 'circle',
        sk_circle_2pt: 'circle_2pt',
        sk_circle_3pt: 'circle_3pt',
        sk_polyline: 'polyline',
        sk_polygon: 'polygon',
        sk_point: 'point',
        sk_line: 'line',
        sk_arc_3pt: 'arc',
        sk_arc_center: 'arc_center',
        sk_ellipse: 'ellipse',
        sk_spline_fit: 'spline_fit',
        sk_spline_cp: 'spline_cp',
        sk_trim: 'trim',
        sk_split: 'split',
        sk_break: 'break',
        sk_extend: 'extend',
        sk_fillet_sk: 'fillet',
        sk_chamfer_sk: 'chamfer',
        sk_move_sk: 'move_sk',
        sk_rotate_sk: 'rotate_sk',
        sk_scale_sk: 'scale_sk',
        sk_mirror_sk: 'mirror_sk'
      }
      const t = tools[commandId]
      if (t) {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        setTool(t)
        onStatus?.(`Sketch tool: ${t}`)
        return
      }
      const ct: Record<string, SketchConstraint['type']> = {
        co_horizontal: 'horizontal',
        co_vertical: 'vertical',
        co_coincident: 'coincident',
        co_distance: 'distance',
        co_fix: 'fix',
        co_perpendicular: 'perpendicular',
        co_parallel: 'parallel',
        co_equal: 'equal',
        co_collinear: 'collinear',
        co_midpoint: 'midpoint',
        co_angle: 'angle',
        co_tangent: 'tangent',
        co_symmetric: 'symmetric',
        co_concentric: 'concentric',
        co_radius: 'radius',
        co_diameter: 'diameter'
      }
      const nextC = ct[commandId]
      if (nextC) {
        setRibbonTab('constraint')
        setCanvasPhase('sketch')
        setCType(nextC)
        onStatus?.(`Constraint type: ${nextC}`)
        return
      }
      if (commandId === 'ut_measure') {
        setRibbonTab('inspect')
        setCanvasPhase('model')
        setMeasureMode(true)
        setMeasurePts([])
        onStatus?.('Measure on — Shift+click two points on the 3D solid. Esc clears.')
        return
      }
      if (commandId === 'ut_section') {
        setRibbonTab('inspect')
        setCanvasPhase('model')
        setSectionEnabled(true)
        const ext = geometry ? worldYRangeFromExtrudeMeshGeometry(geometry) : { min: 0, max: 40 }
        setSectionYMm((ext.min + ext.max) / 2)
        onStatus?.('Section on — drag Y clip under 3D preview. Esc clears.')
        return
      }
      if (commandId === 'ut_parameters') {
        setRibbonTab('constraint')
        setCanvasPhase('sketch')
        queueMicrotask(() => {
          document.getElementById('design-parameters-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        onStatus?.('Parameters — Constraint tab.')
      }
      if (commandId === 'sk_choose_plane') {
        setRibbonTab('sketch')
        setCanvasPhase('model')
        setFacePickMode(false)
        setMeasureMode(false)
        setSectionEnabled(false)
        onStatus?.('Choose a sketch plane (Top/Front/Right or Face), then click Enter sketch.')
        return
      }
      if (commandId === 'dim_linear') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        setLinearDimStep('a')
        setPickSlot(null)
        onStatus?.('Linear dimension: pick first point, then second.')
        return
      }
      if (commandId === 'dim_aligned') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        setAlignedDimStep('a')
        setAlignedDimAId('')
        setPickSlot(null)
        onStatus?.('Aligned dimension: pick first point, then second.')
        return
      }
      if (commandId === 'dim_angular') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        setAngularDimStep('l1')
        setAngularDimL1(null)
        setPickSlot(null)
        onStatus?.('Angular dimension: pick first segment, then second.')
        return
      }
      if (commandId === 'dim_radial' || commandId === 'dim_diameter') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        setPickSlot(null)
        setDimEntityPickMode(true)
        onStatus?.(
          commandId === 'dim_radial'
            ? 'Radial dimension: click a circle or arc in the sketch (or use the dropdown).'
            : 'Diameter dimension: click a circle or arc in the sketch (or use the dropdown).'
        )
        return
      }
      if (commandId === 'sk_offset') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        queueMicrotask(() => {
          document.getElementById('design-sketch-offset-controls')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        onStatus?.('Offset: pick closed loop and Δ (mm), then press Offset loop.')
        return
      }
      if (commandId === 'sk_project') {
        setRibbonTab('sketch')
        setCanvasPhase('model')
        setFacePickMode(false)
        setProjectSketchDraftMm([])
        setProjectSketchMode(true)
        onStatus?.(
          'Project: click the solid to sample points (orthogonal to sketch plane). Commit (≥2 pts) adds an open polyline. Esc cancels.'
        )
        return
      }
      if (commandId === 'sk_pattern_sk') {
        setRibbonTab('sketch')
        setCanvasPhase('sketch')
        queueMicrotask(() => {
          document.getElementById('design-sketch-pattern-controls')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
        onStatus?.('Sketch pattern: linear (ΔX/ΔY) or circular (pivot, total°, start°), then Pattern.')
        return
      }
    },
    [onStatus, geometry]
  )
  useDesignCommandListener(applyCommandFromPalette)

  useEffect(() => {
    if (canvasPhase !== 'sketch') return
    setMeasureMode(false)
    setMeasurePts([])
    setSectionEnabled(false)
    setFacePickMode(false)
    setProjectSketchMode(false)
    setProjectSketchDraftMm([])
  }, [canvasPhase])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && projectSketchMode) {
        setProjectSketchMode(false)
        setProjectSketchDraftMm([])
        onStatus?.('Project cancelled.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projectSketchMode, onStatus])

  const onProjectSketchViewportPoint = useCallback(
    (p: THREE.Vector3) => {
      const { x, y } = worldPointToSketchMm(design.sketchPlane, p)
      setProjectSketchDraftMm((d) => {
        const next = [...d, { x, y }]
        onStatus?.(`Project: ${next.length} sample(s) — Commit (≥2) or Esc.`)
        return next
      })
    },
    [design.sketchPlane, onStatus]
  )

  const commitProjectSketch = useCallback(() => {
    if (projectSketchDraftMm.length < 2) {
      onStatus?.('Need at least 2 projected points.')
      return
    }
    const ids = projectSketchDraftMm.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    for (let i = 0; i < projectSketchDraftMm.length; i++) {
      nextPoints[ids[i]!] = { x: projectSketchDraftMm[i]!.x, y: projectSketchDraftMm[i]!.y }
    }
    const eid = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id: eid, kind: 'polyline', pointIds: ids, closed: false }]
    })
    setProjectSketchDraftMm([])
    setProjectSketchMode(false)
    setCanvasPhase('sketch')
    onStatus?.('Projected polyline added.')
  }, [design, onDesignChange, onStatus, projectSketchDraftMm])

  const setSketchDatum = useCallback(
    (datum: 'XY' | 'XZ' | 'YZ') => {
      setFacePickMode(false)
      dispatch({
        type: 'edit',
        design: { ...design, sketchPlane: { kind: 'datum', datum } }
      })
    },
    [design, dispatch]
  )

  const onPickSketchFace = useCallback(
    (pick: { origin: [number, number, number]; normal: [number, number, number]; xAxis: [number, number, number] }) => {
      setFacePickMode(false)
      dispatch({
        type: 'edit',
        design: { ...design, sketchPlane: { kind: 'face', origin: pick.origin, normal: pick.normal, xAxis: pick.xAxis } }
      })
      onStatus?.('Sketch plane set from picked face. Enter sketch to draw on 2D grid.')
    },
    [design, dispatch, onStatus]
  )

  const worldYExtents = useMemo(() => {
    if (!geometry) return { min: 0, max: 40 }
    return worldYRangeFromExtrudeMeshGeometry(geometry)
  }, [geometry])

  useEffect(() => {
    if (!geometry) return
    const { min, max } = worldYRangeFromExtrudeMeshGeometry(geometry)
    setSectionYMm((y) => {
      if (!Number.isFinite(y)) return (min + max) / 2
      return Math.min(max, Math.max(min, y))
    })
  }, [geometry])

  const onMeasureViewportPoint = useCallback(
    (p: Vector3) => {
      const v = { x: p.x, y: p.y, z: p.z }
      setMeasurePts((prev) => {
        if (prev.length >= 2) {
          onStatus?.('Measure: first point — Shift+click again.')
          return [v]
        }
        if (prev.length === 0) {
          onStatus?.('Measure: Shift+click second point on the solid.')
          return [v]
        }
        const d = Math.hypot(v.x - prev[0].x, v.y - prev[0].y, v.z - prev[0].z)
        onStatus?.(`Distance: ${d.toFixed(3)} mm (preview mesh; verify against kernel if needed).`)
        return [prev[0], v]
      })
    },
    [onStatus]
  )

  const closedPolyIds = useMemo(
    () =>
      design.entities
        .filter((e) => e.kind === 'polyline' && 'pointIds' in e && e.closed)
        .map((e) => e.id),
    [design.entities]
  )

  useEffect(() => {
    if (closedPolyIds.length === 0) return
    if (!closedPolyIds.includes(offsetPolyId)) {
      setOffsetPolyId(closedPolyIds[0]!)
    }
  }, [closedPolyIds, offsetPolyId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPickSlot(null)
      setEntityPickSlot(null)
      setLinearDimStep('off')
      setLinearDimAId('')
      setAlignedDimStep('off')
      setAlignedDimAId('')
      setAngularDimStep('off')
      setAngularDimL1(null)
      setDimEntityPickMode(false)
      setMeasureMode(false)
      setMeasurePts([])
      setSectionEnabled(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const applyConstraintPointPick = useCallback(
    (id: string) => {
      if (linearDimStep === 'a') {
        setLinearDimAId(id)
        setLinearDimStep('b')
        onStatus?.('Linear dimension: pick second point.')
        return
      }
      if (linearDimStep === 'b') {
        const did = crypto.randomUUID()
        onDesignChange({
          ...design,
          dimensions: [...(design.dimensions ?? []), { id: did, kind: 'linear', aId: linearDimAId, bId: id }]
        })
        setLinearDimStep('off')
        setLinearDimAId('')
        onStatus?.('Linear dimension added (annotation only).')
        return
      }
      if (alignedDimStep === 'a') {
        setAlignedDimAId(id)
        setAlignedDimStep('b')
        onStatus?.('Aligned dimension: pick second point.')
        return
      }
      if (alignedDimStep === 'b') {
        const did = crypto.randomUUID()
        onDesignChange({
          ...design,
          dimensions: [...(design.dimensions ?? []), { id: did, kind: 'aligned', aId: alignedDimAId, bId: id }]
        })
        setAlignedDimStep('off')
        setAlignedDimAId('')
        onStatus?.('Aligned dimension added (annotation only).')
        return
      }
      if (!pickSlot) return
      if (pickSlot === 'cA') setCA(id)
      else if (pickSlot === 'cB') setCB(id)
      else if (pickSlot === 'cC') setCC(id)
      else setCD(id)
      const slot = pickSlot
      setPickSlot(null)
      const pt = design.points[id]
      const where = pt ? ` (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)} mm)` : ''
      onStatus?.(`Constraint ${slot}: ${id.slice(0, 8)}…${where}`)
    },
    [
      pickSlot,
      onStatus,
      design.points,
      linearDimStep,
      linearDimAId,
      alignedDimStep,
      alignedDimAId,
      design,
      onDesignChange
    ]
  )

  const applyConstraintEntityPick = useCallback(
    (id: string) => {
      if (dimEntityPickMode) {
        setDimEntityId(id)
        setDimEntityPickMode(false)
        const ent = design.entities.find((e) => e.id === id)
        onStatus?.(`Dimension entity: ${id.slice(0, 8)}…${ent ? ` (${ent.kind})` : ''}`)
        return
      }
      if (!entityPickSlot) return
      if (entityPickSlot === 'cA') setCA(id)
      else setCB(id)
      const slot = entityPickSlot
      setEntityPickSlot(null)
      const ent = design.entities.find((e) => e.id === id)
      onStatus?.(`Constraint ${slot}: ${id.slice(0, 8)}…${ent ? ` (${ent.kind})` : ''}`)
    },
    [entityPickSlot, dimEntityPickMode, design.entities, onStatus]
  )

  const segmentPickActive =
    (cType === 'midpoint' && (pickSlot === 'cB' || pickSlot === 'cC')) ||
    (twoLineConstraint && (pickSlot === 'cA' || pickSlot === 'cC')) ||
    (cType === 'tangent' && pickSlot === 'cA')

  const applyConstraintSegmentPick = useCallback(
    (a: string, b: string) => {
      if (angularDimStep === 'l1') {
        setAngularDimL1({ a, b })
        setAngularDimStep('l2')
        onStatus?.('Angular dimension: pick second segment.')
        return
      }
      if (angularDimStep === 'l2') {
        if (!angularDimL1) {
          setAngularDimStep('l1')
          onStatus?.('Angular dimension reset: pick first segment.')
          return
        }
        const did = crypto.randomUUID()
        onDesignChange({
          ...design,
          dimensions: [
            ...(design.dimensions ?? []),
            { id: did, kind: 'angular', a1Id: angularDimL1.a, b1Id: angularDimL1.b, a2Id: a, b2Id: b }
          ]
        })
        setAngularDimStep('off')
        setAngularDimL1(null)
        onStatus?.('Angular dimension added (annotation only).')
        return
      }
      if (!pickSlot) return
      if (cType === 'tangent' && pickSlot === 'cA') {
        setCA(a)
        setCB(b)
        setPickSlot(null)
        onStatus?.(`Tangent line: pick arc start/end as point C (vertex).`)
        return
      }
      if (cType === 'midpoint' && (pickSlot === 'cB' || pickSlot === 'cC')) {
        setCB(a)
        setCC(b)
        setPickSlot(null)
        onStatus?.(`Midpoint segment: endpoints ${a.slice(0, 8)}… / ${b.slice(0, 8)}…`)
        return
      }
      if (twoLineConstraint && pickSlot === 'cA') {
        setCA(a)
        setCB(b)
        setPickSlot(null)
        onStatus?.(`Line 1: ${a.slice(0, 8)}… / ${b.slice(0, 8)}…`)
        return
      }
      if (twoLineConstraint && pickSlot === 'cC') {
        setCC(a)
        setCD(b)
        setPickSlot(null)
        onStatus?.(`Line 2: ${a.slice(0, 8)}… / ${b.slice(0, 8)}…`)
      }
    },
    [pickSlot, cType, twoLineConstraint, onStatus, angularDimStep, angularDimL1, design, onDesignChange]
  )

  const pickOutline = (slot: 'cA' | 'cB' | 'cC' | 'cD') =>
    pickSlot === slot ? ({ outline: '2px solid #a78bfa', outlineOffset: 1 } as const) : undefined

  const sketchWrapRef = useRef<HTMLDivElement>(null)
  const [sketchSize, setSketchSize] = useState({ w: 480, h: 360 })

  useLayoutEffect(() => {
    const el = sketchWrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSketchSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [canvasPhase])

  const pointIds = Object.keys(design.points)
  const parameterKeys = Object.keys(design.parameters)
  const radialDimEntityIds = useMemo(
    () =>
      design.entities.filter((e) => e.kind === 'circle' || e.kind === 'arc' || e.kind === 'ellipse').map((e) => e.id),
    [design.entities]
  )

  useEffect(() => {
    if (radialDimEntityIds.length === 0) return
    if (!radialDimEntityIds.includes(dimEntityId)) {
      setDimEntityId(radialDimEntityIds[0]!)
    }
  }, [radialDimEntityIds, dimEntityId])

  function nextParamSuffix(prefix: string): string {
    let max = 0
    const re = new RegExp(`^${prefix}(\\d+)$`)
    for (const k of parameterKeys) {
      const m = re.exec(k)
      if (m) max = Math.max(max, parseInt(m[1]!, 10))
    }
    return `${prefix}${max + 1}`
  }

  async function kernelBuildBrep(): Promise<void> {
    if (!projectDir) return
    await saveDesign()
    const s = await window.fab.settingsGet()
    const r = await window.fab.kernelBuildPart(projectDir, s.pythonPath ?? 'python')
    if (r.ok) {
      let parityMsg = ''
      if (geometry) {
        try {
          const mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial())
          mesh.updateMatrixWorld(true)
          const previewStlBase64 = meshToStlBase64(mesh)
          mesh.geometry.dispose()
          mesh.material.dispose()
          const p = await window.fab.comparePreviewKernelPlacement(projectDir, r.stlPath, previewStlBase64)
          if (p.ok) {
            parityMsg =
              p.parity === 'ok'
                ? ` Placement parity OK (${p.detail}).`
                : ` Placement parity mismatch (${p.detail}).`
          } else {
            parityMsg = ` Placement parity check unavailable (${p.error}${p.detail ? `: ${p.detail}` : ''}).`
          }
        } catch (e) {
          parityMsg = ` Placement parity check unavailable (${e instanceof Error ? e.message : String(e)}).`
        }
      }
      onStatus?.(`Kernel build OK — STEP + STL written.${parityMsg}`)
      onExportedStl?.(r.stlPath)
    } else {
      onStatus?.(formatKernelBuildStatus(r.error, r.detail))
    }
  }

  function polyPtCount(e: (typeof design.entities)[number]): number {
    if (e.kind !== 'polyline') return 0
    if ('pointIds' in e) return e.pointIds.length
    return e.points.length
  }

  if (!projectDir) {
    return (
      <div className="workspace-placeholder panel">
        <p className="msg">Open a project folder from Utilities → Project to edit the design.</p>
      </div>
    )
  }

  return (
    <div className="design-workspace design-workspace--shell">
      <div className="design-ribbon design-ribbon-fusion">
        <div className="design-ribbon-chrome">
          <div className="design-workspace-pill">Design</div>
          <nav className="design-ribbon-tabs" role="tablist" aria-label="Design ribbon">
            {DESIGN_RIBBON_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={ribbonTab === t.id}
                className={`design-ribbon-tab${ribbonTab === t.id ? ' design-ribbon-tab--active' : ''}`}
                onClick={() => setRibbonTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="design-ribbon-toolbar">
          {ribbonTab === 'solid' && (
            <div className="ribbon-toolbar-strip">
              <RibbonFusionGroup label="Edit sketch">
                <div className="ribbon-row ribbon-row--fusion">
                  <RibbonIconButton
                    icon={<IconUndo />}
                    label="Undo"
                    disabled={pastLength === 0}
                    onClick={undo}
                  />
                  <RibbonIconButton icon={<IconMirror />} label="Mirror X" onClick={mirrorX} />
                  <RibbonIconButton
                    icon={<IconPattern />}
                    label="Pat +40"
                    title="Pattern +40 mm on X"
                    onClick={pattern40X}
                  />
                </div>
              </RibbonFusionGroup>
              <RibbonFusionGroup label="Solid body">
                <div className="ribbon-row ribbon-row--fusion ribbon-row--align-end">
                  <label className="ribbon-field ribbon-field--mode">
                    <span className="ribbon-field__lab">Mode</span>
                    <select
                      className="ribbon-select"
                      value={design.solidKind}
                      onChange={(e) =>
                        dispatch({
                          type: 'edit',
                          design: { ...design, solidKind: e.target.value as typeof design.solidKind }
                        })
                      }
                    >
                      <option value="extrude">Extrude</option>
                      <option value="revolve">Revolve</option>
                      <option value="loft">Loft</option>
                    </select>
                  </label>
            {design.solidKind === 'extrude' ? (
              <label>
                Depth (mm)
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={design.extrudeDepthMm}
                  onChange={(e) =>
                    dispatch({
                      type: 'edit',
                      design: { ...design, extrudeDepthMm: Math.max(0.1, Number(e.target.value) || 0.1) }
                    })
                  }
                />
              </label>
            ) : design.solidKind === 'revolve' ? (
              <>
                <label>
                  Angle (deg)
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={design.revolve.angleDeg}
                    onChange={(e) =>
                      dispatch({
                        type: 'edit',
                        design: {
                          ...design,
                          revolve: {
                            ...design.revolve,
                            angleDeg: Math.min(360, Math.max(1, Number(e.target.value) || 360))
                          }
                        }
                      })
                    }
                  />
                </label>
                <label>
                  Axis X
                  <input
                    type="number"
                    step={1}
                    value={design.revolve.axisX}
                    onChange={(e) =>
                      dispatch({
                        type: 'edit',
                        design: {
                          ...design,
                          revolve: { ...design.revolve, axisX: Number(e.target.value) || 0 }
                        }
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <label
                title="Uniform +Z spacing between each consecutive closed profile (sketch entity order); kernel uses up to 16 profiles"
              >
                Loft step (mm)
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={design.loftSeparationMm}
                  onChange={(e) =>
                    dispatch({
                      type: 'edit',
                      design: { ...design, loftSeparationMm: Math.max(0.1, Number(e.target.value) || 0.1) }
                    })
                  }
                />
              </label>
            )}
                </div>
              </RibbonFusionGroup>
              <RibbonFusionGroup label="Output">
                <div className="ribbon-row ribbon-row--fusion">
                  <RibbonIconButton
                    icon={<IconSave />}
                    label="Save"
                    title="Save design + features"
                    onClick={() => void saveDesign()}
                  />
                  <RibbonIconButton
                    icon={<IconExport />}
                    label="STL"
                    title="Export STL preview mesh"
                    disabled={!geometry}
                    onClick={() => void exportStl()}
                  />
                  <RibbonIconButton
                    icon={<IconKernel />}
                    label="STEP"
                    title="Build STEP (kernel) — Python + cadquery"
                    onClick={() => void kernelBuildBrep()}
                  />
                </div>
              </RibbonFusionGroup>
            </div>
          )}

          {ribbonTab === 'modify' && (
            <div className="ribbon-toolbar-strip">
              <RibbonFusionGroup label={`Post-solid · ${kernelOpActiveCount} / ${kernelOpTotal} active`}>
                <div className="ribbon-row ribbon-row--fusion ribbon-row--wrap">
            <label>
              Fillet R
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelFilletMm}
                onChange={(e) => setKernelFilletMm(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void appendKernelOp({ kind: 'fillet_all', radiusMm: kernelFilletMm } satisfies KernelPostSolidOp)
              }
            >
              + fillet all
            </button>
            <label>
              Dir
              <select
                value={kernelEdgeDirection}
                onChange={(e) => setKernelEdgeDirection(e.target.value as '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z')}
              >
                <option value="+X">+X</option>
                <option value="-X">-X</option>
                <option value="+Y">+Y</option>
                <option value="-Y">-Y</option>
                <option value="+Z">+Z</option>
                <option value="-Z">-Z</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              title="Directional edge selection by world axis normal"
              onClick={() =>
                void appendKernelOp({
                  kind: 'fillet_select',
                  radiusMm: kernelFilletMm,
                  edgeDirection: kernelEdgeDirection
                } satisfies KernelPostSolidOp)
              }
            >
              + fillet dir
            </button>
            <label>
              Chamfer
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelChamferMm}
                onChange={(e) => setKernelChamferMm(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void appendKernelOp({ kind: 'chamfer_all', lengthMm: kernelChamferMm } satisfies KernelPostSolidOp)
              }
            >
              + chamfer all
            </button>
            <button
              type="button"
              className="secondary"
              title="Directional edge selection by world axis normal"
              onClick={() =>
                void appendKernelOp({
                  kind: 'chamfer_select',
                  lengthMm: kernelChamferMm,
                  edgeDirection: kernelEdgeDirection
                } satisfies KernelPostSolidOp)
              }
            >
              + chamfer dir
            </button>
            <label>
              Shell t
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelShellMm}
                onChange={(e) => setKernelShellMm(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <label>
              Open
              <select
                value={kernelShellOpenDirection}
                onChange={(e) =>
                  setKernelShellOpenDirection(e.target.value as typeof kernelShellOpenDirection)
                }
                title="Which planar cap to remove first; kernel tries the opposite cap if OCC rejects"
              >
                <option value="+Z">+Z (default extrude top)</option>
                <option value="-Z">−Z</option>
                <option value="+X">+X</option>
                <option value="-X">−X</option>
                <option value="+Y">+Y</option>
                <option value="-Y">−Y</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              title="Shell inward after opening the selected cap; falls back to opposite cap if OCC rejects"
              onClick={() =>
                void appendKernelOp(
                  kernelShellOpenDirection === '+Z'
                    ? ({ kind: 'shell_inward', thicknessMm: kernelShellMm } satisfies KernelPostSolidOp)
                    : ({
                        kind: 'shell_inward',
                        thicknessMm: kernelShellMm,
                        openDirection: kernelShellOpenDirection
                      } satisfies KernelPostSolidOp)
                )
              }
            >
              + shell
            </button>
            <label>
              Pat X×Y
              <input
                type="number"
                min={1}
                max={32}
                value={kernelPatX}
                onChange={(e) => setKernelPatX(Math.min(32, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
              />
              <input
                type="number"
                min={1}
                max={32}
                value={kernelPatY}
                onChange={(e) => setKernelPatY(Math.min(32, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
              />
            </label>
            <label>
              ΔX / ΔY
              <input
                type="number"
                step={1}
                value={kernelPatDx}
                onChange={(e) => setKernelPatDx(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelPatDy}
                onChange={(e) => setKernelPatDy(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Rectangular body pattern (XY union); saved in part/features.json → payload v3"
              onClick={() => {
                const cx = kernelPatX
                const cy = kernelPatY
                if (cx <= 1 && cy <= 1) {
                  onStatus?.('Pattern needs count X or Y > 1')
                  return
                }
                void appendKernelOp({
                  kind: 'pattern_rectangular',
                  countX: cx,
                  countY: cy,
                  spacingXMm: kernelPatDx,
                  spacingYMm: kernelPatDy
                } satisfies KernelPostSolidOp)
              }}
            >
              + pattern
            </button>
            <label title="Circular pattern: copies rotated around +Z through pivot (mm)">
              Circ N
              <input
                type="number"
                min={2}
                max={32}
                value={kernelPatCircN}
                onChange={(e) =>
                  setKernelPatCircN(Math.min(32, Math.max(2, Math.floor(Number(e.target.value) || 2))))
                }
              />
            </label>
            <label>
              pivot X/Y
              <input
                type="number"
                step={1}
                value={kernelPatCircCx}
                onChange={(e) => setKernelPatCircCx(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelPatCircCy}
                onChange={(e) => setKernelPatCircCy(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Total° / Start°
              <input
                type="number"
                min={1}
                max={360}
                value={kernelPatCircTotalDeg}
                onChange={(e) =>
                  setKernelPatCircTotalDeg(Math.min(360, Math.max(1, Number(e.target.value) || 360)))
                }
              />
              <input
                type="number"
                min={0}
                max={360}
                value={kernelPatCircStartDeg}
                onChange={(e) =>
                  setKernelPatCircStartDeg(Math.min(360, Math.max(0, Number(e.target.value) || 0)))
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Rotates copies around +Z through pivot; part/features.json → payload v3"
              onClick={() => {
                void appendKernelOp({
                  kind: 'pattern_circular',
                  count: kernelPatCircN,
                  centerXMm: kernelPatCircCx,
                  centerYMm: kernelPatCircCy,
                  totalAngleDeg: kernelPatCircTotalDeg,
                  startAngleDeg: kernelPatCircStartDeg
                } satisfies KernelPostSolidOp)
              }}
            >
              + circ pattern
            </button>
            <label title="Linear 3D body pattern: union translated copies along (dx,dy,dz)">
              Lin3D n
              <input
                type="number"
                min={2}
                max={32}
                value={kernelLin3dN}
                onChange={(e) =>
                  setKernelLin3dN(Math.min(32, Math.max(2, Math.floor(Number(e.target.value) || 2))))
                }
              />
            </label>
            <label>
              ΔX/Y/Z
              <input
                type="number"
                step={1}
                value={kernelLin3dDx}
                onChange={(e) => setKernelLin3dDx(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelLin3dDy}
                onChange={(e) => setKernelLin3dDy(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelLin3dDz}
                onChange={(e) => setKernelLin3dDz(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Union copies translated by (dx,dy,dz) per step; payload v3"
              onClick={() => {
                if (kernelLin3dDx === 0 && kernelLin3dDy === 0 && kernelLin3dDz === 0) {
                  onStatus?.('Linear 3D pattern needs a non-zero ΔX, ΔY, or ΔZ')
                  return
                }
                void appendKernelOp({
                  kind: 'pattern_linear_3d',
                  count: kernelLin3dN,
                  dxMm: kernelLin3dDx,
                  dyMm: kernelLin3dDy,
                  dzMm: kernelLin3dDz
                } satisfies KernelPostSolidOp)
              }}
            >
              + lin 3D
            </button>
            <label title="Path pattern on a sketch polyline (instances sampled along path length)">
              Path n
              <input
                type="number"
                min={2}
                max={32}
                value={kernelPathPatternCount}
                onChange={(e) =>
                  setKernelPathPatternCount(Math.min(32, Math.max(2, Math.floor(Number(e.target.value) || 2))))
                }
              />
            </label>
            <label>
              Path entity
              <select
                value={kernelPathPatternEntityId}
                onChange={(e) => setKernelPathPatternEntityId(e.target.value)}
                disabled={polylineEntityIds.length === 0}
              >
                {polylineEntityIds.length === 0 ? (
                  <option value="">(no polyline)</option>
                ) : (
                  polylineEntityIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              title="Pattern body along a sketch polyline path (payload v3)"
              onClick={() => {
                const ent = design.entities.find((e) => e.id === kernelPathPatternEntityId)
                if (!ent || ent.kind !== 'polyline') {
                  onStatus?.('Path pattern requires a polyline entity')
                  return
                }
                const pathPointsRaw: [number, number][] =
                  'pointIds' in ent
                    ? ent.pointIds
                        .map((pid) => {
                          const p = design.points[pid]
                          return p ? ([p.x, p.y] as [number, number]) : null
                        })
                        .filter((p): p is [number, number] => p !== null)
                    : ent.points.map(([x, y]) => [x, y] as [number, number])
                if (pathPointsRaw.length < 2) {
                  onStatus?.('Path pattern needs at least 2 valid points on selected polyline')
                  return
                }
                const pathPoints: [number, number][] = []
                for (const p of pathPointsRaw) {
                  const prev = pathPoints[pathPoints.length - 1]
                  if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) pathPoints.push(p)
                }
                if (pathPoints.length < 2) {
                  onStatus?.('Path pattern path collapsed to zero-length')
                  return
                }
                void appendKernelOp({
                  kind: 'pattern_path',
                  count: kernelPathPatternCount,
                  pathPoints
                } satisfies KernelPostSolidOp)
              }}
            >
              + path pattern
            </button>
            <label title="Mirror plane: YZ flips X about pivot; XZ flips Y; XY flips Z">
              Mir plane
              <select
                value={kernelMirrorPlane}
                onChange={(e) => setKernelMirrorPlane(e.target.value as 'YZ' | 'XZ' | 'XY')}
              >
                <option value="YZ">YZ (pivot X)</option>
                <option value="XZ">XZ (pivot Y)</option>
                <option value="XY">XY (pivot Z)</option>
              </select>
            </label>
            <label>
              Pivot mm
              <input
                type="number"
                step={1}
                value={kernelMirrorPivotMm}
                onChange={(e) => setKernelMirrorPivotMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Union body with mirror across plane through pivot on the normal axis"
              onClick={() => {
                const p = kernelMirrorPivotMm
                const op: KernelPostSolidOp =
                  kernelMirrorPlane === 'YZ'
                    ? {
                        kind: 'mirror_union_plane',
                        plane: 'YZ',
                        originXMm: p,
                        originYMm: 0,
                        originZMm: 0
                      }
                    : kernelMirrorPlane === 'XZ'
                      ? {
                          kind: 'mirror_union_plane',
                          plane: 'XZ',
                          originXMm: 0,
                          originYMm: p,
                          originZMm: 0
                        }
                      : {
                          kind: 'mirror_union_plane',
                          plane: 'XY',
                          originXMm: 0,
                          originYMm: 0,
                          originZMm: p
                        }
                void appendKernelOp(op)
              }}
            >
              + mirror ∪
            </button>
            <label title="Keep only volume inside AABB (world mm)">
              ∩ box min/max
              <input
                type="number"
                step={1}
                value={kernelIxMin}
                onChange={(e) => setKernelIxMin(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelIxMax}
                onChange={(e) => setKernelIxMax(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Y/Z
              <input
                type="number"
                step={1}
                value={kernelIyMin}
                onChange={(e) => setKernelIyMin(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelIyMax}
                onChange={(e) => setKernelIyMax(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelIzMin}
                onChange={(e) => setKernelIzMin(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelIzMax}
                onChange={(e) => setKernelIzMax(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Intersect body with axis-aligned box; payload v3"
              onClick={() => {
                if (kernelIxMax <= kernelIxMin || kernelIyMax <= kernelIyMin || kernelIzMax <= kernelIzMin) {
                  onStatus?.('Intersect box needs min < max on each axis')
                  return
                }
                void appendKernelOp({
                  kind: 'boolean_intersect_box',
                  xMinMm: kernelIxMin,
                  xMaxMm: kernelIxMax,
                  yMinMm: kernelIyMin,
                  yMaxMm: kernelIyMax,
                  zMinMm: kernelIzMin,
                  zMaxMm: kernelIzMax
                } satisfies KernelPostSolidOp)
              }}
            >
              + ∩ box
            </button>
            <label title="Combine mode using a second body built from one sketch profile">
              Combine
              <select
                value={kernelCombineMode}
                onChange={(e) => setKernelCombineMode(e.target.value as 'union' | 'subtract' | 'intersect')}
              >
                <option value="subtract">subtract</option>
                <option value="union">union</option>
                <option value="intersect">intersect</option>
              </select>
            </label>
            <label title="Index into extracted closed profiles (0-based)">
              Profile idx
              <input
                type="number"
                min={0}
                step={1}
                value={kernelCombineProfileIndex}
                onChange={(e) => setKernelCombineProfileIndex(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </label>
            <label>
              Depth / z0
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={kernelCombineDepthMm}
                onChange={(e) => setKernelCombineDepthMm(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                step={0.5}
                value={kernelCombineZStartMm}
                onChange={(e) => setKernelCombineZStartMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Boolean combine using extruded sketch profile (second body reference)"
              onClick={() => {
                void appendKernelOp({
                  kind: 'boolean_combine_profile',
                  mode: kernelCombineMode,
                  profileIndex: kernelCombineProfileIndex,
                  extrudeDepthMm: kernelCombineDepthMm,
                  zStartMm: kernelCombineZStartMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + combine profile
            </button>
            <label title="Split by axis plane and keep one side">
              Split axis
              <select value={kernelSplitAxis} onChange={(e) => setKernelSplitAxis(e.target.value as 'X' | 'Y' | 'Z')}>
                <option value="X">X</option>
                <option value="Y">Y</option>
                <option value="Z">Z</option>
              </select>
            </label>
            <label>
              offset / keep
              <input
                type="number"
                step={0.5}
                value={kernelSplitOffsetMm}
                onChange={(e) => setKernelSplitOffsetMm(Number(e.target.value) || 0)}
              />
              <select
                value={kernelSplitKeep}
                onChange={(e) => setKernelSplitKeep(e.target.value as 'positive' | 'negative')}
              >
                <option value="positive">positive</option>
                <option value="negative">negative</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              title="Intersect with axis-aligned half-space"
              onClick={() => {
                void appendKernelOp({
                  kind: 'split_keep_halfspace',
                  axis: kernelSplitAxis,
                  offsetMm: kernelSplitOffsetMm,
                  keep: kernelSplitKeep
                } satisfies KernelPostSolidOp)
              }}
            >
              + split keep
            </button>
            <label title="Hole profile index from extracted closed profiles">
              Hole profile
              <input
                type="number"
                min={0}
                step={1}
                value={kernelHoleProfileIndex}
                onChange={(e) => setKernelHoleProfileIndex(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </label>
            <label>
              mode
              <select value={kernelHoleMode} onChange={(e) => setKernelHoleMode(e.target.value as 'depth' | 'through_all')}>
                <option value="depth">depth</option>
                <option value="through_all">through_all</option>
              </select>
            </label>
            <label>
              depth / z0
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={kernelHoleDepthMm}
                onChange={(e) => setKernelHoleDepthMm(Math.max(0.1, Number(e.target.value) || 0.1))}
                disabled={kernelHoleMode !== 'depth'}
              />
              <input
                type="number"
                step={0.5}
                value={kernelHoleZStartMm}
                onChange={(e) => setKernelHoleZStartMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Cut hole from referenced profile index"
              onClick={() => {
                void appendKernelOp({
                  kind: 'hole_from_profile',
                  profileIndex: kernelHoleProfileIndex,
                  mode: kernelHoleMode,
                  depthMm: kernelHoleMode === 'depth' ? kernelHoleDepthMm : undefined,
                  zStartMm: kernelHoleZStartMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + hole
            </button>
            <label title="Cosmetic thread axis center X/Y">
              Thread X/Y
              <input type="number" step={0.5} value={kernelThreadCx} onChange={(e) => setKernelThreadCx(Number(e.target.value) || 0)} />
              <input type="number" step={0.5} value={kernelThreadCy} onChange={(e) => setKernelThreadCy(Number(e.target.value) || 0)} />
            </label>
            <label>
              R / pitch
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelThreadR}
                onChange={(e) => setKernelThreadR(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelThreadPitch}
                onChange={(e) => setKernelThreadPitch(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <label>
              L / depth / z0
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelThreadLen}
                onChange={(e) => setKernelThreadLen(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.05}
                step={0.05}
                value={kernelThreadDepth}
                onChange={(e) => setKernelThreadDepth(Math.max(0.05, Number(e.target.value) || 0.05))}
              />
              <input type="number" step={0.5} value={kernelThreadZ0} onChange={(e) => setKernelThreadZ0(Number(e.target.value) || 0)} />
            </label>
            <button
              type="button"
              className="secondary"
              title="Simplified cosmetic rings (not true helical thread)"
              onClick={() => {
                void appendKernelOp({
                  kind: 'thread_cosmetic',
                  centerXMm: kernelThreadCx,
                  centerYMm: kernelThreadCy,
                  majorRadiusMm: kernelThreadR,
                  pitchMm: kernelThreadPitch,
                  lengthMm: kernelThreadLen,
                  depthMm: kernelThreadDepth,
                  zStartMm: kernelThreadZ0
                } satisfies KernelPostSolidOp)
              }}
            >
              + thread cosmetic
            </button>
            <label title="Move/copy translation in mm">
              Move ΔX/Y/Z
              <input type="number" step={1} value={kernelMoveDx} onChange={(e) => setKernelMoveDx(Number(e.target.value) || 0)} />
              <input type="number" step={1} value={kernelMoveDy} onChange={(e) => setKernelMoveDy(Number(e.target.value) || 0)} />
              <input type="number" step={1} value={kernelMoveDz} onChange={(e) => setKernelMoveDz(Number(e.target.value) || 0)} />
            </label>
            <label>
              Keep original
              <input
                type="checkbox"
                checked={kernelMoveKeepOriginal}
                onChange={(e) => setKernelMoveKeepOriginal(e.target.checked)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Move body by translation; keep original to copy+union"
              onClick={() =>
                void appendKernelOp({
                  kind: 'transform_translate',
                  dxMm: kernelMoveDx,
                  dyMm: kernelMoveDy,
                  dzMm: kernelMoveDz,
                  keepOriginal: kernelMoveKeepOriginal
                } satisfies KernelPostSolidOp)
              }
            >
              + move/copy
            </button>
            <label title="Press/Pull profile index from extracted closed profiles">
              Press/Pull profile
              <input
                type="number"
                min={0}
                step={1}
                value={kernelPressPullProfileIndex}
                onChange={(e) => setKernelPressPullProfileIndex(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </label>
            <label>
              Δ / z0
              <input
                type="number"
                step={0.5}
                value={kernelPressPullDeltaMm}
                onChange={(e) => setKernelPressPullDeltaMm(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={0.5}
                value={kernelPressPullZStartMm}
                onChange={(e) => setKernelPressPullZStartMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Signed profile extrude: + union, - cut"
              onClick={() => {
                if (kernelPressPullDeltaMm === 0) {
                  onStatus?.('Press/Pull requires non-zero Δ')
                  return
                }
                void appendKernelOp({
                  kind: 'press_pull_profile',
                  profileIndex: kernelPressPullProfileIndex,
                  deltaMm: kernelPressPullDeltaMm,
                  zStartMm: kernelPressPullZStartMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + press/pull
            </button>
            <label title="Sweep profile index from extracted closed profiles">
              Sweep profile
              <input
                type="number"
                min={0}
                step={1}
                value={kernelSweepProfileIndex}
                onChange={(e) => setKernelSweepProfileIndex(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </label>
            <label>
              Sweep path
              <select
                value={kernelSweepPathEntityId}
                onChange={(e) => setKernelSweepPathEntityId(e.target.value)}
                disabled={polylineEntityIds.length === 0}
              >
                {polylineEntityIds.length === 0 ? (
                  <option value="">(no polyline)</option>
                ) : (
                  polylineEntityIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              z0
              <input
                type="number"
                step={0.5}
                value={kernelSweepZStartMm}
                onChange={(e) => setKernelSweepZStartMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Partial sweep: profile extruded segment-by-segment along path"
              onClick={() => {
                const ent = design.entities.find((e) => e.id === kernelSweepPathEntityId)
                if (!ent || ent.kind !== 'polyline') {
                  onStatus?.('Sweep requires a polyline path entity')
                  return
                }
                const pathPointsRaw: [number, number][] =
                  'pointIds' in ent
                    ? ent.pointIds
                        .map((pid) => {
                          const p = design.points[pid]
                          return p ? ([p.x, p.y] as [number, number]) : null
                        })
                        .filter((p): p is [number, number] => p !== null)
                    : ent.points.map(([x, y]) => [x, y] as [number, number])
                if (pathPointsRaw.length < 2) {
                  onStatus?.('Sweep path needs at least 2 valid points')
                  return
                }
                const pathPoints: [number, number][] = []
                for (const p of pathPointsRaw) {
                  const prev = pathPoints[pathPoints.length - 1]
                  if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) pathPoints.push(p)
                }
                if (pathPoints.length < 2) {
                  onStatus?.('Sweep path collapsed to zero-length')
                  return
                }
                void appendKernelOp({
                  kind: 'sweep_profile_path',
                  profileIndex: kernelSweepProfileIndex,
                  pathPoints,
                  zStartMm: kernelSweepZStartMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + sweep
            </button>
            <label title="Pipe path polyline">
              Pipe path
              <select
                value={kernelPipePathEntityId}
                onChange={(e) => setKernelPipePathEntityId(e.target.value)}
                disabled={polylineEntityIds.length === 0}
              >
                {polylineEntityIds.length === 0 ? (
                  <option value="">(no polyline)</option>
                ) : (
                  polylineEntityIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              R / wall
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelPipeOuterRadiusMm}
                onChange={(e) => setKernelPipeOuterRadiusMm(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.05}
                step={0.05}
                value={kernelPipeWallThicknessMm}
                onChange={(e) => setKernelPipeWallThicknessMm(Math.max(0.05, Number(e.target.value) || 0.05))}
                disabled={!kernelPipeUseWall}
              />
            </label>
            <label>
              Hollow / z0
              <input
                type="checkbox"
                checked={kernelPipeUseWall}
                onChange={(e) => setKernelPipeUseWall(e.target.checked)}
              />
              <input
                type="number"
                step={0.5}
                value={kernelPipeZStartMm}
                onChange={(e) => setKernelPipeZStartMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Partial pipe: circular section swept segment-wise along path"
              onClick={() => {
                const ent = design.entities.find((e) => e.id === kernelPipePathEntityId)
                if (!ent || ent.kind !== 'polyline') {
                  onStatus?.('Pipe requires a polyline path entity')
                  return
                }
                const pathPointsRaw: [number, number][] =
                  'pointIds' in ent
                    ? ent.pointIds
                        .map((pid) => {
                          const p = design.points[pid]
                          return p ? ([p.x, p.y] as [number, number]) : null
                        })
                        .filter((p): p is [number, number] => p !== null)
                    : ent.points.map(([x, y]) => [x, y] as [number, number])
                if (pathPointsRaw.length < 2) {
                  onStatus?.('Pipe path needs at least 2 valid points')
                  return
                }
                const pathPoints: [number, number][] = []
                for (const p of pathPointsRaw) {
                  const prev = pathPoints[pathPoints.length - 1]
                  if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) pathPoints.push(p)
                }
                if (pathPoints.length < 2) {
                  onStatus?.('Pipe path collapsed to zero-length')
                  return
                }
                if (kernelPipeUseWall && kernelPipeWallThicknessMm >= kernelPipeOuterRadiusMm) {
                  onStatus?.('Pipe wall must be less than outer radius')
                  return
                }
                void appendKernelOp({
                  kind: 'pipe_path',
                  pathPoints,
                  outerRadiusMm: kernelPipeOuterRadiusMm,
                  wallThicknessMm: kernelPipeUseWall ? kernelPipeWallThicknessMm : undefined,
                  zStartMm: kernelPipeZStartMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + pipe
            </button>
            <label title="Partial thicken surrogate using isotropic scale about body center">
              Thicken Δ
              <input
                type="number"
                step={0.5}
                value={kernelThickenDeltaMm}
                onChange={(e) => setKernelThickenDeltaMm(Number(e.target.value) || 0)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Scale-based surrogate; not true face offset"
              onClick={() => {
                if (kernelThickenDeltaMm === 0) {
                  onStatus?.('Thicken requires non-zero Δ')
                  return
                }
                void appendKernelOp({
                  kind: 'thicken_scale',
                  deltaMm: kernelThickenDeltaMm
                } satisfies KernelPostSolidOp)
              }}
            >
              + thicken
            </button>
            <label title="Coil center X/Y">
              Coil X/Y
              <input type="number" step={0.5} value={kernelCoilCx} onChange={(e) => setKernelCoilCx(Number(e.target.value) || 0)} />
              <input type="number" step={0.5} value={kernelCoilCy} onChange={(e) => setKernelCoilCy(Number(e.target.value) || 0)} />
            </label>
            <label>
              R / pitch / turns
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelCoilRadius}
                onChange={(e) => setKernelCoilRadius(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelCoilPitch}
                onChange={(e) => setKernelCoilPitch(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={kernelCoilTurns}
                onChange={(e) => setKernelCoilTurns(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <label>
              depth / z0
              <input
                type="number"
                min={0.05}
                step={0.05}
                value={kernelCoilDepth}
                onChange={(e) => setKernelCoilDepth(Math.max(0.05, Number(e.target.value) || 0.05))}
              />
              <input type="number" step={0.5} value={kernelCoilZ0} onChange={(e) => setKernelCoilZ0(Number(e.target.value) || 0)} />
            </label>
            <button
              type="button"
              className="secondary"
              title="Partial coil cut surrogate (stacked ring cuts with slight phase shift)"
              onClick={() =>
                void appendKernelOp({
                  kind: 'coil_cut',
                  centerXMm: kernelCoilCx,
                  centerYMm: kernelCoilCy,
                  majorRadiusMm: kernelCoilRadius,
                  pitchMm: kernelCoilPitch,
                  turns: kernelCoilTurns,
                  depthMm: kernelCoilDepth,
                  zStartMm: kernelCoilZ0
                } satisfies KernelPostSolidOp)
              }
            >
              + coil cut
            </button>
            <span className="ribbon-kernel-ops" title="Sheet-style tab boss on +Z (after base solid)">
              Sheet tab
            </span>
            <label>
              XY center
              <input
                type="number"
                step={1}
                value={kernelTabCx}
                onChange={(e) => setKernelTabCx(Number(e.target.value) || 0)}
              />
              <input
                type="number"
                step={1}
                value={kernelTabCy}
                onChange={(e) => setKernelTabCy(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              z base
              <input
                type="number"
                step={0.5}
                value={kernelTabZBase}
                onChange={(e) => setKernelTabZBase(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              L×W×H
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={kernelTabLen}
                onChange={(e) => setKernelTabLen(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={kernelTabWid}
                onChange={(e) => setKernelTabWid(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={kernelTabHt}
                onChange={(e) => setKernelTabHt(Math.max(0.1, Number(e.target.value) || 0.1))}
              />
            </label>
            <button
              type="button"
              className="secondary"
              title="Union axis-aligned tab (kernel sheet_tab_union); payload v3"
              onClick={() =>
                void appendKernelOp({
                  kind: 'sheet_tab_union',
                  centerXMm: kernelTabCx,
                  centerYMm: kernelTabCy,
                  zBaseMm: kernelTabZBase,
                  lengthMm: kernelTabLen,
                  widthMm: kernelTabWid,
                  heightMm: kernelTabHt
                } satisfies KernelPostSolidOp)
              }
            >
              + sheet tab
            </button>
                </div>
              </RibbonFusionGroup>
            </div>
          )}

        {ribbonTab === 'sketch' && canvasPhase === 'model' && (
          <div className="ribbon-group ribbon-group--in-tab">
            <span className="ribbon-group-label">Sketch plane</span>
            <div className="ribbon-row ribbon-row--fusion ribbon-row--wrap">
              <button
                type="button"
                className={design.sketchPlane.kind === 'datum' && design.sketchPlane.datum === 'XY' ? 'primary' : 'secondary'}
                onClick={() => setSketchDatum('XY')}
              >
                Top (XY)
              </button>
              <button
                type="button"
                className={design.sketchPlane.kind === 'datum' && design.sketchPlane.datum === 'XZ' ? 'primary' : 'secondary'}
                onClick={() => setSketchDatum('XZ')}
              >
                Front (XZ)
              </button>
              <button
                type="button"
                className={design.sketchPlane.kind === 'datum' && design.sketchPlane.datum === 'YZ' ? 'primary' : 'secondary'}
                onClick={() => setSketchDatum('YZ')}
              >
                Right (YZ)
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setFacePickMode(false)
                  setCanvasPhase('sketch')
                }}
              >
                Enter sketch
              </button>
              <button
                type="button"
                className={facePickMode ? 'primary' : 'secondary'}
                disabled={!geometry}
                title={
                  geometry
                    ? 'Click a face in the 3D view to set sketch plane.'
                    : 'Need 3D geometry first (extrude/revolve/loft) before face pick.'
                }
                onClick={() => {
                  setCanvasPhase('model')
                  setFacePickMode((v) => !v)
                  setMeasureMode(false)
                  setSectionEnabled(false)
                  onStatus?.('Face pick mode: click a model face in 3D view.')
                }}
              >
                Face…
              </button>
            </div>
            <p className="msg sketch-plane-hint">
              Kernel and preview still use the XY sketch as today; face/datum choice is captured in `design/sketch.json`.
            </p>
          </div>
        )}

        {ribbonTab === 'sketch' && canvasPhase === 'sketch' && (
        <div className="ribbon-group ribbon-group--in-tab">
          <span className="ribbon-group-label">Sketch</span>
          <div className="ribbon-row ribbon-row--fusion ribbon-row--wrap sketch-session-row">
            <span className="sketch-session-label">{sketchDatumLabel(design.sketchPlane)}</span>
            <button type="button" className="secondary" onClick={() => setCanvasPhase('model')}>
              Finish sketch
            </button>
          </div>
          <div className="ribbon-row ribbon-row--fusion ribbon-row--wrap">
            <RibbonIconButton
              icon={<IconRect />}
              label="Rect"
              active={tool === 'rect'}
              commandId="sk_rect"
              onClick={() => setTool('rect')}
            />
            <RibbonIconButton
              icon={<IconRect />}
              label="Rect 3"
              active={tool === 'rect_3pt'}
              commandId="sk_rect_3pt"
              onClick={() => setTool('rect_3pt')}
              title="Rectangle: first edge, then height (oriented rect)"
            />
            <RibbonIconButton
              icon={<IconSlot />}
              label="Slot"
              active={tool === 'slot_center'}
              commandId="sk_slot_center"
              onClick={() => setTool('slot_center')}
              title="Rounded slot: two center picks (cap centers), then width"
            />
            <RibbonIconButton
              icon={<IconSlotOverall />}
              label="Slot L"
              active={tool === 'slot_overall'}
              commandId="sk_slot_overall"
              onClick={() => setTool('slot_overall')}
              title="Slot by overall tip-to-tip length, then width (same slot entity)"
            />
            <RibbonIconButton
              icon={<IconCircle />}
              label="Circle"
              active={tool === 'circle'}
              commandId="sk_circle_center"
              onClick={() => setTool('circle')}
            />
            <RibbonIconButton
              icon={<IconCircle />}
              label="Circ ∅"
              active={tool === 'circle_2pt'}
              commandId="sk_circle_2pt"
              onClick={() => setTool('circle_2pt')}
              title="Circle by two diameter points"
            />
            <RibbonIconButton
              icon={<IconCircle />}
              label="Circ 3"
              active={tool === 'circle_3pt'}
              commandId="sk_circle_3pt"
              onClick={() => setTool('circle_3pt')}
              title="Circle through three points (circumcircle)"
            />
            <RibbonIconButton
              icon={<IconLoft />}
              label="Ellipse"
              active={tool === 'ellipse'}
              commandId="sk_ellipse"
              onClick={() => setTool('ellipse')}
              title="Ellipse: center → major axis end → minor extent"
            />
            <RibbonIconButton
              icon={<IconPolyline />}
              label="Spl fit"
              active={tool === 'spline_fit'}
              commandId="sk_spline_fit"
              onClick={() => setTool('spline_fit')}
              title="Spline through points (Catmull–Rom); Close loop or Finish open"
            />
            <RibbonIconButton
              icon={<IconPolyline />}
              label="Spl cp"
              active={tool === 'spline_cp'}
              commandId="sk_spline_cp"
              onClick={() => setTool('spline_cp')}
              title="Spline control polygon (uniform cubic B-spline); min 4 points"
            />
            <RibbonIconButton
              icon={<IconPolyline />}
              label="Poly"
              active={tool === 'polyline'}
              commandId="sk_polyline"
              onClick={() => setTool('polyline')}
            />
            <RibbonIconButton
              icon={<IconPolygon />}
              label="N-gon"
              active={tool === 'polygon'}
              commandId="sk_polygon"
              onClick={() => setTool('polygon')}
              title="Regular polygon (3–128 sides): center, then corner"
            />
            <RibbonIconButton
              icon={<IconLine />}
              label="Line"
              active={tool === 'line'}
              commandId="sk_line"
              onClick={() => setTool('line')}
            />
            <RibbonIconButton
              icon={<IconSketchPoint />}
              label="Point"
              active={tool === 'point'}
              commandId="sk_point"
              onClick={() => setTool('point')}
              title="Construction point (sketch point map only)"
            />
            <RibbonIconButton
              icon={<IconArc />}
              label="Arc"
              active={tool === 'arc'}
              commandId="sk_arc_3pt"
              onClick={() => setTool('arc')}
            />
            <RibbonIconButton
              icon={<IconArc />}
              label="Arc ⊙"
              active={tool === 'arc_center'}
              commandId="sk_arc_center"
              onClick={() => setTool('arc_center')}
              title="Arc by center, start, and end (minor arc)"
            />
            <RibbonIconButton
              icon={<IconTrim />}
              label="Trim"
              active={tool === 'trim'}
              commandId="sk_trim"
              onClick={() => setTool('trim')}
            />
            <RibbonIconButton
              icon={<IconTrim />}
              label="Split"
              active={tool === 'split'}
              commandId="sk_split"
              onClick={() => setTool('split')}
            />
            <RibbonIconButton
              icon={<IconTrim />}
              label="Break"
              active={tool === 'break'}
              commandId="sk_break"
              onClick={() => setTool('break')}
            />
            <RibbonIconButton
              icon={<IconTrim />}
              label="Extend"
              active={tool === 'extend'}
              commandId="sk_extend"
              onClick={() => setTool('extend')}
            />
            <RibbonIconButton
              icon={<IconSketchFillet />}
              label="Fillet"
              active={tool === 'fillet'}
              commandId="sk_fillet_sk"
              onClick={() => setTool('fillet')}
            />
            <RibbonIconButton
              icon={<IconChamfer />}
              label="Chamfer"
              active={tool === 'chamfer'}
              commandId="sk_chamfer_sk"
              onClick={() => setTool('chamfer')}
              title="Corner chamfer on point-ID polylines (two consecutive edges)"
            />
            <RibbonIconButton
              icon={<IconLine />}
              label="Move"
              active={tool === 'move_sk'}
              commandId="sk_move_sk"
              onClick={() => setTool('move_sk')}
              title="Translate whole sketch: first point → second point"
            />
            <label className="msg" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Rot°
              <input
                type="number"
                step={1}
                value={sketchRotateDeg}
                onChange={(e) => setSketchRotateDeg(Number(e.target.value) || 0)}
                style={{ width: 52 }}
              />
            </label>
            <RibbonIconButton
              icon={<IconRevolve />}
              label="Rotate"
              active={tool === 'rotate_sk'}
              commandId="sk_rotate_sk"
              onClick={() => setTool('rotate_sk')}
              title="Click pivot; rotates whole sketch by Rot°"
            />
            <label className="msg" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Scl
              <input
                type="number"
                step={0.05}
                min={0.01}
                value={sketchScaleFactor}
                onChange={(e) => setSketchScaleFactor(Math.max(0.01, Number(e.target.value) || 1))}
                style={{ width: 52 }}
              />
            </label>
            <RibbonIconButton
              icon={<IconPattern />}
              label="Scale"
              active={tool === 'scale_sk'}
              commandId="sk_scale_sk"
              onClick={() => setTool('scale_sk')}
              title="Click pivot; scales whole sketch by Scl factor"
            />
            <RibbonIconButton
              icon={<IconMirror />}
              label="Mirror"
              active={tool === 'mirror_sk'}
              commandId="sk_mirror_sk"
              onClick={() => setTool('mirror_sk')}
              title="Two picks: mirror axis (A→B)"
            />
            <button type="button" className="secondary" onClick={addPresetRect}>
              + 50×30 rect
            </button>
            <label>
              Grid snap (mm)
              <input
                type="number"
                min={0}
                step={1}
                value={gridMm}
                onChange={(e) => setGridMm(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label title="Corner fillet radius on point-ID polylines (two consecutive edges)">
              Sketch fillet R (mm)
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={sketchFilletMm}
                onChange={(e) => setSketchFilletMm(Math.max(0.01, Number(e.target.value) || 0.01))}
              />
            </label>
            <label title="Chamfer leg length along each edge from the corner (point-ID polyline)">
              Sketch chamfer L (mm)
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={sketchChamferMm}
                onChange={(e) => setSketchChamferMm(Math.max(0.01, Number(e.target.value) || 0.01))}
              />
            </label>
            <label id="design-sketch-offset-controls">
              Offset loop
              <select
                value={offsetPolyId}
                onChange={(e) => setOffsetPolyId(e.target.value)}
                title="Closed point-ID polyline"
                disabled={closedPolyIds.length === 0}
              >
                {closedPolyIds.length === 0 ? (
                  <option value="">(no closed polyline)</option>
                ) : (
                  closedPolyIds.map((id) => (
                    <option key={id} value={id}>
                      {id.slice(0, 8)}…
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Δ (mm)
              <input
                type="number"
                step={0.5}
                value={offsetMm}
                onChange={(e) => setOffsetMm(Number(e.target.value) || 0)}
                title="Positive = outward for CCW loops"
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!offsetPolyId || closedPolyIds.length === 0}
              onClick={() => {
                const r = offsetClosedPolylineEntity(design, offsetPolyId, offsetMm)
                if (!r.ok) {
                  onStatus?.(r.error)
                  return
                }
                onDesignChange(r.design)
                onStatus?.('Offset polyline added.')
              }}
            >
              Offset loop
            </button>
            <div
              id="design-sketch-pattern-controls"
              className="ribbon-row ribbon-row--wrap"
              style={{ alignItems: 'center', gap: 6 }}
            >
              <label title="Linear: copies along Δ. Circular: copies rotated around pivot (same step rule as kernel pattern_circular).">
                Pattern
                <select
                  value={sketchPatternMode}
                  onChange={(e) => setSketchPatternMode(e.target.value === 'circular' ? 'circular' : 'linear')}
                  style={{ width: 88 }}
                >
                  <option value="linear">Linear</option>
                  <option value="circular">Circular</option>
                </select>
              </label>
              <label title="Total instances (original + copies); circular uses total° ÷ count per kernel">
                Pat #
                <input
                  type="number"
                  min={2}
                  max={64}
                  value={sketchPatternInstances}
                  onChange={(e) => setSketchPatternInstances(Math.max(2, Math.min(64, Math.floor(Number(e.target.value) || 2))))}
                  style={{ width: 48 }}
                />
              </label>
              {sketchPatternMode === 'linear' ? (
                <>
                  <label>
                    ΔX
                    <input
                      type="number"
                      step={0.5}
                      value={sketchPatternDx}
                      onChange={(e) => setSketchPatternDx(Number(e.target.value) || 0)}
                      style={{ width: 52 }}
                    />
                  </label>
                  <label>
                    ΔY
                    <input
                      type="number"
                      step={0.5}
                      value={sketchPatternDy}
                      onChange={(e) => setSketchPatternDy(Number(e.target.value) || 0)}
                      style={{ width: 52 }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label title="Rotation center (sketch mm)">
                    Pivot X
                    <input
                      type="number"
                      step={0.5}
                      value={sketchCircPivotX}
                      onChange={(e) => setSketchCircPivotX(Number(e.target.value) || 0)}
                      style={{ width: 52 }}
                    />
                  </label>
                  <label title="Rotation center (sketch mm)">
                    Pivot Y
                    <input
                      type="number"
                      step={0.5}
                      value={sketchCircPivotY}
                      onChange={(e) => setSketchCircPivotY(Number(e.target.value) || 0)}
                      style={{ width: 52 }}
                    />
                  </label>
                  <label title="Total angular span (0° &lt; total ≤ 360°); step = total ÷ Pat #">
                    Total°
                    <input
                      type="number"
                      step={1}
                      min={1}
                      max={360}
                      value={sketchCircTotalDeg}
                      onChange={(e) =>
                        setSketchCircTotalDeg(Math.max(1, Math.min(360, Math.floor(Number(e.target.value) || 360))))
                      }
                      style={{ width: 52 }}
                    />
                  </label>
                  <label title="First copy angle offset (degrees)">
                    Start°
                    <input
                      type="number"
                      step={1}
                      value={sketchCircStartDeg}
                      onChange={(e) => setSketchCircStartDeg(Number(e.target.value) || 0)}
                      style={{ width: 52 }}
                    />
                  </label>
                </>
              )}
              <RibbonIconButton
                icon={<IconPattern />}
                label="Pattern"
                title={
                  sketchPatternMode === 'linear'
                    ? 'Linear pattern: duplicate original sketch along Δ×(1…n−1)'
                    : 'Circular pattern: rotate copies around pivot (total° ÷ Pat #, same as kernel pattern_circular)'
                }
                commandId="sk_pattern_sk"
                onClick={() => {
                  if (sketchPatternMode === 'linear') {
                    const next = linearPatternSketchInstances(
                      design,
                      sketchPatternDx,
                      sketchPatternDy,
                      sketchPatternInstances
                    )
                    onDesignChange(next)
                    onStatus?.(
                      `Linear pattern: ${sketchPatternInstances} instance(s), step (${sketchPatternDx}, ${sketchPatternDy}) mm.`
                    )
                    return
                  }
                  if (sketchCircTotalDeg <= 0 || sketchCircTotalDeg > 360) {
                    onStatus?.('Circular pattern: Total° must be between 1 and 360.')
                    return
                  }
                  const next = circularPatternSketchInstances(
                    design,
                    sketchCircPivotX,
                    sketchCircPivotY,
                    sketchPatternInstances,
                    sketchCircTotalDeg,
                    sketchCircStartDeg
                  )
                  if (next.entities.length === design.entities.length) {
                    onStatus?.('Circular pattern: no copies added (check Pat # and Total°).')
                    return
                  }
                  onDesignChange(next)
                  const step = sketchCircTotalDeg / sketchPatternInstances
                  onStatus?.(
                    `Circular pattern: ${sketchPatternInstances} instance(s) around (${sketchCircPivotX}, ${sketchCircPivotY}) mm, step ${step.toFixed(1)}°, total ${sketchCircTotalDeg}°, start ${sketchCircStartDeg}°.`
                  )
                }}
              />
            </div>
            <RibbonIconButton
              icon={<IconDim />}
              label="Dim"
              title="Linear dimension — pick two points"
              commandId="dim_linear"
              onClick={() => {
                setLinearDimStep('a')
                setPickSlot(null)
                onStatus?.('Linear dimension: pick first point, then second.')
              }}
            />
            <RibbonIconButton
              icon={<IconDim />}
              label="Angular"
              title="Angular dimension — pick two segments"
              commandId="dim_angular"
              onClick={() => {
                setAngularDimStep('l1')
                setAngularDimL1(null)
                setPickSlot(null)
                onStatus?.('Angular dimension: pick first segment, then second.')
              }}
            />
            <RibbonIconButton
              icon={<IconDim />}
              label="Aligned"
              title="Aligned dimension — pick two points"
              commandId="dim_aligned"
              onClick={() => {
                setAlignedDimStep('a')
                setAlignedDimAId('')
                setPickSlot(null)
                onStatus?.('Aligned dimension: pick first point, then second.')
              }}
            />
            <label>
              Circle/arc
              <select
                value={dimEntityId}
                onChange={(e) => {
                  setDimEntityId(e.target.value)
                  setDimEntityPickMode(false)
                }}
                disabled={radialDimEntityIds.length === 0}
              >
                {radialDimEntityIds.length === 0 ? (
                  <option value="">(no circle or arc)</option>
                ) : (
                  radialDimEntityIds.map((id) => (
                    <option key={id} value={id}>
                      {id.slice(0, 8)}…
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              className={dimEntityPickMode ? 'primary' : 'secondary'}
              onClick={() => {
                setDimEntityPickMode((v) => !v)
                if (!dimEntityPickMode) onStatus?.('Dimension entity pick: click a circle/arc in sketch.')
              }}
              title="Pick dimension circle/arc on sketch"
            >
              Pick entity
            </button>
            <RibbonIconButton
              icon={<IconDim />}
              label="Radial"
              title="Add radial dimension for selected circle/arc"
              commandId="dim_radial"
              onClick={() => {
                if (!dimEntityId) {
                  onStatus?.('Radial dimension: choose a circle or arc first.')
                  return
                }
                const did = crypto.randomUUID()
                onDesignChange({
                  ...design,
                  dimensions: [...(design.dimensions ?? []), { id: did, kind: 'radial', entityId: dimEntityId }]
                })
                onStatus?.('Radial dimension added (annotation only).')
              }}
            />
            <RibbonIconButton
              icon={<IconDim />}
              label="Diameter"
              title="Add diameter dimension for selected circle/arc"
              commandId="dim_diameter"
              onClick={() => {
                if (!dimEntityId) {
                  onStatus?.('Diameter dimension: choose a circle or arc first.')
                  return
                }
                const did = crypto.randomUUID()
                onDesignChange({
                  ...design,
                  dimensions: [...(design.dimensions ?? []), { id: did, kind: 'diameter', entityId: dimEntityId }]
                })
                onStatus?.('Diameter dimension added (annotation only).')
              }}
            />
          </div>
        </div>
        )}

        {ribbonTab === 'constraint' && canvasPhase === 'model' && (
          <div className="ribbon-group ribbon-group--in-tab">
            <p className="msg sketch-gate-msg">
              Choose <strong>Sketch</strong> → datum plane → <strong>Enter sketch</strong> to edit constraints and geometry.
            </p>
          </div>
        )}

        {ribbonTab === 'constraint' && canvasPhase === 'sketch' && (
        <>
        <div className="ribbon-group ribbon-group--in-tab">
          <span className="ribbon-group-label">Constraint</span>
          <div className="ribbon-row ribbon-row--wrap">
            <label data-fab-ribbon="constraint-type">
              Type
              <select
                value={cType}
                onChange={(e) => {
                  setCType(e.target.value as SketchConstraint['type'])
                  setEntityPickSlot(null)
                }}
              >
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
                <option value="coincident">Coincident</option>
                <option value="distance">Distance</option>
                <option value="fix">Fix point</option>
                <option value="perpendicular">Perpendicular (2 lines)</option>
                <option value="parallel">Parallel (2 lines)</option>
                <option value="equal">Equal length (2 segments)</option>
                <option value="collinear">Collinear (3 points)</option>
                <option value="midpoint">Midpoint (M, A, B)</option>
                <option value="angle">Angle (2 lines, param °)</option>
                <option value="tangent">Tangent (line + arc end)</option>
                <option value="symmetric">Symmetric (2 pts, axis line)</option>
                <option value="concentric">Concentric (2 circles/arcs)</option>
                <option value="radius">Radius (entity + param)</option>
                <option value="diameter">Diameter (entity + param)</option>
              </select>
            </label>
            {cType === 'concentric' ? (
              <>
                <div className="constraint-field-row">
                  <label>
                    Entity A
                    <input value={cA} onChange={(e) => setCA(e.target.value)} onFocus={() => setEntityPickSlot('cA')} list="entity-ids-ribbon" />
                  </label>
                  <button type="button" className="secondary constraint-pick-target" aria-label="Pick entity A" onClick={() => setEntityPickSlot('cA')}>
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Entity B
                    <input value={cB} onChange={(e) => setCB(e.target.value)} onFocus={() => setEntityPickSlot('cB')} list="entity-ids-ribbon" />
                  </label>
                  <button type="button" className="secondary constraint-pick-target" aria-label="Pick entity B" onClick={() => setEntityPickSlot('cB')}>
                    ⌖
                  </button>
                </div>
              </>
            ) : cType === 'radius' || cType === 'diameter' ? (
              <div className="constraint-field-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ minWidth: 180, flex: '1 1 180px' }}>
                  Entity
                  <input value={cA} onChange={(e) => setCA(e.target.value)} onFocus={() => setEntityPickSlot('cA')} list="entity-ids-ribbon" />
                </label>
                <button type="button" className="secondary constraint-pick-target" aria-label="Pick entity" onClick={() => setEntityPickSlot('cA')}>
                  ⌖
                </button>
                <label style={{ minWidth: 160, flex: '1 1 160px' }}>
                  {cType === 'radius' ? 'Driving radius (mm)' : 'Driving diameter (mm)'}
                  <input value={cParam} onChange={(e) => setCParam(e.target.value)} list="design-param-keys" />
                </label>
              </div>
            ) : cType === 'fix' ? (
              <div className="constraint-field-row">
                <label>
                  pointId
                  <input
                    value={cA}
                    onChange={(e) => setCA(e.target.value)}
                    onFocus={() => setPickSlot('cA')}
                    style={pickOutline('cA')}
                    title="Focus field or ⌖, then click the sketch"
                    placeholder="uuid"
                    list="pt-ids-ribbon"
                  />
                </label>
                <button
                  type="button"
                  className="secondary constraint-pick-target"
                  title="Pick on sketch"
                  aria-label="Pick point on sketch"
                  onClick={() => setPickSlot('cA')}
                >
                  ⌖
                </button>
              </div>
            ) : threePointConstraint ? (
              cType === 'collinear' ? (
                <>
                  <div className="constraint-field-row">
                    <label>
                      Point A
                      <input
                        value={cA}
                        onChange={(e) => setCA(e.target.value)}
                        onFocus={() => setPickSlot('cA')}
                        style={pickOutline('cA')}
                        title="Focus field or ⌖, then click the sketch"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick on sketch"
                      aria-label="Pick point A on sketch"
                      onClick={() => setPickSlot('cA')}
                    >
                      ⌖
                    </button>
                  </div>
                  <div className="constraint-field-row">
                    <label>
                      Point B
                      <input
                        value={cB}
                        onChange={(e) => setCB(e.target.value)}
                        onFocus={() => setPickSlot('cB')}
                        style={pickOutline('cB')}
                        title="Focus field or ⌖, then click the sketch"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick on sketch"
                      aria-label="Pick point B on sketch"
                      onClick={() => setPickSlot('cB')}
                    >
                      ⌖
                    </button>
                  </div>
                  <div className="constraint-field-row">
                    <label>
                      Point C
                      <input
                        value={cC}
                        onChange={(e) => setCC(e.target.value)}
                        onFocus={() => setPickSlot('cC')}
                        style={pickOutline('cC')}
                        title="Focus field or ⌖, then click the sketch"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick on sketch"
                      aria-label="Pick point C on sketch"
                      onClick={() => setPickSlot('cC')}
                    >
                      ⌖
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="constraint-field-row">
                    <label>
                      Midpoint M
                      <input
                        value={cA}
                        onChange={(e) => setCA(e.target.value)}
                        onFocus={() => setPickSlot('cA')}
                        style={pickOutline('cA')}
                        title="Focus field or ⌖, then click the sketch"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick on sketch"
                      aria-label="Pick midpoint M on sketch"
                      onClick={() => setPickSlot('cA')}
                    >
                      ⌖
                    </button>
                  </div>
                  <div className="constraint-field-row">
                    <label>
                      Segment end A
                      <input
                        value={cB}
                        onChange={(e) => setCB(e.target.value)}
                        onFocus={() => setPickSlot('cB')}
                        style={pickOutline('cB')}
                        title="Focus or ⌖; click edge to set A+B, or click vertices one at a time"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick segment or vertex on sketch"
                      aria-label="Pick segment end A on sketch"
                      onClick={() => setPickSlot('cB')}
                    >
                      ⌖
                    </button>
                  </div>
                  <div className="constraint-field-row">
                    <label>
                      Segment end B
                      <input
                        value={cC}
                        onChange={(e) => setCC(e.target.value)}
                        onFocus={() => setPickSlot('cC')}
                        style={pickOutline('cC')}
                        title="Focus or ⌖; click edge to set A+B, or pick this endpoint"
                        list="pt-ids-ribbon"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary constraint-pick-target"
                      title="Pick segment or vertex on sketch"
                      aria-label="Pick segment end B on sketch"
                      onClick={() => setPickSlot('cC')}
                    >
                      ⌖
                    </button>
                  </div>
                </>
              )
            ) : symmetricConstraint ? (
              <>
                <div className="constraint-field-row">
                  <label>
                    Point P1
                    <input
                      value={cA}
                      onChange={(e) => setCA(e.target.value)}
                      onFocus={() => setPickSlot('cA')}
                      style={pickOutline('cA')}
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick P1"
                    onClick={() => setPickSlot('cA')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Point P2
                    <input
                      value={cB}
                      onChange={(e) => setCB(e.target.value)}
                      onFocus={() => setPickSlot('cB')}
                      style={pickOutline('cB')}
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick P2"
                    onClick={() => setPickSlot('cB')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Axis A
                    <input
                      value={cC}
                      onChange={(e) => setCC(e.target.value)}
                      onFocus={() => setPickSlot('cC')}
                      style={pickOutline('cC')}
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick axis A"
                    onClick={() => setPickSlot('cC')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Axis B
                    <input
                      value={cD}
                      onChange={(e) => setCD(e.target.value)}
                      onFocus={() => setPickSlot('cD')}
                      style={pickOutline('cD')}
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick axis B"
                    onClick={() => setPickSlot('cD')}
                  >
                    ⌖
                  </button>
                </div>
              </>
            ) : tangentConstraint ? (
              <>
                <div className="constraint-field-row">
                  <label>
                    Line A
                    <input
                      value={cA}
                      onChange={(e) => setCA(e.target.value)}
                      onFocus={() => setPickSlot('cA')}
                      style={pickOutline('cA')}
                      title="⌖ segment sets A+B"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick line segment"
                    onClick={() => setPickSlot('cA')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Line B
                    <input
                      value={cB}
                      onChange={(e) => setCB(e.target.value)}
                      onFocus={() => setPickSlot('cB')}
                      style={pickOutline('cB')}
                      title="Other line endpoint"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick line B"
                    onClick={() => setPickSlot('cB')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Arc C (start/end)
                    <input
                      value={cC}
                      onChange={(e) => setCC(e.target.value)}
                      onFocus={() => setPickSlot('cC')}
                      style={pickOutline('cC')}
                      title="Vertex that is arc start or end"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    aria-label="Pick arc endpoint"
                    onClick={() => setPickSlot('cC')}
                  >
                    ⌖
                  </button>
                </div>
              </>
            ) : twoLineConstraint ? (
              <>
                <div className="constraint-field-row">
                  <label>
                    Line1 A
                    <input
                      value={cA}
                      onChange={(e) => setCA(e.target.value)}
                      onFocus={() => setPickSlot('cA')}
                      style={pickOutline('cA')}
                      title="Focus or ⌖; click edge to set line1 A+B"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick line 1 point A on sketch"
                    onClick={() => setPickSlot('cA')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Line1 B
                    <input
                      value={cB}
                      onChange={(e) => setCB(e.target.value)}
                      onFocus={() => setPickSlot('cB')}
                      style={pickOutline('cB')}
                      title="Focus or ⌖, then click vertex"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick line 1 point B on sketch"
                    onClick={() => setPickSlot('cB')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Line2 A
                    <input
                      value={cC}
                      onChange={(e) => setCC(e.target.value)}
                      onFocus={() => setPickSlot('cC')}
                      style={pickOutline('cC')}
                      title="Focus or ⌖; click edge to set line2 A+B"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick line 2 point A on sketch"
                    onClick={() => setPickSlot('cC')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    Line2 B
                    <input
                      value={cD}
                      onChange={(e) => setCD(e.target.value)}
                      onFocus={() => setPickSlot('cD')}
                      style={pickOutline('cD')}
                      title="Focus or ⌖, then click vertex"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick line 2 point B on sketch"
                    onClick={() => setPickSlot('cD')}
                  >
                    ⌖
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="constraint-field-row">
                  <label>
                    A
                    <input
                      value={cA}
                      onChange={(e) => setCA(e.target.value)}
                      onFocus={() => setPickSlot('cA')}
                      style={pickOutline('cA')}
                      title="Focus field or ⌖, then click the sketch"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick point A on sketch"
                    onClick={() => setPickSlot('cA')}
                  >
                    ⌖
                  </button>
                </div>
                <div className="constraint-field-row">
                  <label>
                    B
                    <input
                      value={cB}
                      onChange={(e) => setCB(e.target.value)}
                      onFocus={() => setPickSlot('cB')}
                      style={pickOutline('cB')}
                      title="Focus field or ⌖, then click the sketch"
                      list="pt-ids-ribbon"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary constraint-pick-target"
                    title="Pick on sketch"
                    aria-label="Pick point B on sketch"
                    onClick={() => setPickSlot('cB')}
                  >
                    ⌖
                  </button>
                </div>
              </>
            )}
            {(cType === 'distance' || cType === 'angle') && (
              <div className="constraint-field-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ minWidth: 160, flex: '1 1 160px' }}>
                  {cType === 'distance' ? 'Driving length (mm)' : 'Driving angle (degrees)'}
                  <input
                    value={cParam}
                    onChange={(e) => setCParam(e.target.value)}
                    list="design-param-keys"
                    title="Name of a value in Parameters below — pick from the list or type a new key"
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  title="Add a length parameter and select it"
                  onClick={() => {
                    const k = nextParamSuffix('d')
                    setParameter(k, 10)
                    setCParam(k)
                    onStatus?.(`Parameter ${k} = 10 mm — used for distance constraints.`)
                  }}
                >
                  + length key
                </button>
                <button
                  type="button"
                  className="secondary"
                  title="Add an angle parameter and select it"
                  onClick={() => {
                    const k = nextParamSuffix('a')
                    setParameter(k, 90)
                    setCParam(k)
                    onStatus?.(`Parameter ${k} = 90° — used for angle constraints.`)
                  }}
                >
                  + angle key
                </button>
              </div>
            )}
            <RibbonIconButton
              icon={<IconConstraint />}
              label="Add"
              title="Add constraint with current fields"
              onClick={() => addConstraint({ cType, cA, cB, cC, cD, cParam })}
            />
            <button type="button" className="primary ribbon-text-btn" onClick={runSolve}>
              Solve sketch
            </button>
            <datalist id="pt-ids-ribbon">
              {pointIds.map((id) => {
                const p = design.points[id]
                const label = p ? `${id.slice(0, 8)}… (${p.x.toFixed(1)}, ${p.y.toFixed(1)})` : id.slice(0, 8)
                return <option key={id} value={id} label={label} />
              })}
            </datalist>
            <datalist id="entity-ids-ribbon">
              {design.entities.map((e) => (
                <option key={e.id} value={e.id} label={`${e.id.slice(0, 8)}… (${e.kind})`} />
              ))}
            </datalist>
            <datalist id="design-param-keys">
              {parameterKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
        </div>

        <div id="design-parameters-panel" className="ribbon-group ribbon-group--params">
          <span className="ribbon-group-label">Parameters</span>
          <span className="msg" style={{ marginLeft: 8, fontSize: '0.85em' }}>
            d* = mm (distance), a* = ° (angle)
          </span>
          <div className="ribbon-row ribbon-row--wrap">
            {Object.entries(design.parameters).map(([k, v]) => (
              <label key={k}>
                {k}
                <input type="number" value={v} onChange={(e) => setParameter(k, Number(e.target.value) || 0)} />
              </label>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const nk = `d${Object.keys(design.parameters).length + 1}`
                setParameter(nk, 20)
              }}
            >
              + param
            </button>
          </div>
        </div>
        </>
        )}

          {ribbonTab === 'inspect' && canvasPhase === 'sketch' && (
            <div className="ribbon-toolbar-strip">
              <div className="ribbon-group ribbon-group--in-tab">
                <p className="msg sketch-gate-msg">
                  <strong>Finish sketch</strong> to use 3D measure and section on the model view.
                </p>
              </div>
            </div>
          )}

          {ribbonTab === 'inspect' && canvasPhase === 'model' && (
            <div className="ribbon-toolbar-strip">
              <RibbonFusionGroup label="Inspect">
                <div className="ribbon-row ribbon-row--fusion">
                  <RibbonIconButton
                    icon={<IconMeasure />}
                    label="Measure"
                    title="Shift+click two points on the 3D solid"
                    active={measureMode}
                    disabled={!geometry}
                    commandId="ut_measure"
                    onClick={() => {
                      setCanvasPhase('model')
                      setMeasureMode(true)
                      setMeasurePts([])
                      onStatus?.('Measure on — Shift+click two points on the 3D solid. Esc clears.')
                    }}
                  />
                  <RibbonIconButton
                    icon={<IconSection />}
                    label="Section"
                    title="Clip 3D preview at Y plane"
                    active={sectionEnabled}
                    disabled={!geometry}
                    commandId="ut_section"
                    onClick={() => {
                      setCanvasPhase('model')
                      setSectionEnabled(true)
                      const ext = geometry ? worldYRangeFromExtrudeMeshGeometry(geometry) : { min: 0, max: 40 }
                      setSectionYMm((ext.min + ext.max) / 2)
                      onStatus?.('Section on — drag Y clip under 3D preview. Esc clears.')
                    }}
                  />
                  <RibbonIconButton
                    icon={<IconDim />}
                    label="Linear dim"
                    title="Pick two sketch points for annotation dimension"
                    active={linearDimStep !== 'off'}
                    commandId="dim_linear"
                    onClick={() => {
                      setRibbonTab('sketch')
                      setCanvasPhase('sketch')
                      setLinearDimStep('a')
                      setPickSlot(null)
                      onStatus?.('Linear dimension: pick first point, then second.')
                    }}
                  />
                  <RibbonIconButton
                    icon={<IconParams />}
                    label="Params"
                    title="Scroll to named parameters"
                    commandId="ut_parameters"
                    onClick={() => {
                      setRibbonTab('constraint')
                      setCanvasPhase('sketch')
                      queueMicrotask(() => {
                        document.getElementById('design-parameters-panel')?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest'
                        })
                      })
                      onStatus?.('Parameters — Constraint tab.')
                    }}
                  />
                </div>
              </RibbonFusionGroup>
            </div>
          )}
        </div>
      </div>

      {solveReport ? (
        <pre className="code design-solve-report" style={{ maxHeight: 72 }}>
          {solveReport}
        </pre>
      ) : null}

      <p className="msg design-workspace-hint">
        {canvasPhase === 'sketch'
          ? `${sketchDatumLabel(design.sketchPlane)} — 2D sketch only (X right, Y up). Pan: middle mouse or Shift+drag.`
          : facePickMode
            ? 'Model view — face pick is active. Click a solid face to set sketch plane.'
            : 'Model view — orbit the 3D preview. To sketch: open the Sketch tab, pick datum or Face, then Enter sketch.'}
        {canvasPhase === 'sketch' && linearDimStep !== 'off'
          ? ' Linear dimension: pick two vertices (Esc cancels).'
          : canvasPhase === 'sketch' && alignedDimStep !== 'off'
            ? ' Aligned dimension: pick two vertices (Esc cancels).'
          : canvasPhase === 'sketch' && angularDimStep !== 'off'
            ? ' Angular dimension: pick two segments (Esc cancels).'
            : canvasPhase === 'sketch' && dimEntityPickMode
              ? ' Dimension entity pick: hover a circle/arc and click to select. Esc cancels.'
            : canvasPhase === 'sketch' && entityPickSlot
              ? ` Constraint pick: ${entityPickSlot} — hover a circle/arc and click to select entity. Esc cancels.`
          : canvasPhase === 'sketch' && pickSlot
            ? segmentPickActive
              ? ` Constraint pick: ${pickSlot} — hover highlights target; click vertex or segment (polyline or arc chord). Esc cancels.`
              : ` Constraint pick: ${pickSlot} — hover highlights vertex; click uses exact position (grid snap does not apply). Esc cancels.`
            : ''}
      </p>

      <div className="design-canvas-stage design-canvas-stage--fill">
        {canvasPhase === 'sketch' ? (
          <div className="design-sketch-fullscreen">
            <div ref={sketchWrapRef} className="sketch-size-ref sketch-size-ref--fullscreen">
              <Sketch2DCanvas
                width={sketchSize.w}
                height={sketchSize.h}
                design={design}
                onDesignChange={onDesignChange}
                activeTool={tool}
                filletRadiusMm={sketchFilletMm}
                chamferLengthMm={sketchChamferMm}
                gridMm={gridMm}
                constraintPickActive={
                  pickSlot !== null || linearDimStep !== 'off' || alignedDimStep !== 'off' || angularDimStep !== 'off'
                }
                onConstraintPointPick={applyConstraintPointPick}
                constraintEntityPickActive={entityPickSlot !== null || dimEntityPickMode}
                onConstraintEntityPick={applyConstraintEntityPick}
                constraintSegmentPickActive={segmentPickActive || angularDimStep !== 'off'}
                onConstraintSegmentPick={
                  (segmentPickActive || angularDimStep !== 'off') && linearDimStep === 'off' && alignedDimStep === 'off'
                    ? applyConstraintSegmentPick
                    : undefined
                }
                onConstraintPickMiss={() =>
                  onStatus?.(
                    segmentPickActive || angularDimStep !== 'off'
                      ? 'No vertex or segment in range — zoom in or click closer to geometry.'
                      : 'No vertex in range — zoom in or click closer to a point.'
                  )
                }
                onSketchHint={onStatus}
                sketchRotateDeg={sketchRotateDeg}
                sketchScaleFactor={sketchScaleFactor}
              />
            </div>
            {loaded && (
              <ul className="tools entity-list design-entity-strip">
                {design.entities.map((e) => (
                  <li key={e.id}>
                    <span>
                      {e.kind}
                      {e.kind === 'rect' && ` ${e.w}×${e.h}`}
                      {e.kind === 'slot' && ` L=${e.length.toFixed(1)} W=${e.width.toFixed(1)}`}
                      {e.kind === 'circle' && ` r=${e.r.toFixed(1)}`}
                      {e.kind === 'polyline' && ` (${polyPtCount(e)} pts)`}
                      {e.kind === 'arc' && (e.closed ? ' (closed+chord)' : ' (3 pts)')}
                      {e.kind === 'ellipse' && ` rx=${e.rx.toFixed(1)} ry=${e.ry.toFixed(1)}`}
                      {(e.kind === 'spline_fit' || e.kind === 'spline_cp') &&
                        ` (${e.pointIds.length} pts${e.closed ? ', closed' : ''})`}
                    </span>
                    <button type="button" className="secondary" onClick={() => removeEntity(e.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {loaded && (design.dimensions ?? []).length > 0 ? (
              <ul className="tools entity-list design-entity-strip">
                {(design.dimensions ?? []).map((dim) => (
                  <li key={dim.id}>
                    {(() => {
                      const linearLike = dim.kind === 'linear' || dim.kind === 'aligned'
                      const radialLike = dim.kind === 'radial'
                      const diameterLike = dim.kind === 'diameter'
                      const linkedDriver = linearLike
                        ? design.constraints.find(
                            (c): c is Extract<SketchConstraint, { type: 'distance' }> =>
                              c.type === 'distance' &&
                              ((c.a.pointId === dim.aId && c.b.pointId === dim.bId) ||
                                (c.a.pointId === dim.bId && c.b.pointId === dim.aId))
                          )
                        : radialLike
                          ? design.constraints.find(
                              (c): c is Extract<SketchConstraint, { type: 'radius' }> =>
                                c.type === 'radius' && c.entityId === dim.entityId
                            )
                          : diameterLike
                            ? design.constraints.find(
                                (c): c is Extract<SketchConstraint, { type: 'diameter' }> =>
                                  c.type === 'diameter' && c.entityId === dim.entityId
                              )
                            : undefined
                      const linkedParamKey = linkedDriver?.parameterKey
                      const linkedParamValue =
                        linkedParamKey != null ? design.parameters[linkedParamKey] : undefined
                      return (
                        <>
                    <span>
                      {dim.kind === 'linear'
                        ? `linear dim ${dim.aId.slice(0, 6)}… → ${dim.bId.slice(0, 6)}…`
                        : dim.kind === 'aligned'
                          ? `aligned dim ${dim.aId.slice(0, 6)}… → ${dim.bId.slice(0, 6)}…`
                        : dim.kind === 'radial'
                          ? `radial dim ${dim.entityId.slice(0, 6)}…`
                          : dim.kind === 'diameter'
                            ? `diameter dim ${dim.entityId.slice(0, 6)}…`
                            : `angular dim ${dim.a1Id.slice(0, 6)}…/${dim.a2Id.slice(0, 6)}…`}
                      {linkedParamKey
                        ? ` · [${linkedDriver?.type ?? 'driver'}] ${linkedParamKey}${
                            typeof linkedParamValue === 'number' ? ` = ${linkedParamValue.toFixed(3)} mm` : ''
                          }`
                        : ''}
                    </span>
                    {linkedParamKey && typeof linkedParamValue === 'number' && (
                      <label>
                        Value (mm)
                        <input
                          type="number"
                          step={0.1}
                          value={linkedParamValue}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setParameter(linkedParamKey, Number.isFinite(v) ? v : 0)
                          }}
                          onBlur={() => runSolve()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') runSolve()
                          }}
                          title={`Edit ${linkedParamKey}`}
                        />
                      </label>
                    )}
                    {linkedParamKey && (
                      <button type="button" className="secondary" onClick={runSolve} title="Re-solve sketch now">
                        Solve
                      </button>
                    )}
                    {linkedDriver && (
                      <button
                        type="button"
                        className="secondary"
                        title="Remove driving constraint; keep annotation dimension"
                        onClick={() => {
                          const nextConstraints = design.constraints.filter((c) => c.id !== linkedDriver.id)
                          const stillUsed = nextConstraints.some(
                            (c) =>
                              'parameterKey' in c &&
                              typeof c.parameterKey === 'string' &&
                              c.parameterKey === linkedDriver.parameterKey
                          )
                          const nextParameters = { ...design.parameters }
                          if (!stillUsed && linkedDriver.parameterKey in nextParameters) {
                            delete nextParameters[linkedDriver.parameterKey]
                          }
                          onDesignChange({
                            ...design,
                            constraints: nextConstraints,
                            parameters: nextParameters
                          })
                          onStatus?.(
                            stillUsed
                              ? 'Dimension unlinked (driver constraint removed).'
                              : `Dimension unlinked (removed unused parameter ${linkedDriver.parameterKey}).`
                          )
                        }}
                      >
                        Unlink
                      </button>
                    )}
                    {(linearLike || radialLike || diameterLike) && (
                      <button
                        type="button"
                        className="secondary"
                        title={
                          linearLike
                            ? 'Create distance constraint + parameter from this dimension'
                            : radialLike
                              ? 'Create radius constraint + parameter from this dimension'
                              : 'Create diameter constraint + parameter from this dimension'
                        }
                        disabled={!!linkedParamKey}
                        onClick={() => {
                          if (linearLike) {
                            const pa = design.points[dim.aId]
                            const pb = design.points[dim.bId]
                            const measured = pa && pb ? Math.hypot(pb.x - pa.x, pb.y - pa.y) : 25
                            const key = nextParamSuffix('d')
                            setParameter(key, Number(measured.toFixed(3)))
                            addConstraint({
                              cType: 'distance',
                              cA: dim.aId,
                              cB: dim.bId,
                              cParam: key
                            })
                            onStatus?.(`Driving distance created: ${key} = ${measured.toFixed(3)} mm`)
                            return
                          }
                          const ent = design.entities.find((e) => e.id === dim.entityId)
                          let radiusMm = 10
                          if (ent?.kind === 'circle') {
                            radiusMm = ent.r
                          } else if (ent?.kind === 'arc') {
                            const ps = design.points[ent.startId]
                            const pv = design.points[ent.viaId]
                            const pe = design.points[ent.endId]
                            if (ps && pv && pe) {
                              const circ = circleThroughThreePoints(ps.x, ps.y, pv.x, pv.y, pe.x, pe.y)
                              if (circ) radiusMm = circ.r
                            }
                          }
                          const key = nextParamSuffix('d')
                          if (radialLike) {
                            setParameter(key, Number(radiusMm.toFixed(3)))
                            addConstraint({
                              cType: 'radius',
                              cA: dim.entityId,
                              cB: '',
                              cParam: key
                            })
                            onStatus?.(`Driving radius created: ${key} = ${radiusMm.toFixed(3)} mm`)
                          } else {
                            const dia = radiusMm * 2
                            setParameter(key, Number(dia.toFixed(3)))
                            addConstraint({
                              cType: 'diameter',
                              cA: dim.entityId,
                              cB: '',
                              cParam: key
                            })
                            onStatus?.(`Driving diameter created: ${key} = ${dia.toFixed(3)} mm`)
                          }
                        }}
                      >
                        Drive
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        onDesignChange({
                          ...design,
                          dimensions: (design.dimensions ?? []).filter((x) => x.id !== dim.id)
                        })
                      }
                    >
                      Remove
                    </button>
                        </>
                      )
                    })()}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="design-model-fullscreen">
            <div className="design-3d design-3d--fill design-3d--solo">
              <h3>3D preview</h3>
              <div className="row design-viewport-tools" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={measureMode}
                    onChange={(e) => {
                      setMeasureMode(e.target.checked)
                      if (!e.target.checked) setMeasurePts([])
                    }}
                    disabled={!geometry}
                  />
                  Measure
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={measurePts.length === 0}
                  onClick={() => setMeasurePts([])}
                >
                  Clear picks
                </button>
                {measurePts.length === 2 ? (
                  <span className="msg" style={{ margin: 0 }}>
                    Δ{' '}
                    {Math.hypot(
                      measurePts[1].x - measurePts[0].x,
                      measurePts[1].y - measurePts[0].y,
                      measurePts[1].z - measurePts[0].z
                    ).toFixed(3)}{' '}
                    mm
                  </span>
                ) : null}
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={sectionEnabled}
                    onChange={(e) => {
                      const on = e.target.checked
                      setSectionEnabled(on)
                      if (on && geometry) {
                        const { min, max } = worldYExtents
                        setSectionYMm((min + max) / 2)
                      }
                    }}
                    disabled={!geometry}
                  />
                  Section (Y)
                </label>
                {sectionEnabled && geometry ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    Clip Y (mm)
                    <input
                      type="range"
                      min={worldYExtents.min}
                      max={worldYExtents.max}
                      step={0.25}
                      value={Math.min(worldYExtents.max, Math.max(worldYExtents.min, sectionYMm))}
                      onChange={(e) => setSectionYMm(Number.parseFloat(e.target.value))}
                    />
                    <span className="msg" style={{ margin: 0 }}>
                      {sectionYMm.toFixed(2)}
                    </span>
                  </label>
                ) : null}
              </div>
              {measureMode ? (
                <p className="msg" style={{ marginTop: 0 }}>
                  <strong>Shift+click</strong> the solid for each sample (orbit with drag still works if you miss the mesh).
                </p>
              ) : null}
              {projectSketchMode && geometry ? (
                <div className="msg" style={{ marginTop: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span>
                    <strong>Project</strong>: click the solid to add samples ({projectSketchDraftMm.length}).
                  </span>
                  <button type="button" className="primary" disabled={projectSketchDraftMm.length < 2} onClick={commitProjectSketch}>
                    Commit polyline
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setProjectSketchMode(false)
                      setProjectSketchDraftMm([])
                      onStatus?.('Project cancelled.')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <Viewport3D
                geometry={geometry}
                measureMode={measureMode}
                onMeasurePoint={onMeasureViewportPoint}
                projectSketchMode={!!geometry && projectSketchMode && !measureMode}
                onProjectSketchPoint={onProjectSketchViewportPoint}
                facePickMode={facePickMode}
                onPickFace={onPickSketchFace}
                measureMarkers={measurePts}
                sectionClipY={sectionEnabled && geometry ? sectionYMm : null}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
