import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesignFileV2 } from '../../shared/design-schema'
import {
  mirrorSketchAcrossLine,
  mirrorSketchPointsAcrossLine,
  rotateSketchAround,
  rotateSketchPointsAround,
  scaleSketchAround,
  scaleSketchPointsAround,
  translateSketch,
  translateSketchPoints
} from './design-ops'
import {
  applySketchCornerChamfer,
  applySketchCornerFillet,
  arcSamplePositions,
  arcViaForCenterStartEnd,
  circleFromDiameterEndpoints,
  circleThroughThreePoints,
  constraintPickPointIdEdges,
  ellipseFromCenterMajorMinor,
  ellipseLoopWorld,
  ELLIPSE_PROFILE_SEGMENTS,
  pickNearestCircularEntityId,
  pickNearestSketchEdge,
  polylinePositions,
  rectFromThreePoints,
  regularPolygonVertices,
  perpDistanceToLineThroughPoints,
  slotCapsuleLoopWorld,
  slotParamsFromCapCenters,
  slotParamsFromOverallTips,
  sampleArcThroughThreePoints,
  sampleCenterStartEndArc,
  splineCpPolylineFromEntity,
  splineFitPolylineFromEntity,
  breakSketchEdge,
  extendSketchEdge,
  splitSketchEdge,
  trimSketchEdge,
  worldCornersFromRectParams,
  type SketchTrimEdgeRef
} from '../../shared/sketch-profile'
import { clientToCanvasLocal, distSqPointSegment, niceStepMm, screenToWorld, snap } from './sketch2d-canvas-coords'

const CANVAS_SLOT_SEGMENTS = 24

export type SketchTool =
  | 'point'
  | 'polygon'
  | 'polyline'
  | 'line'
  | 'rect'
  | 'rect_3pt'
  | 'slot_center'
  | 'slot_overall'
  | 'circle'
  | 'circle_2pt'
  | 'circle_3pt'
  | 'ellipse'
  | 'spline_fit'
  | 'spline_cp'
  | 'arc'
  | 'arc_center'
  | 'trim'
  | 'split'
  | 'break'
  | 'extend'
  | 'fillet'
  | 'chamfer'
  | 'move_sk'
  | 'rotate_sk'
  | 'scale_sk'
  | 'mirror_sk'

type Props = {
  width: number
  height: number
  design: DesignFileV2
  onDesignChange: (next: DesignFileV2) => void
  activeTool: SketchTool
  /** Radius (mm) for sketch corner fillet when `activeTool === 'fillet'`. */
  filletRadiusMm?: number
  /** Leg length (mm) along each edge for sketch chamfer when `activeTool === 'chamfer'`. */
  chamferLengthMm?: number
  gridMm: number
  /** When set, left-clicks pick the nearest sketch vertex (within radius) instead of drawing. */
  constraintPickActive?: boolean
  constraintPickRadiusMm?: number
  onConstraintPointPick?: (pointId: string) => void
  /** When set with callback, after vertex miss: pick nearest polyline edge (pointId endpoints). */
  constraintSegmentPickActive?: boolean
  onConstraintSegmentPick?: (pointIdA: string, pointIdB: string) => void
  /** Left-click in pick mode with no vertex/edge in tolerance. */
  onConstraintPickMiss?: () => void
  /** When set, left-click picks nearest circle/arc entity id. */
  constraintEntityPickActive?: boolean
  onConstraintEntityPick?: (entityId: string) => void
  onSketchHint?: (msg: string) => void
  /** Degrees for rotate_sk (ribbon). */
  sketchRotateDeg?: number
  /** Factor for scale_sk (ribbon). */
  sketchScaleFactor?: number
  /** Shown at top-left (e.g. sketch plane name). */
  planeLabel?: string
}

type ConstraintPickHit = { kind: 'vertex'; id: string } | { kind: 'segment'; a: string; b: string }

export function Sketch2DCanvas({
  width,
  height,
  design,
  onDesignChange,
  activeTool,
  filletRadiusMm = 2,
  chamferLengthMm = 2,
  gridMm,
  constraintPickActive = false,
  constraintPickRadiusMm = 5,
  onConstraintPointPick,
  constraintSegmentPickActive = false,
  onConstraintSegmentPick,
  onConstraintPickMiss,
  constraintEntityPickActive = false,
  onConstraintEntityPick,
  onSketchHint,
  sketchRotateDeg = 0,
  sketchScaleFactor = 1,
  planeLabel
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { entities, points } = design
  const [scale, setScale] = useState(2.5)
  const [ox, setOx] = useState(0)
  const [oy, setOy] = useState(0)
  const [polyDraft, setPolyDraft] = useState<[number, number][]>([])
  /** First click for two-point open polyline (`line` tool). */
  const [lineStart, setLineStart] = useState<[number, number] | null>(null)
  const [lineHover, setLineHover] = useState<[number, number] | null>(null)
  /** Diameter endpoints for two-click circle (`circle_2pt`). */
  const [circle2ptStart, setCircle2ptStart] = useState<[number, number] | null>(null)
  const [circle2ptHover, setCircle2ptHover] = useState<[number, number] | null>(null)
  /** Three rim picks for circumcircle (`circle_3pt`). */
  const [circle3Draft, setCircle3Draft] = useState<[number, number][]>([])
  const [circle3Hover, setCircle3Hover] = useState<[number, number] | null>(null)
  /** Corner A, B then C for oriented `rect_3pt`. */
  const [rect3Draft, setRect3Draft] = useState<[number, number][]>([])
  const [rect3Hover, setRect3Hover] = useState<[number, number] | null>(null)
  /** Regular polygon: circumcenter, then corner (radius + rotation). */
  const [polygonSides, setPolygonSides] = useState(6)
  const [polygonCenter, setPolygonCenter] = useState<[number, number] | null>(null)
  const [polygonHover, setPolygonHover] = useState<[number, number] | null>(null)
  /** Cap centers (two picks) for `slot_center`; third pick sets width via perpendicular distance. */
  const [slotCenterDraft, setSlotCenterDraft] = useState<[number, number][]>([])
  const [slotWidthHover, setSlotWidthHover] = useState<[number, number] | null>(null)
  /** Overall tip-to-tip picks for `slot_overall`; third pick sets width. */
  const [slotOverallDraft, setSlotOverallDraft] = useState<[number, number][]>([])
  const [slotOverallWidthHover, setSlotOverallWidthHover] = useState<[number, number] | null>(null)
  /** Two clicked positions (mm); third click completes the arc. */
  const [arcDraft, setArcDraft] = useState<[number, number][]>([])
  const [arcHover, setArcHover] = useState<[number, number] | null>(null)
  /** Ellipse: center, major endpoint, then minor (three picks). */
  const [ellipseDraft, setEllipseDraft] = useState<[number, number][]>([])
  const [ellipseHover, setEllipseHover] = useState<[number, number] | null>(null)
  const [splineFitDraft, setSplineFitDraft] = useState<[number, number][]>([])
  const [splineCpDraft, setSplineCpDraft] = useState<[number, number][]>([])
  /** Transform tools: first point (and second for mirror axis). */
  const [xformDraft, setXformDraft] = useState<[number, number][]>([])
  const [arcCloseProfile, setArcCloseProfile] = useState(false)
  const [trimCutter, setTrimCutter] = useState<SketchTrimEdgeRef | null>(null)
  const [extendCutter, setExtendCutter] = useState<SketchTrimEdgeRef | null>(null)
  const [filletFirst, setFilletFirst] = useState<SketchTrimEdgeRef | null>(null)
  const [chamferFirst, setChamferFirst] = useState<SketchTrimEdgeRef | null>(null)
  const [drag, setDrag] = useState<
    | { kind: 'rect'; a: [number, number]; b: [number, number] }
    | { kind: 'circle'; c: [number, number]; r: number }
    | null
  >(null)
  /** While true, mouse move does not overwrite typed dimension fields / drag preview. */
  const lineDimFocused = useRef(false)
  const rectDimFocused = useRef(false)
  const circleDimFocused = useRef(false)
  const [lineDeltaX, setLineDeltaX] = useState('')
  const [lineDeltaY, setLineDeltaY] = useState('')
  const [rectWIn, setRectWIn] = useState('')
  const [rectHIn, setRectHIn] = useState('')
  const [circleRIn, setCircleRIn] = useState('')
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const [constraintHover, setConstraintHover] = useState<ConstraintPickHit | null>(null)
  const [entityHoverId, setEntityHoverId] = useState<string | null>(null)

  const viewportSize = useCallback((): { w: number; h: number } => {
    const c = ref.current
    if (!c) return { w: width, h: height }
    const rect = c.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    return { w, h }
  }, [width, height])

  useEffect(() => {
    if (!constraintPickActive) setConstraintHover(null)
  }, [constraintPickActive])
  useEffect(() => {
    if (!constraintEntityPickActive) setEntityHoverId(null)
  }, [constraintEntityPickActive])

  useEffect(() => {
    if (!lineStart) {
      setLineDeltaX('')
      setLineDeltaY('')
    }
  }, [lineStart])

  useEffect(() => {
    if (!lineStart || !lineHover) return
    if (lineDimFocused.current) return
    const dx = lineHover[0] - lineStart[0]
    const dy = lineHover[1] - lineStart[1]
    setLineDeltaX(String(Math.round(dx * 1000) / 1000))
    setLineDeltaY(String(Math.round(dy * 1000) / 1000))
  }, [lineStart, lineHover])

  useEffect(() => {
    if (drag?.kind !== 'rect') {
      setRectWIn('')
      setRectHIn('')
      return
    }
    if (rectDimFocused.current) return
    const w = Math.abs(drag.b[0] - drag.a[0])
    const h = Math.abs(drag.b[1] - drag.a[1])
    setRectWIn(String(Math.max(0, Math.round(w * 1000) / 1000)))
    setRectHIn(String(Math.max(0, Math.round(h * 1000) / 1000)))
  }, [drag])

  useEffect(() => {
    if (drag?.kind !== 'circle') {
      setCircleRIn('')
      return
    }
    if (circleDimFocused.current) return
    setCircleRIn(String(Math.max(0, Math.round(drag.r * 1000) / 1000)))
  }, [drag])

  useEffect(() => {
    setXformDraft([])
  }, [activeTool])

  /** Point IDs for selection-scoped move/rotate/scale/mirror (Shift+click to toggle). */
  const [xformSelectionIds, setXformSelectionIds] = useState<string[]>([])

  useEffect(() => {
    setXformSelectionIds([])
  }, [activeTool])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && xformSelectionIds.length > 0) {
        setXformSelectionIds([])
        onSketchHint?.('Transform selection cleared.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [xformSelectionIds.length, onSketchHint])

  const probeXformVertex = useCallback(
    (wx: number, wy: number): string | null => {
      const pxWorld = 10 / Math.max(scale, 0.05)
      const r = Math.max(constraintPickRadiusMm, pxWorld)
      const r2 = r * r
      let best: { id: string; d2: number } | null = null
      for (const [id, p] of Object.entries(points)) {
        const dx = p.x - wx
        const dy = p.y - wy
        const d2 = dx * dx + dy * dy
        if (d2 <= r2 && (!best || d2 < best.d2)) best = { id, d2 }
      }
      return best?.id ?? null
    },
    [points, scale, constraintPickRadiusMm]
  )

  const probeConstraintPick = useCallback(
    (wx: number, wy: number): ConstraintPickHit | null => {
      const pxWorld = 10 / Math.max(scale, 0.05)
      const r = Math.max(constraintPickRadiusMm, pxWorld)
      const r2 = r * r
      let best: { id: string; d2: number } | null = null
      for (const [id, p] of Object.entries(points)) {
        const dx = p.x - wx
        const dy = p.y - wy
        const d2 = dx * dx + dy * dy
        if (d2 <= r2 && (!best || d2 < best.d2)) best = { id, d2 }
      }
      if (best) return { kind: 'vertex', id: best.id }
      if (constraintSegmentPickActive && onConstraintSegmentPick) {
        const segTol = Math.max(constraintPickRadiusMm, 14 / Math.max(scale, 0.05))
        const segTol2 = segTol * segTol
        let bestSeg: { a: string; b: string; d2: number } | null = null
        for (const { a, b } of constraintPickPointIdEdges(design)) {
          const pa = points[a]
          const pb = points[b]
          if (!pa || !pb) continue
          const d2 = distSqPointSegment(wx, wy, pa.x, pa.y, pb.x, pb.y)
          if (d2 <= segTol2 && (!bestSeg || d2 < bestSeg.d2)) bestSeg = { a, b, d2 }
        }
        if (bestSeg) return { kind: 'segment', a: bestSeg.a, b: bestSeg.b }
      }
      return null
    },
    [
      design,
      points,
      scale,
      constraintPickRadiusMm,
      constraintSegmentPickActive,
      onConstraintSegmentPick
    ]
  )

  useEffect(() => {
    if (activeTool !== 'arc' && activeTool !== 'arc_center') {
      setArcDraft([])
      setArcHover(null)
      setArcCloseProfile(false)
    }
    if (activeTool !== 'trim') {
      setTrimCutter(null)
    }
    if (activeTool !== 'split') {
      setTrimCutter(null)
    }
    if (activeTool !== 'break') {
      setTrimCutter(null)
    }
    if (activeTool !== 'extend') {
      setExtendCutter(null)
    }
    if (activeTool !== 'fillet') {
      setFilletFirst(null)
    }
    if (activeTool !== 'chamfer') {
      setChamferFirst(null)
    }
    if (activeTool !== 'polyline') {
      setPolyDraft([])
    }
    if (activeTool !== 'line') {
      setLineStart(null)
      setLineHover(null)
    }
    if (activeTool !== 'circle_2pt') {
      setCircle2ptStart(null)
      setCircle2ptHover(null)
    }
    if (activeTool !== 'circle_3pt') {
      setCircle3Draft([])
      setCircle3Hover(null)
    }
    if (activeTool !== 'rect_3pt') {
      setRect3Draft([])
      setRect3Hover(null)
    }
    if (activeTool !== 'polygon') {
      setPolygonCenter(null)
      setPolygonHover(null)
    }
    if (activeTool !== 'slot_center') {
      setSlotCenterDraft([])
      setSlotWidthHover(null)
    }
    if (activeTool !== 'slot_overall') {
      setSlotOverallDraft([])
      setSlotOverallWidthHover(null)
    }
  }, [activeTool])

  const draw = useCallback(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const view = viewportSize()
    const vw = view.w
    const vh = view.h
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const bitmapW = Math.max(1, Math.round(vw * dpr))
    const bitmapH = Math.max(1, Math.round(vh * dpr))
    if (c.width !== bitmapW || c.height !== bitmapH) {
      c.width = bitmapW
      c.height = bitmapH
    }
    c.style.width = `${vw}px`
    c.style.height = `${vh}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0c0612'
    ctx.fillRect(0, 0, vw, vh)
    const cx = vw / 2
    const cy = vh / 2

    const w2m = (x: number, y: number): [number, number] => screenToWorld(x, y, vw, vh, scale, ox, oy)
    const crisp = (v: number) => Math.round(v) + 0.5

    const grid = Math.max(0.0001, gridMm)
    const majorStep = grid * 5
    const axisLabelStep = Math.max(grid, niceStepMm(90 / Math.max(scale, 0.05)))
    const minorGridColor = '#241732'
    const majorGridColor = '#3b2753'
    const minorPx = grid * scale
    const shouldDrawMinor = minorPx >= 6

    ctx.strokeStyle = minorGridColor
    ctx.lineWidth = 1
    const minW = w2m(0, vh)
    const maxW = w2m(vw, 0)
    const x0 = Math.floor(Math.min(minW[0], maxW[0]) / grid) * grid
    const x1 = Math.ceil(Math.max(minW[0], maxW[0]) / grid) * grid
    const y0 = Math.floor(Math.min(minW[1], maxW[1]) / grid) * grid
    const y1 = Math.ceil(Math.max(minW[1], maxW[1]) / grid) * grid

    if (shouldDrawMinor) {
      for (let x = x0; x <= x1 + grid * 0.25; x += grid) {
        const majorHit = Math.abs(Math.round(x / majorStep) * majorStep - x) < grid * 0.08
        if (majorHit) continue
        const sx = crisp(cx + (x - ox) * scale)
        ctx.beginPath()
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, vh)
        ctx.stroke()
      }
      for (let y = y0; y <= y1 + grid * 0.25; y += grid) {
        const majorHit = Math.abs(Math.round(y / majorStep) * majorStep - y) < grid * 0.08
        if (majorHit) continue
        const sy = crisp(cy - (y - oy) * scale)
        ctx.beginPath()
        ctx.moveTo(0, sy)
        ctx.lineTo(vw, sy)
        ctx.stroke()
      }
    }

    const x0Major = Math.floor(Math.min(minW[0], maxW[0]) / majorStep) * majorStep
    const x1Major = Math.ceil(Math.max(minW[0], maxW[0]) / majorStep) * majorStep
    const y0Major = Math.floor(Math.min(minW[1], maxW[1]) / majorStep) * majorStep
    const y1Major = Math.ceil(Math.max(minW[1], maxW[1]) / majorStep) * majorStep
    ctx.strokeStyle = majorGridColor
    for (let x = x0Major; x <= x1Major + majorStep * 0.25; x += majorStep) {
      const sx = crisp(cx + (x - ox) * scale)
      ctx.beginPath()
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, vh)
      ctx.stroke()
    }
    for (let y = y0Major; y <= y1Major + majorStep * 0.25; y += majorStep) {
      const sy = crisp(cy - (y - oy) * scale)
      ctx.beginPath()
      ctx.moveTo(0, sy)
      ctx.lineTo(vw, sy)
      ctx.stroke()
    }

    // World axes and origin marker so users can quickly orient and place geometry.
    const axisX = crisp(cx + (0 - ox) * scale)
    const axisY = crisp(cy - (0 - oy) * scale)
    ctx.lineWidth = 2.25
    ctx.strokeStyle = '#7dd3fc'
    ctx.beginPath()
    ctx.moveTo(axisX, 0)
    ctx.lineTo(axisX, vh)
    ctx.stroke()
    ctx.strokeStyle = '#86efac'
    ctx.beginPath()
    ctx.moveTo(0, axisY)
    ctx.lineTo(vw, axisY)
    ctx.stroke()

    if (planeLabel) {
      ctx.save()
      ctx.fillStyle = 'rgba(233, 213, 255, 0.92)'
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.fillText(`Sketch · ${planeLabel}`, 10, 18)
      ctx.restore()
    }

    const drawAxisMarks = () => {
      if (axisLabelStep <= 0 || !Number.isFinite(axisLabelStep)) return
      const tick = 5
      ctx.save()
      ctx.strokeStyle = '#e9d5ff'
      ctx.fillStyle = '#e9d5ff'
      ctx.lineWidth = 1
      ctx.font = '10px system-ui'
      if (axisY >= 0 && axisY <= vh) {
        const xMark0 = Math.floor(Math.min(minW[0], maxW[0]) / axisLabelStep) * axisLabelStep
        const xMark1 = Math.ceil(Math.max(minW[0], maxW[0]) / axisLabelStep) * axisLabelStep
        for (let x = xMark0; x <= xMark1 + axisLabelStep * 0.25; x += axisLabelStep) {
          const sx = cx + (x - ox) * scale
          if (sx < -8 || sx > vw + 8) continue
          const scx = crisp(sx)
          ctx.beginPath()
          ctx.moveTo(scx, axisY - tick)
          ctx.lineTo(scx, axisY + tick)
          ctx.stroke()
          if (Math.abs(x) > 1e-6) {
            const lbl = Number.isInteger(x) ? x.toFixed(0) : x.toFixed(2).replace(/\.?0+$/, '')
            ctx.fillText(lbl, scx + 3, Math.min(vh - 6, axisY + 14))
          }
        }
      }
      if (axisX >= 0 && axisX <= vw) {
        const yMark0 = Math.floor(Math.min(minW[1], maxW[1]) / axisLabelStep) * axisLabelStep
        const yMark1 = Math.ceil(Math.max(minW[1], maxW[1]) / axisLabelStep) * axisLabelStep
        for (let y = yMark0; y <= yMark1 + axisLabelStep * 0.25; y += axisLabelStep) {
          const sy = cy - (y - oy) * scale
          if (sy < -8 || sy > vh + 8) continue
          const scy = crisp(sy)
          ctx.beginPath()
          ctx.moveTo(axisX - tick, scy)
          ctx.lineTo(axisX + tick, scy)
          ctx.stroke()
          if (Math.abs(y) > 1e-6) {
            const lbl = Number.isInteger(y) ? y.toFixed(0) : y.toFixed(2).replace(/\.?0+$/, '')
            ctx.fillText(lbl, Math.min(vw - 26, axisX + 8), scy - 3)
          }
        }
      }
      ctx.restore()
    }
    drawAxisMarks()

    const originSx = cx + (0 - ox) * scale
    const originSy = cy - (0 - oy) * scale
    ctx.fillStyle = '#f5d0fe'
    ctx.beginPath()
    ctx.arc(originSx, originSy, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '11px system-ui'
    ctx.fillStyle = '#e9d5ff'
    ctx.fillText('Origin (0,0)', originSx + 8, originSy - 8)

    ctx.strokeStyle = '#9333ea'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(147, 51, 234, 0.12)'

    const drawShape = (pts: [number, number][], closed: boolean) => {
      if (pts.length === 0) return
      ctx.beginPath()
      const p0 = pts[0]!
      ctx.moveTo(cx + (p0[0] - ox) * scale, cy - (p0[1] - oy) * scale)
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]!
        ctx.lineTo(cx + (p[0] - ox) * scale, cy - (p[1] - oy) * scale)
      }
      if (closed) {
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        ctx.stroke()
      }
    }

    for (const e of entities) {
      if (e.kind === 'polyline') {
        const pts = polylinePositions(e, points)
        drawShape(pts, e.closed)
      } else if (e.kind === 'rect') {
        const hw = e.w / 2
        const hh = e.h / 2
        const cos = Math.cos(e.rotation)
        const sin = Math.sin(e.rotation)
        const corners: [number, number][] = [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh]
        ].map(([x, y]) => [e.cx + x * cos - y * sin, e.cy + x * sin + y * cos])
        drawShape(corners, true)
      } else if (e.kind === 'circle') {
        const sx = cx + (e.cx - ox) * scale
        const sy = cy - (e.cy - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, e.r * scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else if (e.kind === 'slot') {
        const loop = slotCapsuleLoopWorld(
          e.cx,
          e.cy,
          e.length,
          e.width,
          e.rotation,
          CANVAS_SLOT_SEGMENTS
        )
        if (loop.length >= 3) drawShape(loop, true)
      } else if (e.kind === 'arc') {
        const apt = arcSamplePositions(e, points, 28)
        if (apt.length >= 2) {
          ctx.fillStyle = e.closed ? 'rgba(147, 51, 234, 0.12)' : 'transparent'
          drawShape(apt, !!e.closed)
          ctx.fillStyle = 'rgba(147, 51, 234, 0.12)'
        }
      } else if (e.kind === 'ellipse') {
        const loop = ellipseLoopWorld(e.cx, e.cy, e.rx, e.ry, e.rotation, ELLIPSE_PROFILE_SEGMENTS)
        if (loop.length >= 3) drawShape(loop, true)
      } else if (e.kind === 'spline_fit' || e.kind === 'spline_cp') {
        const loop =
          e.kind === 'spline_fit' ? splineFitPolylineFromEntity(e, points) : splineCpPolylineFromEntity(e, points)
        if (loop && loop.length >= 2) {
          ctx.fillStyle = e.closed ? 'rgba(147, 51, 234, 0.12)' : 'transparent'
          drawShape(loop, !!e.closed)
          ctx.fillStyle = 'rgba(147, 51, 234, 0.12)'
        }
      }
    }

    const dims = design.dimensions ?? []
    for (const dm of dims) {
      ctx.strokeStyle = '#64748b'
      ctx.fillStyle = '#cbd5e1'
      ctx.lineWidth = 1
      ctx.font = '11px system-ui'
      if (dm.kind === 'linear' || dm.kind === 'aligned') {
        const pa = points[dm.aId]
        const pb = points[dm.bId]
        if (!pa || !pb) continue
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const len = Math.hypot(dx, dy)
        if (len < 1e-9) continue
        const nx = (-dy / len) * 5
        const ny = (dx / len) * 5
        const sax = cx + (pa.x - ox) * scale
        const say = cy - (pa.y - oy) * scale
        const sbx = cx + (pb.x - ox) * scale
        const sby = cy - (pb.y - oy) * scale
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(sax + nx * scale * 0.15, say - ny * scale * 0.15)
        ctx.lineTo(sax + nx * scale, say - ny * scale)
        ctx.moveTo(sbx + nx * scale * 0.15, sby - ny * scale * 0.15)
        ctx.lineTo(sbx + nx * scale, sby - ny * scale)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(sax + nx * scale, say - ny * scale)
        ctx.lineTo(sbx + nx * scale, sby - ny * scale)
        ctx.stroke()
        const mx = (sax + sbx) / 2 + nx * scale
        const my = (say + sby) / 2 - ny * scale
        const prefix = dm.kind === 'aligned' ? 'A ' : ''
        const pk = dm.parameterKey
        const driven =
          pk && design.parameters[pk] !== undefined && Number.isFinite(design.parameters[pk])
            ? design.parameters[pk]!
            : null
        const label =
          driven != null ? `${prefix}${driven.toFixed(2)} mm (param ${pk})` : `${prefix}${len.toFixed(2)} mm`
        ctx.fillText(label, mx + 4, my + 4)
      } else if (dm.kind === 'angular') {
        const p1 = points[dm.a1Id]
        const p2 = points[dm.b1Id]
        const p3 = points[dm.a2Id]
        const p4 = points[dm.b2Id]
        if (!p1 || !p2 || !p3 || !p4) continue
        const v1x = p2.x - p1.x
        const v1y = p2.y - p1.y
        const v2x = p4.x - p3.x
        const v2y = p4.y - p3.y
        const l1 = Math.hypot(v1x, v1y)
        const l2 = Math.hypot(v2x, v2y)
        if (l1 < 1e-9 || l2 < 1e-9) continue
        const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))
        const deg = (Math.acos(cos) * 180) / Math.PI
        const mx = ((p1.x + p2.x + p3.x + p4.x) * 0.25 - ox) * scale + cx
        const my = (-(p1.y + p2.y + p3.y + p4.y) * 0.25 + oy) * scale + cy
        const pk = dm.parameterKey
        const driven =
          pk && design.parameters[pk] !== undefined && Number.isFinite(design.parameters[pk])
            ? design.parameters[pk]!
            : null
        ctx.fillText(
          driven != null ? `${driven.toFixed(2)}° (param ${pk})` : `${deg.toFixed(2)}°`,
          mx + 4,
          my + 4
        )
      } else {
        const ent = entities.find((e) => e.id === dm.entityId)
        if (!ent) continue
        let cxMm = 0
        let cyMm = 0
        let rMm = 0
        if (ent.kind === 'circle') {
          cxMm = ent.cx
          cyMm = ent.cy
          rMm = ent.r
        } else if (ent.kind === 'ellipse') {
          cxMm = ent.cx
          cyMm = ent.cy
          rMm = (ent.rx + ent.ry) / 2
        } else if (ent.kind === 'arc') {
          const p0 = points[ent.startId]
          const p1 = points[ent.viaId]
          const p2 = points[ent.endId]
          if (!p0 || !p1 || !p2) continue
          const arcPts = sampleArcThroughThreePoints(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, 10)
          if (!arcPts || arcPts.length < 2) continue
          const a = arcPts[0]!
          const b = arcPts[Math.floor(arcPts.length / 2)]!
          const c3 = arcPts[arcPts.length - 1]!
          const cc = circleThroughThreePoints(a[0], a[1], b[0], b[1], c3[0], c3[1])
          if (!cc) continue
          cxMm = cc.ox
          cyMm = cc.oy
          rMm = cc.r
        } else {
          continue
        }
        const csx = cx + (cxMm - ox) * scale
        const csy = cy - (cyMm - oy) * scale
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.arc(csx, csy, rMm * scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        const pk = dm.parameterKey
        const driven =
          pk && design.parameters[pk] !== undefined && Number.isFinite(design.parameters[pk])
            ? design.parameters[pk]!
            : null
        const label =
          dm.kind === 'radial'
            ? driven != null
              ? `R ${driven.toFixed(2)} mm (param ${pk})`
              : `R ${rMm.toFixed(2)} mm`
            : driven != null
              ? `Ø ${driven.toFixed(2)} mm (param ${pk})`
              : `Ø ${(rMm * 2).toFixed(2)} mm`
        ctx.fillText(label, csx + rMm * scale + 6, csy - 6)
      }
    }

    if (trimCutter && activeTool === 'trim') {
      const ent = entities.find((x) => x.id === trimCutter.entityId)
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 3
      if (ent?.kind === 'polyline' && 'pointIds' in ent) {
        const ids = ent.pointIds
        const n = ids.length
        const ne = ent.closed ? n : n - 1
        if (trimCutter.edgeIndex >= 0 && trimCutter.edgeIndex < ne) {
          const ia = trimCutter.edgeIndex
          const idA = ids[ia]!
          const idB = ent.closed ? ids[(ia + 1) % n]! : ids[ia + 1]!
          const pa = points[idA]
          const pb = points[idB]
          if (pa && pb) {
            ctx.beginPath()
            ctx.moveTo(cx + (pa.x - ox) * scale, cy - (pa.y - oy) * scale)
            ctx.lineTo(cx + (pb.x - ox) * scale, cy - (pb.y - oy) * scale)
            ctx.stroke()
          }
        }
      } else if (ent?.kind === 'arc') {
        const apt = arcSamplePositions(ent, points, 36)
        if (apt.length >= 2) {
          ctx.beginPath()
          const p0 = apt[0]!
          ctx.moveTo(cx + (p0[0] - ox) * scale, cy - (p0[1] - oy) * scale)
          for (let i = 1; i < apt.length; i++) {
            const p = apt[i]!
            ctx.lineTo(cx + (p[0] - ox) * scale, cy - (p[1] - oy) * scale)
          }
          ctx.stroke()
        }
      }
      ctx.strokeStyle = '#9333ea'
      ctx.lineWidth = 2
    }

    if (extendCutter && activeTool === 'extend') {
      const ent = entities.find((x) => x.id === extendCutter.entityId)
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 3
      if (ent?.kind === 'polyline' && 'pointIds' in ent) {
        const ids = ent.pointIds
        const n = ids.length
        const ne = ent.closed ? n : n - 1
        if (extendCutter.edgeIndex >= 0 && extendCutter.edgeIndex < ne) {
          const ia = extendCutter.edgeIndex
          const idA = ids[ia]!
          const idB = ent.closed ? ids[(ia + 1) % n]! : ids[ia + 1]!
          const pa = points[idA]
          const pb = points[idB]
          if (pa && pb) {
            ctx.beginPath()
            ctx.moveTo(cx + (pa.x - ox) * scale, cy - (pa.y - oy) * scale)
            ctx.lineTo(cx + (pb.x - ox) * scale, cy - (pb.y - oy) * scale)
            ctx.stroke()
          }
        }
      } else if (ent?.kind === 'arc') {
        const apt = arcSamplePositions(ent, points, 36)
        if (apt.length >= 2) {
          ctx.beginPath()
          const p0 = apt[0]!
          ctx.moveTo(cx + (p0[0] - ox) * scale, cy - (p0[1] - oy) * scale)
          for (let i = 1; i < apt.length; i++) {
            const p = apt[i]!
            ctx.lineTo(cx + (p[0] - ox) * scale, cy - (p[1] - oy) * scale)
          }
          ctx.stroke()
        }
      }
      ctx.strokeStyle = '#9333ea'
      ctx.lineWidth = 2
    }

    ctx.fillStyle = '#c4b5fd'
    for (const p of Object.values(points)) {
      const sx = cx + (p.x - ox) * scale
      const sy = cy - (p.y - oy) * scale
      ctx.beginPath()
      const pr = constraintPickActive ? (p.fixed ? 6 : 5) : p.fixed ? 4 : 3
      ctx.arc(sx, sy, pr, 0, Math.PI * 2)
      ctx.fill()
    }

    if (constraintPickActive && constraintHover) {
      ctx.save()
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 2
      if (constraintHover.kind === 'vertex') {
        const pv = points[constraintHover.id]
        if (pv) {
          const sx = cx + (pv.x - ox) * scale
          const sy = cy - (pv.y - oy) * scale
          ctx.beginPath()
          ctx.arc(sx, sy, 11, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else {
        const pa = points[constraintHover.a]
        const pb = points[constraintHover.b]
        if (pa && pb) {
          ctx.beginPath()
          ctx.moveTo(cx + (pa.x - ox) * scale, cy - (pa.y - oy) * scale)
          ctx.lineTo(cx + (pb.x - ox) * scale, cy - (pb.y - oy) * scale)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    if (polyDraft.length > 0) {
      ctx.strokeStyle = '#a78bfa'
      ctx.fillStyle = 'transparent'
      drawShape(polyDraft, false)
    }

    if (activeTool === 'ellipse' && ellipseDraft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of ellipseDraft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (ellipseDraft.length === 2 && ellipseHover) {
        const c = ellipseDraft[0]!
        const maj = ellipseDraft[1]!
        const g = ellipseFromCenterMajorMinor(c[0], c[1], maj[0], maj[1], ellipseHover[0], ellipseHover[1])
        if (g && g.rx > 0.5 && g.ry > 0.5) {
          const ghost = ellipseLoopWorld(c[0], c[1], g.rx, g.ry, g.rotation, ELLIPSE_PROFILE_SEGMENTS)
          ctx.strokeStyle = '#a78bfa'
          ctx.fillStyle = 'transparent'
          ctx.setLineDash([4, 4])
          drawShape(ghost, true)
          ctx.setLineDash([])
        }
      }
    }

    if (splineFitDraft.length > 0) {
      ctx.strokeStyle = '#a78bfa'
      ctx.fillStyle = 'transparent'
      drawShape(splineFitDraft, false)
    }
    if (splineCpDraft.length > 0) {
      ctx.strokeStyle = '#c4b5fd'
      ctx.fillStyle = 'transparent'
      drawShape(splineCpDraft, false)
    }

    if (
      xformDraft.length > 0 &&
      (activeTool === 'move_sk' ||
        activeTool === 'rotate_sk' ||
        activeTool === 'scale_sk' ||
        activeTool === 'mirror_sk')
    ) {
      ctx.fillStyle = '#fbbf24'
      for (const q of xformDraft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (
      xformSelectionIds.length > 0 &&
      (activeTool === 'move_sk' ||
        activeTool === 'rotate_sk' ||
        activeTool === 'scale_sk' ||
        activeTool === 'mirror_sk')
    ) {
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2
      for (const id of xformSelectionIds) {
        const p = points[id]
        if (!p) continue
        const sx = cx + (p.x - ox) * scale
        const sy = cy - (p.y - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    if (activeTool === 'line' && lineStart && lineHover) {
      ctx.strokeStyle = '#a78bfa'
      ctx.fillStyle = 'transparent'
      ctx.setLineDash([4, 4])
      drawShape([lineStart, lineHover], false)
      ctx.setLineDash([])
    }

    if (activeTool === 'circle_2pt' && circle2ptStart && circle2ptHover) {
      const g = circleFromDiameterEndpoints(
        circle2ptStart[0],
        circle2ptStart[1],
        circle2ptHover[0],
        circle2ptHover[1]
      )
      if (g && g.r > 1e-6) {
        ctx.strokeStyle = '#a78bfa'
        ctx.fillStyle = 'transparent'
        ctx.setLineDash([4, 4])
        drawShape([circle2ptStart, circle2ptHover], false)
        ctx.beginPath()
        ctx.arc(cx + (g.cx - ox) * scale, cy - (g.cy - oy) * scale, g.r * scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    if (activeTool === 'circle_3pt' && circle3Draft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of circle3Draft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (circle3Draft.length === 2 && circle3Hover) {
        const [a, b] = circle3Draft
        const circ = circleThroughThreePoints(a![0], a![1], b![0], b![1], circle3Hover[0], circle3Hover[1])
        if (circ && circ.r > 1e-6) {
          ctx.strokeStyle = '#a78bfa'
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.arc(cx + (circ.ox - ox) * scale, cy - (circ.oy - oy) * scale, circ.r * scale, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }

    if (activeTool === 'rect_3pt' && rect3Draft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of rect3Draft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (rect3Draft.length === 2 && rect3Hover) {
        const [a, b] = rect3Draft
        const rr = rectFromThreePoints(a![0], a![1], b![0], b![1], rect3Hover[0], rect3Hover[1])
        if (rr && rr.w >= 0.5 && rr.h >= 0.5) {
          const ghost = worldCornersFromRectParams(rr)
          ctx.strokeStyle = '#a78bfa'
          ctx.fillStyle = 'transparent'
          ctx.setLineDash([4, 4])
          drawShape(ghost, true)
          ctx.setLineDash([])
        }
      }
    }

    if (activeTool === 'polygon' && polygonCenter) {
      const pcx = cx + (polygonCenter[0] - ox) * scale
      const pcy = cy - (polygonCenter[1] - oy) * scale
      ctx.fillStyle = '#a78bfa'
      ctx.beginPath()
      ctx.arc(pcx, pcy, 5, 0, Math.PI * 2)
      ctx.fill()
      const hover = polygonHover ?? polygonCenter
      const r = Math.hypot(hover[0] - polygonCenter[0], hover[1] - polygonCenter[1])
      if (r > 0.5) {
        const sides = Math.max(3, Math.min(128, Math.floor(polygonSides)))
        const start = Math.atan2(hover[1] - polygonCenter[1], hover[0] - polygonCenter[0])
        const ghost = regularPolygonVertices(polygonCenter[0], polygonCenter[1], r, start, sides)
        ctx.strokeStyle = '#a78bfa'
        ctx.fillStyle = 'transparent'
        ctx.setLineDash([4, 4])
        drawShape(ghost, true)
        ctx.setLineDash([])
      }
    }

    if (activeTool === 'slot_center' && slotCenterDraft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of slotCenterDraft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (slotCenterDraft.length === 2 && slotWidthHover) {
        const c0 = slotCenterDraft[0]!
        const c1 = slotCenterDraft[1]!
        const wMm = 2 * perpDistanceToLineThroughPoints(
          slotWidthHover[0],
          slotWidthHover[1],
          c0[0],
          c0[1],
          c1[0],
          c1[1]
        )
        const pr = slotParamsFromCapCenters(c0[0], c0[1], c1[0], c1[1], Math.max(0.5, wMm))
        if (pr && wMm > 0.25) {
          const ghost = slotCapsuleLoopWorld(
            pr.cx,
            pr.cy,
            pr.length,
            pr.width,
            pr.rotation,
            CANVAS_SLOT_SEGMENTS
          )
          if (ghost.length >= 3) {
            ctx.strokeStyle = '#a78bfa'
            ctx.fillStyle = 'transparent'
            ctx.setLineDash([4, 4])
            drawShape(ghost, true)
            ctx.setLineDash([])
          }
        }
      }
    }

    if (activeTool === 'slot_overall' && slotOverallDraft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of slotOverallDraft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (slotOverallDraft.length === 2 && slotOverallWidthHover) {
        const t0 = slotOverallDraft[0]!
        const t1 = slotOverallDraft[1]!
        const wMm = 2 * perpDistanceToLineThroughPoints(
          slotOverallWidthHover[0],
          slotOverallWidthHover[1],
          t0[0],
          t0[1],
          t1[0],
          t1[1]
        )
        const pr = slotParamsFromOverallTips(t0[0], t0[1], t1[0], t1[1], Math.max(0.5, wMm))
        if (pr && wMm > 0.25) {
          const ghost = slotCapsuleLoopWorld(
            pr.cx,
            pr.cy,
            pr.length,
            pr.width,
            pr.rotation,
            CANVAS_SLOT_SEGMENTS
          )
          if (ghost.length >= 3) {
            ctx.strokeStyle = '#a78bfa'
            ctx.fillStyle = 'transparent'
            ctx.setLineDash([4, 4])
            drawShape(ghost, true)
            ctx.setLineDash([])
          }
        }
      }
    }

    if ((activeTool === 'arc' || activeTool === 'arc_center') && arcDraft.length > 0) {
      ctx.fillStyle = '#a78bfa'
      for (const q of arcDraft) {
        const sx = cx + (q[0] - ox) * scale
        const sy = cy - (q[1] - oy) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (arcDraft.length === 2) {
        ctx.strokeStyle = '#a78bfa'
        ctx.fillStyle = 'transparent'
        const [a, b] = arcDraft
        if (activeTool === 'arc') {
          drawShape([a!, b!], false)
        } else {
          const [cx0, cy0] = a!
          const [sx0, sy0] = b!
          const r0 = Math.hypot(sx0 - cx0, sy0 - cy0)
          if (r0 > 1e-6) {
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            const scx = cx + (cx0 - ox) * scale
            const scy = cy - (cy0 - oy) * scale
            ctx.arc(scx, scy, r0 * scale, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
        if (arcHover) {
          const ghost =
            activeTool === 'arc'
              ? sampleArcThroughThreePoints(a![0], a![1], b![0], b![1], arcHover[0], arcHover[1], 32)
              : sampleCenterStartEndArc(a![0], a![1], b![0], b![1], arcHover[0], arcHover[1], 32)
          if (ghost && ghost.length >= 2) {
            ctx.setLineDash([4, 4])
            drawShape(ghost, false)
            ctx.setLineDash([])
          }
        }
      }
    }

    if (drag?.kind === 'rect') {
      const [x1, y1] = drag.a
      const [x2, y2] = drag.b
      const pts: [number, number][] = [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2]
      ]
      drawShape(pts, true)
    }
    if (drag?.kind === 'circle') {
      const sx = cx + (drag.c[0] - ox) * scale
      const sy = cy - (drag.c[1] - oy) * scale
      ctx.beginPath()
      ctx.arc(sx, sy, drag.r * scale, 0, Math.PI * 2)
      ctx.strokeStyle = '#a78bfa'
      ctx.stroke()
    }

    ctx.fillStyle = '#a78bfa'
    ctx.font = '12px system-ui'
    let pickHint = ''
    if (constraintPickActive) {
      pickHint =
        constraintSegmentPickActive && onConstraintSegmentPick
          ? ' · Pick: vertex or segment (exact click, not grid snap)'
          : ' · Pick: vertex (exact click, not grid snap)'
    }
    ctx.fillText(`Scale ${scale.toFixed(2)} px/mm · Middle-drag pan · Wheel zoom${pickHint}`, 8, vh - 8)
  }, [
    width,
    height,
    entities,
    points,
    design.dimensions,
    design.parameters,
    polyDraft,
    lineStart,
    lineHover,
    circle2ptStart,
    circle2ptHover,
    circle3Draft,
    circle3Hover,
    rect3Draft,
    rect3Hover,
    polygonSides,
    polygonCenter,
    polygonHover,
    slotCenterDraft,
    slotWidthHover,
    slotOverallDraft,
    slotOverallWidthHover,
    arcDraft,
    arcHover,
    ellipseDraft,
    ellipseHover,
    splineFitDraft,
    splineCpDraft,
    xformDraft,
    xformSelectionIds,
    sketchRotateDeg,
    sketchScaleFactor,
    planeLabel,
    activeTool,
    drag,
    scale,
    ox,
    oy,
    gridMm,
    constraintPickActive,
    constraintSegmentPickActive,
    onConstraintSegmentPick,
    constraintHover,
    trimCutter,
    filletFirst,
    chamferFirst,
    viewportSize
  ])

  useEffect(() => {
    draw()
  }, [draw])

  const commitOpenPolylineSegment = useCallback(
    (a: [number, number], b: [number, number]) => {
      const idA = crypto.randomUUID()
      const idB = crypto.randomUUID()
      const eid = crypto.randomUUID()
      onDesignChange({
        ...design,
        points: {
          ...design.points,
          [idA]: { x: a[0], y: a[1] },
          [idB]: { x: b[0], y: b[1] }
        },
        entities: [...design.entities, { id: eid, kind: 'polyline', pointIds: [idA, idB], closed: false }]
      })
    },
    [design, onDesignChange]
  )

  const applyLineNumeric = useCallback(() => {
    if (!lineStart) return
    const dx = Number.parseFloat(lineDeltaX)
    const dy = Number.parseFloat(lineDeltaY)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      onSketchHint?.('Enter numeric ΔX and ΔY (mm).')
      return
    }
    const end: [number, number] = [snap(lineStart[0] + dx, gridMm), snap(lineStart[1] + dy, gridMm)]
    if (Math.hypot(end[0] - lineStart[0], end[1] - lineStart[1]) < 0.25) {
      onSketchHint?.('Segment length must be greater than ~0.25 mm.')
      return
    }
    commitOpenPolylineSegment(lineStart, end)
    setLineStart(null)
    setLineHover(null)
    onSketchHint?.('Line segment placed.')
  }, [lineStart, lineDeltaX, lineDeltaY, gridMm, commitOpenPolylineSegment, onSketchHint])

  const syncRectDragFromInputs = useCallback(() => {
    if (drag?.kind !== 'rect') return
    const w = Number.parseFloat(rectWIn)
    const h = Number.parseFloat(rectHIn)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
    const [x1, y1] = drag.a
    const [x2, y2] = drag.b
    const sx = x2 >= x1 ? 1 : -1
    const sy = y2 >= y1 ? 1 : -1
    setDrag({
      kind: 'rect',
      a: drag.a,
      b: [snap(x1 + sx * w, gridMm), snap(y1 + sy * h, gridMm)]
    })
  }, [drag, rectWIn, rectHIn, gridMm])

  const finalizeRectDrag = useCallback(() => {
    if (drag?.kind !== 'rect') return
    const [x1, y1] = drag.a
    const [x2, y2] = drag.b
    let w = Math.abs(x2 - x1)
    let h = Math.abs(y2 - y1)
    if (rectDimFocused.current) {
      const pw = Number.parseFloat(rectWIn)
      const ph = Number.parseFloat(rectHIn)
      if (Number.isFinite(pw) && Number.isFinite(ph) && pw > 0.5 && ph > 0.5) {
        w = pw
        h = ph
      }
    }
    if (w > 0.5 && h > 0.5) {
      const sx = x2 >= x1 ? 1 : -1
      const sy = y2 >= y1 ? 1 : -1
      const nx2 = x1 + sx * w
      const ny2 = y1 + sy * h
      const rcx = (x1 + nx2) / 2
      const rcy = (y1 + ny2) / 2
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [...design.entities, { id, kind: 'rect', cx: rcx, cy: rcy, w, h, rotation: 0 }]
      })
      onSketchHint?.('Rectangle placed.')
    }
    setDrag(null)
  }, [drag, rectWIn, rectHIn, design, onDesignChange, onSketchHint])

  const finalizeCircleDrag = useCallback(() => {
    if (drag?.kind !== 'circle') return
    let r = drag.r
    if (circleDimFocused.current) {
      const pr = Number.parseFloat(circleRIn)
      if (Number.isFinite(pr) && pr > 0.5) {
        r = Math.max(0.5, snap(pr, gridMm))
      }
    }
    if (r > 0.5) {
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [...design.entities, { id, kind: 'circle', cx: drag.c[0], cy: drag.c[1], r }]
      })
      onSketchHint?.('Circle placed.')
      setDrag(null)
    }
  }, [drag, circleRIn, design, onDesignChange, onSketchHint, gridMm])

  function onWheel(ev: React.WheelEvent) {
    ev.preventDefault()
    const factor = ev.deltaY > 0 ? 0.92 : 1.08
    setScale((s) => Math.min(40, Math.max(0.1, s * factor)))
  }

  function onMouseDown(ev: React.MouseEvent) {
    const c = ref.current
    if (!c) return
    if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
      panRef.current = { sx: ev.clientX, sy: ev.clientY, ox, oy }
      return
    }
    if (ev.button !== 0) return
    const [lx, ly] = clientToCanvasLocal(ev.clientX, ev.clientY, c)
    const view = viewportSize()
    const raw = screenToWorld(lx, ly, view.w, view.h, scale, ox, oy)
    const w: [number, number] = [snap(raw[0], gridMm), snap(raw[1], gridMm)]

    if (constraintPickActive && (onConstraintPointPick || onConstraintSegmentPick)) {
      const hit = probeConstraintPick(raw[0], raw[1])
      if (hit?.kind === 'vertex' && onConstraintPointPick) {
        onConstraintPointPick(hit.id)
        return
      }
      if (hit?.kind === 'segment' && onConstraintSegmentPick) {
        onConstraintSegmentPick(hit.a, hit.b)
        return
      }
      onConstraintPickMiss?.()
      return
    }
    if (constraintEntityPickActive && onConstraintEntityPick) {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestCircularEntityId(design, raw[0], raw[1], tol)
      if (hit) onConstraintEntityPick(hit.entityId)
      else onConstraintPickMiss?.()
      return
    }

    if (
      (activeTool === 'move_sk' ||
        activeTool === 'rotate_sk' ||
        activeTool === 'scale_sk' ||
        activeTool === 'mirror_sk') &&
      ev.altKey
    ) {
      const vid = probeXformVertex(raw[0], raw[1])
      if (vid) {
        setXformSelectionIds((prev) => {
          const s = new Set(prev)
          if (s.has(vid)) s.delete(vid)
          else s.add(vid)
          return Array.from(s)
        })
        onSketchHint?.(
          'Transform: Alt+click toggles vertex selection. Esc clears. With selection, only those points transform.'
        )
        return
      }
    }

    if (activeTool === 'fillet') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Fillet: pick two edges (polyline corner or two arcs sharing an endpoint).')
        return
      }
      const targetEnt = entities.find((e) => e.id === hit.entityId)
      if (!targetEnt || (targetEnt.kind !== 'polyline' && targetEnt.kind !== 'arc')) {
        onSketchHint?.('Fillet: currently supports point-ID polyline corners or arc-arc shared endpoints.')
        return
      }
      if (!filletFirst) {
        setFilletFirst({ entityId: hit.entityId, edgeIndex: hit.edgeIndex })
        onSketchHint?.('Fillet: pick the second edge meeting at the same corner.')
        return
      }
      const res = applySketchCornerFillet(
        design,
        filletFirst,
        { entityId: hit.entityId, edgeIndex: hit.edgeIndex },
        Math.max(0.01, filletRadiusMm)
      )
      setFilletFirst(null)
      if (!res.ok) {
        onSketchHint?.(`Fillet failed: ${res.error}`)
        return
      }
      onDesignChange(res.design)
      onSketchHint?.('Fillet applied.')
      return
    }

    if (activeTool === 'chamfer') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Chamfer: pick two consecutive polyline edges at a corner (not arc / rect).')
        return
      }
      const targetEntCh = entities.find((e) => e.id === hit.entityId)
      if (!targetEntCh || targetEntCh.kind !== 'polyline' || !('pointIds' in targetEntCh)) {
        onSketchHint?.('Chamfer: only point-ID polyline edges (not legacy inline polyline).')
        return
      }
      if (!chamferFirst) {
        setChamferFirst({ entityId: hit.entityId, edgeIndex: hit.edgeIndex })
        onSketchHint?.('Chamfer: pick the second edge meeting at the same corner.')
        return
      }
      const resCh = applySketchCornerChamfer(
        design,
        chamferFirst,
        { entityId: hit.entityId, edgeIndex: hit.edgeIndex },
        Math.max(0.01, chamferLengthMm)
      )
      setChamferFirst(null)
      if (!resCh.ok) {
        onSketchHint?.(`Chamfer failed: ${resCh.error}`)
        return
      }
      onDesignChange(resCh.design)
      onSketchHint?.('Chamfer applied.')
      return
    }

    if (activeTool === 'trim') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Trim: click closer to a polyline or arc.')
        return
      }
      if (!trimCutter) {
        setTrimCutter({ entityId: hit.entityId, edgeIndex: hit.edgeIndex })
        onSketchHint?.('Trim: pick edge to trim — click on the side you want to remove.')
        return
      }
      const res = trimSketchEdge(
        design,
        trimCutter,
        { entityId: hit.entityId, edgeIndex: hit.edgeIndex },
        [raw[0], raw[1]]
      )
      setTrimCutter(null)
      if (!res.ok) {
        onSketchHint?.(`Trim failed: ${res.error}`)
        return
      }
      onDesignChange(res.design)
      onSketchHint?.('Trim applied.')
      return
    }

    if (activeTool === 'split') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Split: click closer to a polyline edge or arc.')
        return
      }
      const res = splitSketchEdge(design, { entityId: hit.entityId, edgeIndex: hit.edgeIndex }, [raw[0], raw[1]])
      if (!res.ok) {
        onSketchHint?.(`Split failed: ${res.error}`)
        return
      }
      onDesignChange(res.design)
      onSketchHint?.('Split applied.')
      return
    }

    if (activeTool === 'break') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Break: click closer to a polyline edge or arc.')
        return
      }
      const res = breakSketchEdge(design, { entityId: hit.entityId, edgeIndex: hit.edgeIndex }, [raw[0], raw[1]])
      if (!res.ok) {
        onSketchHint?.(`Break failed: ${res.error}`)
        return
      }
      onDesignChange(res.design)
      onSketchHint?.('Break applied.')
      return
    }

    if (activeTool === 'extend') {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestSketchEdge(design, raw[0], raw[1], tol)
      if (!hit) {
        onSketchHint?.('Extend: click closer to a boundary/target edge or arc.')
        return
      }
      if (!extendCutter) {
        setExtendCutter({ entityId: hit.entityId, edgeIndex: hit.edgeIndex })
        onSketchHint?.('Extend: pick target edge to extend.')
        return
      }
      const res = extendSketchEdge(
        design,
        extendCutter,
        { entityId: hit.entityId, edgeIndex: hit.edgeIndex },
        [raw[0], raw[1]]
      )
      setExtendCutter(null)
      if (!res.ok) {
        onSketchHint?.(`Extend failed: ${res.error}`)
        return
      }
      onDesignChange(res.design)
      onSketchHint?.('Extend applied.')
      return
    }

    if (activeTool === 'point') {
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        points: { ...design.points, [id]: { x: w[0], y: w[1] } }
      })
      onSketchHint?.('Point placed.')
      return
    }

    if (activeTool === 'polygon') {
      const sides = Math.max(3, Math.min(128, Math.floor(polygonSides)))
      if (!polygonCenter) {
        setPolygonCenter(w)
        return
      }
      const r = Math.hypot(w[0] - polygonCenter[0], w[1] - polygonCenter[1])
      if (r < 0.5) {
        onSketchHint?.('Polygon: second pick must be away from center (sets radius).')
        return
      }
      const start = Math.atan2(w[1] - polygonCenter[1], w[0] - polygonCenter[0])
      const verts = regularPolygonVertices(polygonCenter[0], polygonCenter[1], r, start, sides)
      const ids = verts.map(() => crypto.randomUUID())
      const nextPoints = { ...design.points }
      verts.forEach((pt, i) => {
        nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
      })
      const eid = crypto.randomUUID()
      onDesignChange({
        ...design,
        points: nextPoints,
        entities: [...design.entities, { id: eid, kind: 'polyline', pointIds: ids, closed: true }]
      })
      setPolygonCenter(null)
      setPolygonHover(null)
      onSketchHint?.(`Polygon (${sides} sides) placed.`)
      return
    }

    if (activeTool === 'slot_center') {
      if (slotCenterDraft.length === 0) {
        setSlotCenterDraft([w])
        return
      }
      if (slotCenterDraft.length === 1) {
        const c0 = slotCenterDraft[0]!
        if (Math.hypot(w[0] - c0[0], w[1] - c0[1]) < 0.5) {
          onSketchHint?.('Slot: second center must be away from the first.')
          return
        }
        setSlotCenterDraft([c0, w])
        return
      }
      const c0 = slotCenterDraft[0]!
      const c1 = slotCenterDraft[1]!
      const width = 2 * perpDistanceToLineThroughPoints(w[0], w[1], c0[0], c0[1], c1[0], c1[1])
      const p = slotParamsFromCapCenters(c0[0], c0[1], c1[0], c1[1], width)
      if (!p) {
        onSketchHint?.('Slot: width too small — click farther from the center line.')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [
          ...design.entities,
          {
            id,
            kind: 'slot',
            cx: p.cx,
            cy: p.cy,
            length: p.length,
            width: p.width,
            rotation: p.rotation
          }
        ]
      })
      setSlotCenterDraft([])
      setSlotWidthHover(null)
      onSketchHint?.('Slot placed.')
      return
    }

    if (activeTool === 'slot_overall') {
      if (slotOverallDraft.length === 0) {
        setSlotOverallDraft([w])
        return
      }
      if (slotOverallDraft.length === 1) {
        const t0 = slotOverallDraft[0]!
        if (Math.hypot(w[0] - t0[0], w[1] - t0[1]) < 0.5) {
          onSketchHint?.('Slot (overall): second point must be away from the first (tip to tip).')
          return
        }
        setSlotOverallDraft([t0, w])
        return
      }
      const t0 = slotOverallDraft[0]!
      const t1 = slotOverallDraft[1]!
      const width = 2 * perpDistanceToLineThroughPoints(w[0], w[1], t0[0], t0[1], t1[0], t1[1])
      const p = slotParamsFromOverallTips(t0[0], t0[1], t1[0], t1[1], width)
      if (!p) {
        onSketchHint?.('Slot (overall): width must not exceed tip-to-tip distance; click farther from the axis.')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [
          ...design.entities,
          {
            id,
            kind: 'slot',
            cx: p.cx,
            cy: p.cy,
            length: p.length,
            width: p.width,
            rotation: p.rotation
          }
        ]
      })
      setSlotOverallDraft([])
      setSlotOverallWidthHover(null)
      onSketchHint?.('Slot (overall) placed.')
      return
    }

    if (activeTool === 'line') {
      if (!lineStart) {
        setLineStart(w)
        lineDimFocused.current = false
        return
      }
      commitOpenPolylineSegment(lineStart, w)
      setLineStart(null)
      setLineHover(null)
      onSketchHint?.('Line segment placed.')
      return
    }

    if (activeTool === 'circle_2pt') {
      if (!circle2ptStart) {
        setCircle2ptStart(w)
        return
      }
      const g = circleFromDiameterEndpoints(circle2ptStart[0], circle2ptStart[1], w[0], w[1])
      if (!g || g.r < 0.5) {
        onSketchHint?.('Circle (2 pt): pick two distinct points for diameter.')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [...design.entities, { id, kind: 'circle', cx: g.cx, cy: g.cy, r: g.r }]
      })
      setCircle2ptStart(null)
      setCircle2ptHover(null)
      return
    }

    if (activeTool === 'circle_3pt') {
      if (circle3Draft.length === 0) {
        setCircle3Draft([w])
        return
      }
      if (circle3Draft.length === 1) {
        setCircle3Draft([circle3Draft[0]!, w])
        return
      }
      const p0 = circle3Draft[0]!
      const p1 = circle3Draft[1]!
      const p2 = w
      const circ = circleThroughThreePoints(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1])
      if (!circ || circ.r < 1e-6) {
        onSketchHint?.('Circle (3 pt): points must not be collinear.')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [...design.entities, { id, kind: 'circle', cx: circ.ox, cy: circ.oy, r: circ.r }]
      })
      setCircle3Draft([])
      setCircle3Hover(null)
      return
    }

    if (activeTool === 'rect_3pt') {
      if (rect3Draft.length === 0) {
        setRect3Draft([w])
        return
      }
      if (rect3Draft.length === 1) {
        const ax = rect3Draft[0]![0]
        const ay = rect3Draft[0]![1]
        if (Math.hypot(w[0] - ax, w[1] - ay) < 0.5) {
          onSketchHint?.('Rect (3 pt): second point must be away from the first.')
          return
        }
        setRect3Draft([rect3Draft[0]!, w])
        return
      }
      const p0 = rect3Draft[0]!
      const p1 = rect3Draft[1]!
      const p2 = w
      const rr = rectFromThreePoints(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1])
      if (!rr || rr.w < 0.5 || rr.h < 0.5) {
        onSketchHint?.('Rect (3 pt): third point must be off the first edge (non-zero height).')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [
          ...design.entities,
          { id, kind: 'rect', cx: rr.cx, cy: rr.cy, w: rr.w, h: rr.h, rotation: rr.rotation }
        ]
      })
      setRect3Draft([])
      setRect3Hover(null)
      return
    }

    if (activeTool === 'ellipse') {
      if (ellipseDraft.length === 0) {
        setEllipseDraft([w])
        return
      }
      if (ellipseDraft.length === 1) {
        const a = ellipseDraft[0]!
        if (Math.hypot(w[0] - a[0], w[1] - a[1]) < 0.5) {
          onSketchHint?.('Ellipse: second point must be away from center.')
          return
        }
        setEllipseDraft([ellipseDraft[0]!, w])
        return
      }
      const c = ellipseDraft[0]!
      const maj = ellipseDraft[1]!
      const g = ellipseFromCenterMajorMinor(c[0], c[1], maj[0], maj[1], w[0], w[1])
      if (!g) {
        onSketchHint?.('Ellipse: third pick must define a non-zero minor axis.')
        return
      }
      const id = crypto.randomUUID()
      onDesignChange({
        ...design,
        entities: [
          ...design.entities,
          { id, kind: 'ellipse', cx: c[0], cy: c[1], rx: g.rx, ry: g.ry, rotation: g.rotation }
        ]
      })
      setEllipseDraft([])
      setEllipseHover(null)
      onSketchHint?.('Ellipse placed.')
      return
    }

    if (activeTool === 'spline_fit') {
      setSplineFitDraft((d) => [...d, w])
      return
    }
    if (activeTool === 'spline_cp') {
      setSplineCpDraft((d) => [...d, w])
      return
    }

    if (activeTool === 'move_sk') {
      if (xformSelectionIds.length > 0) {
        if (xformDraft.length === 0) {
          setXformDraft([w])
          return
        }
        const a = xformDraft[0]!
        const dx = w[0] - a[0]
        const dy = w[1] - a[1]
        onDesignChange(translateSketchPoints(design, dx, dy, new Set(xformSelectionIds)))
        setXformDraft([])
        onSketchHint?.('Selection moved.')
        return
      }
      if (xformDraft.length === 0) {
        setXformDraft([w])
        return
      }
      const a = xformDraft[0]!
      const dx = w[0] - a[0]
      const dy = w[1] - a[1]
      onDesignChange(translateSketch(design, dx, dy))
      setXformDraft([])
      onSketchHint?.('Sketch moved.')
      return
    }
    if (activeTool === 'rotate_sk') {
      if (xformSelectionIds.length > 0) {
        if (xformDraft.length === 0) {
          setXformDraft([w])
          return
        }
        const c = xformDraft[0]!
        onDesignChange(rotateSketchPointsAround(design, c[0], c[1], sketchRotateDeg, new Set(xformSelectionIds)))
        setXformDraft([])
        onSketchHint?.(`Selection rotated ${sketchRotateDeg}°.`)
        return
      }
      if (xformDraft.length === 0) {
        setXformDraft([w])
        return
      }
      const c = xformDraft[0]!
      onDesignChange(rotateSketchAround(design, c[0], c[1], sketchRotateDeg))
      setXformDraft([])
      onSketchHint?.(`Sketch rotated ${sketchRotateDeg}°.`)
      return
    }
    if (activeTool === 'scale_sk') {
      if (xformSelectionIds.length > 0) {
        if (xformDraft.length === 0) {
          setXformDraft([w])
          return
        }
        const c = xformDraft[0]!
        onDesignChange(scaleSketchPointsAround(design, c[0], c[1], sketchScaleFactor, new Set(xformSelectionIds)))
        setXformDraft([])
        onSketchHint?.(`Selection scaled ×${sketchScaleFactor}.`)
        return
      }
      if (xformDraft.length === 0) {
        setXformDraft([w])
        return
      }
      const c = xformDraft[0]!
      onDesignChange(scaleSketchAround(design, c[0], c[1], sketchScaleFactor))
      setXformDraft([])
      onSketchHint?.(`Sketch scaled ×${sketchScaleFactor}.`)
      return
    }
    if (activeTool === 'mirror_sk') {
      if (xformSelectionIds.length > 0) {
        if (xformDraft.length === 0) {
          setXformDraft([w])
          return
        }
        const a = xformDraft[0]!
        onDesignChange(
          mirrorSketchPointsAcrossLine(design, a[0], a[1], w[0], w[1], new Set(xformSelectionIds))
        )
        setXformDraft([])
        onSketchHint?.('Selection mirrored across axis.')
        return
      }
      if (xformDraft.length === 0) {
        setXformDraft([w])
        return
      }
      const a = xformDraft[0]!
      onDesignChange(mirrorSketchAcrossLine(design, a[0], a[1], w[0], w[1]))
      setXformDraft([])
      onSketchHint?.('Sketch mirrored across axis.')
      return
    }

    if (activeTool === 'polyline') {
      setPolyDraft((d) => [...d, w])
      return
    }
    if (activeTool === 'rect') {
      setDrag({ kind: 'rect', a: w, b: w })
      return
    }
    if (activeTool === 'circle') {
      setDrag({ kind: 'circle', c: w, r: 0 })
      return
    }
    if (activeTool === 'arc') {
      setArcDraft((d) => {
        if (d.length === 0) return [w]
        if (d.length === 1) return [d[0]!, w]
        const p0 = d[0]!
        const p1 = d[1]!
        const p2 = w
        if (!sampleArcThroughThreePoints(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], 8)) {
          return d
        }
        const idA = crypto.randomUUID()
        const idB = crypto.randomUUID()
        const idC = crypto.randomUUID()
        const eid = crypto.randomUUID()
        const nextPoints = {
          ...design.points,
          [idA]: { x: p0[0], y: p0[1] },
          [idB]: { x: p1[0], y: p1[1] },
          [idC]: { x: p2[0], y: p2[1] }
        }
        onDesignChange({
          ...design,
          points: nextPoints,
          entities: [
            ...design.entities,
            {
              id: eid,
              kind: 'arc',
              startId: idA,
              viaId: idB,
              endId: idC,
              ...(arcCloseProfile ? { closed: true as const } : {})
            }
          ]
        })
        return []
      })
    }
    if (activeTool === 'arc_center') {
      setArcDraft((d) => {
        if (d.length === 0) return [w]
        if (d.length === 1) return [d[0]!, w]
        const c0 = d[0]!
        const s0 = d[1]!
        const via = arcViaForCenterStartEnd(c0[0], c0[1], s0[0], s0[1], w[0], w[1])
        if (!via || !sampleCenterStartEndArc(c0[0], c0[1], s0[0], s0[1], w[0], w[1], 8)) {
          return d
        }
        const r = Math.hypot(s0[0] - c0[0], s0[1] - c0[1])
        const vex = w[0] - c0[0]
        const vey = w[1] - c0[1]
        const vlen = Math.hypot(vex, vey)
        const px = c0[0] + (vex / vlen) * r
        const py = c0[1] + (vey / vlen) * r
        const idA = crypto.randomUUID()
        const idB = crypto.randomUUID()
        const idC = crypto.randomUUID()
        const eid = crypto.randomUUID()
        const nextPoints = {
          ...design.points,
          [idA]: { x: s0[0], y: s0[1] },
          [idB]: { x: via[0], y: via[1] },
          [idC]: { x: px, y: py }
        }
        onDesignChange({
          ...design,
          points: nextPoints,
          entities: [
            ...design.entities,
            {
              id: eid,
              kind: 'arc',
              startId: idA,
              viaId: idB,
              endId: idC,
              ...(arcCloseProfile ? { closed: true as const } : {})
            }
          ]
        })
        return []
      })
    }
  }

  function onMouseMove(ev: React.MouseEvent) {
    const c = ref.current
    if (!c) return
    if (panRef.current) {
      const dCanvasX = ev.clientX - panRef.current.sx
      const dCanvasY = ev.clientY - panRef.current.sy
      const dx = dCanvasX / scale
      const ddy = -dCanvasY / scale
      setOx(panRef.current.ox - dx)
      setOy(panRef.current.oy - ddy)
      return
    }
    const [lx, ly] = clientToCanvasLocal(ev.clientX, ev.clientY, c)
    const view = viewportSize()
    const raw = screenToWorld(lx, ly, view.w, view.h, scale, ox, oy)
    const p: [number, number] = [snap(raw[0], gridMm), snap(raw[1], gridMm)]

    if (constraintPickActive && (onConstraintPointPick || onConstraintSegmentPick)) {
      setConstraintHover(probeConstraintPick(raw[0], raw[1]))
    } else {
      setConstraintHover(null)
    }
    if (constraintEntityPickActive && onConstraintEntityPick) {
      const tol = Math.max(2, 10 / Math.max(scale, 0.05))
      const hit = pickNearestCircularEntityId(design, raw[0], raw[1], tol)
      setEntityHoverId(hit?.entityId ?? null)
    } else {
      setEntityHoverId(null)
    }

    if (drag?.kind === 'rect') {
      if (!rectDimFocused.current) {
        setDrag({ ...drag, b: p })
      }
    } else if (drag?.kind === 'circle') {
      if (!circleDimFocused.current) {
        const dx = p[0] - drag.c[0]
        const dy = p[1] - drag.c[1]
        const r = Math.max(0.5, Math.hypot(dx, dy))
        setDrag({ ...drag, r })
      }
    } else if ((activeTool === 'arc' || activeTool === 'arc_center') && arcDraft.length === 2) {
      setArcHover(p)
    } else if (activeTool === 'line' && lineStart) {
      setLineHover(p)
    } else if (activeTool === 'circle_2pt' && circle2ptStart) {
      setCircle2ptHover(p)
    } else if (activeTool === 'circle_3pt' && circle3Draft.length === 2) {
      setCircle3Hover(p)
    } else if (activeTool === 'rect_3pt' && rect3Draft.length === 2) {
      setRect3Hover(p)
    } else if (activeTool === 'ellipse' && ellipseDraft.length === 2) {
      setEllipseHover(p)
    } else if (activeTool === 'polygon' && polygonCenter) {
      setPolygonHover(p)
    } else if (activeTool === 'slot_center' && slotCenterDraft.length === 2) {
      setSlotWidthHover(p)
    } else if (activeTool === 'slot_overall' && slotOverallDraft.length === 2) {
      setSlotOverallWidthHover(p)
    }
  }

  function onMouseUp(ev: React.MouseEvent) {
    if (ev.button === 1 || ev.button === 0) {
      panRef.current = null
    }
    if (ev.button !== 0) return
    if (drag?.kind === 'rect') {
      finalizeRectDrag()
    }
    if (drag?.kind === 'circle') {
      finalizeCircleDrag()
    }
  }

  function closePolyline() {
    if (polyDraft.length < 3) return
    const ids = polyDraft.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    polyDraft.forEach((pt, i) => {
      nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
    })
    const id = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id, kind: 'polyline', pointIds: ids, closed: true }]
    })
    setPolyDraft([])
  }

  function closeSplineFitLoop() {
    if (splineFitDraft.length < 3) return
    const ids = splineFitDraft.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    splineFitDraft.forEach((pt, i) => {
      nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
    })
    const id = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id, kind: 'spline_fit', pointIds: ids, closed: true }]
    })
    setSplineFitDraft([])
    onSketchHint?.('Closed spline (fit) placed.')
  }

  function finishSplineFitOpen() {
    if (splineFitDraft.length < 3) return
    const ids = splineFitDraft.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    splineFitDraft.forEach((pt, i) => {
      nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
    })
    const id = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id, kind: 'spline_fit', pointIds: ids, closed: false }]
    })
    setSplineFitDraft([])
    onSketchHint?.('Open spline (fit) placed.')
  }

  function closeSplineCpLoop() {
    if (splineCpDraft.length < 4) return
    const ids = splineCpDraft.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    splineCpDraft.forEach((pt, i) => {
      nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
    })
    const id = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id, kind: 'spline_cp', pointIds: ids, closed: true }]
    })
    setSplineCpDraft([])
    onSketchHint?.('Closed spline (control) placed.')
  }

  function finishSplineCpOpen() {
    if (splineCpDraft.length < 4) return
    const ids = splineCpDraft.map(() => crypto.randomUUID())
    const nextPoints = { ...design.points }
    splineCpDraft.forEach((pt, i) => {
      nextPoints[ids[i]!] = { x: pt[0], y: pt[1] }
    })
    const id = crypto.randomUUID()
    onDesignChange({
      ...design,
      points: nextPoints,
      entities: [...design.entities, { id, kind: 'spline_cp', pointIds: ids, closed: false }]
    })
    setSplineCpDraft([])
    onSketchHint?.('Open spline (control) placed.')
  }

  function cancelPolyline() {
    setPolyDraft([])
  }

  function cancelArcDraft() {
    setArcDraft([])
    setArcHover(null)
  }

  function cancelCircle3Draft() {
    setCircle3Draft([])
    setCircle3Hover(null)
  }

  function cancelRect3Draft() {
    setRect3Draft([])
    setRect3Hover(null)
  }

  function cancelPolygonDraft() {
    setPolygonCenter(null)
    setPolygonHover(null)
  }

  function cancelSlotCenterDraft() {
    setSlotCenterDraft([])
    setSlotWidthHover(null)
  }

  function cancelSlotOverallDraft() {
    setSlotOverallDraft([])
    setSlotOverallWidthHover(null)
  }

  return (
    <div className="sketch-wrap">
      <canvas
        ref={ref}
        width={width}
        height={height}
        className="sketch-canvas"
        style={{
          cursor:
            activeTool === 'trim' ||
            activeTool === 'fillet' ||
            activeTool === 'chamfer' ||
            activeTool === 'split' ||
            activeTool === 'break' ||
            activeTool === 'extend' ||
            activeTool === 'point' ||
            activeTool === 'polygon' ||
            activeTool === 'slot_center' ||
            activeTool === 'slot_overall'
              ? 'crosshair'
              : constraintPickActive && (onConstraintPointPick || onConstraintSegmentPick)
                ? constraintHover
                  ? 'pointer'
                  : 'crosshair'
                : constraintEntityPickActive && onConstraintEntityPick
                  ? entityHoverId
                    ? 'pointer'
                    : 'crosshair'
                : undefined
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          panRef.current = null
          setArcHover(null)
          setLineHover(null)
          setCircle2ptHover(null)
          setCircle3Hover(null)
          setRect3Hover(null)
          setPolygonHover(null)
          setSlotWidthHover(null)
          setSlotOverallWidthHover(null)
          setEllipseHover(null)
          setConstraintHover(null)
          setEntityHoverId(null)
        }}
      />
      {activeTool === 'line' && lineStart && (
        <div
          className="sketch-numeric-popover"
          role="group"
          aria-label="Line segment dimensions"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyLineNumeric()
            }
          }}
        >
          <span className="sketch-numeric-popover__title">ΔX / ΔY (mm)</span>
          <label className="sketch-numeric-popover__field">
            <span>ΔX</span>
            <input
              type="text"
              inputMode="decimal"
              className="sketch-numeric-popover__input"
              value={lineDeltaX}
              onChange={(e) => setLineDeltaX(e.target.value)}
              onFocus={() => {
                lineDimFocused.current = true
              }}
              onBlur={() => {
                lineDimFocused.current = false
              }}
            />
          </label>
          <label className="sketch-numeric-popover__field">
            <span>ΔY</span>
            <input
              type="text"
              inputMode="decimal"
              className="sketch-numeric-popover__input"
              value={lineDeltaY}
              onChange={(e) => setLineDeltaY(e.target.value)}
              onFocus={() => {
                lineDimFocused.current = true
              }}
              onBlur={() => {
                lineDimFocused.current = false
              }}
            />
          </label>
          <button type="button" className="primary sketch-numeric-popover__apply" onClick={applyLineNumeric}>
            Apply
          </button>
        </div>
      )}
      {activeTool === 'rect' && drag?.kind === 'rect' && (
        <div
          className="sketch-numeric-popover"
          role="group"
          aria-label="Rectangle dimensions"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finalizeRectDrag()
            }
          }}
        >
          <span className="sketch-numeric-popover__title">Width × height (mm)</span>
          <label className="sketch-numeric-popover__field">
            <span>W</span>
            <input
              type="text"
              inputMode="decimal"
              className="sketch-numeric-popover__input"
              value={rectWIn}
              onChange={(e) => setRectWIn(e.target.value)}
              onFocus={() => {
                rectDimFocused.current = true
              }}
              onBlur={() => {
                rectDimFocused.current = false
                syncRectDragFromInputs()
              }}
            />
          </label>
          <label className="sketch-numeric-popover__field">
            <span>H</span>
            <input
              type="text"
              inputMode="decimal"
              className="sketch-numeric-popover__input"
              value={rectHIn}
              onChange={(e) => setRectHIn(e.target.value)}
              onFocus={() => {
                rectDimFocused.current = true
              }}
              onBlur={() => {
                rectDimFocused.current = false
                syncRectDragFromInputs()
              }}
            />
          </label>
          <button type="button" className="primary sketch-numeric-popover__apply" onClick={finalizeRectDrag}>
            Place
          </button>
        </div>
      )}
      {activeTool === 'circle' && drag?.kind === 'circle' && (
        <div
          className="sketch-numeric-popover"
          role="group"
          aria-label="Circle radius"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finalizeCircleDrag()
            }
          }}
        >
          <span className="sketch-numeric-popover__title">Radius (mm)</span>
          <label className="sketch-numeric-popover__field">
            <span>R</span>
            <input
              type="text"
              inputMode="decimal"
              className="sketch-numeric-popover__input"
              value={circleRIn}
              onChange={(e) => {
                const v = e.target.value
                setCircleRIn(v)
                const pr = Number.parseFloat(v)
                if (Number.isFinite(pr) && pr > 0) {
                  setDrag((d) =>
                    d?.kind === 'circle' ? { ...d, r: Math.max(0.5, snap(pr, gridMm)) } : d
                  )
                }
              }}
              onFocus={() => {
                circleDimFocused.current = true
              }}
              onBlur={() => {
                circleDimFocused.current = false
              }}
            />
          </label>
          <button type="button" className="primary sketch-numeric-popover__apply" onClick={finalizeCircleDrag}>
            Place
          </button>
        </div>
      )}
      {activeTool === 'point' && (
        <div className="sketch-toolbar">
          <span className="msg">Click to add a construction point (stored in the sketch point map).</span>
        </div>
      )}
      {activeTool === 'slot_center' && (
        <div className="sketch-toolbar">
          <span className="msg">Two cap centers, then a third pick for slot width (perp. to axis).</span>
          <button
            type="button"
            className="secondary"
            onClick={cancelSlotCenterDraft}
            disabled={slotCenterDraft.length === 0}
          >
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'slot_overall' && (
        <div className="sketch-toolbar">
          <span className="msg">
            Two tips (overall length along axis), then a third pick for width — stored as center-to-center length.
          </span>
          <button
            type="button"
            className="secondary"
            onClick={cancelSlotOverallDraft}
            disabled={slotOverallDraft.length === 0}
          >
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'polygon' && (
        <div className="sketch-toolbar">
          <label className="msg label--inline-flex-6">
            Sides
            <input
              type="number"
              min={3}
              max={128}
              value={polygonSides}
              onChange={(ev) => {
                const v = Number(ev.target.value)
                if (!Number.isFinite(v)) return
                setPolygonSides(Math.max(3, Math.min(128, Math.floor(v))))
              }}
              className="input-w-56"
            />
          </label>
          <span className="msg">Center, then corner — closed polyline.</span>
          <button type="button" className="secondary" onClick={cancelPolygonDraft} disabled={!polygonCenter}>
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'line' && (
        <div className="sketch-toolbar">
          <span className="msg">Click start, then end — each segment is an open polyline.</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLineStart(null)
              setLineHover(null)
              lineDimFocused.current = false
            }}
            disabled={!lineStart}
          >
            Cancel segment
          </button>
        </div>
      )}
      {activeTool === 'circle_2pt' && (
        <div className="sketch-toolbar">
          <span className="msg">Click two points on opposite ends of the diameter.</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setCircle2ptStart(null)
              setCircle2ptHover(null)
            }}
            disabled={!circle2ptStart}
          >
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'circle_3pt' && (
        <div className="sketch-toolbar">
          <span className="msg">Three non-collinear points on the circle (circumcircle).</span>
          <button type="button" className="secondary" onClick={cancelCircle3Draft} disabled={circle3Draft.length === 0}>
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'rect_3pt' && (
        <div className="sketch-toolbar">
          <span className="msg">First edge (two clicks), then third point for rectangle height.</span>
          <button type="button" className="secondary" onClick={cancelRect3Draft} disabled={rect3Draft.length === 0}>
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'ellipse' && (
        <div className="sketch-toolbar">
          <span className="msg">Center → major axis → minor extent (perp. distance).</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEllipseDraft([])
              setEllipseHover(null)
            }}
            disabled={ellipseDraft.length === 0}
          >
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'spline_fit' && (
        <div className="sketch-toolbar">
          <button type="button" className="secondary" onClick={closeSplineFitLoop} disabled={splineFitDraft.length < 3}>
            Close loop
          </button>
          <button type="button" className="secondary" onClick={finishSplineFitOpen} disabled={splineFitDraft.length < 3}>
            Finish open
          </button>
          <button type="button" className="secondary" onClick={() => setSplineFitDraft([])} disabled={splineFitDraft.length === 0}>
            Clear
          </button>
        </div>
      )}
      {activeTool === 'spline_cp' && (
        <div className="sketch-toolbar">
          <button type="button" className="secondary" onClick={closeSplineCpLoop} disabled={splineCpDraft.length < 4}>
            Close loop
          </button>
          <button type="button" className="secondary" onClick={finishSplineCpOpen} disabled={splineCpDraft.length < 4}>
            Finish open
          </button>
          <button type="button" className="secondary" onClick={() => setSplineCpDraft([])} disabled={splineCpDraft.length === 0}>
            Clear
          </button>
        </div>
      )}
      {(activeTool === 'move_sk' ||
        activeTool === 'rotate_sk' ||
        activeTool === 'scale_sk' ||
        activeTool === 'mirror_sk') && (
        <div className="sketch-toolbar">
          <span className="msg">
            {activeTool === 'move_sk' &&
              (xformSelectionIds.length > 0
                ? 'Move: Alt+click toggles vertices · Esc clears · two-click moves selection only.'
                : 'Move: two-click moves entire sketch · Alt+click vertices to move selection only.')}
            {activeTool === 'rotate_sk' &&
              (xformSelectionIds.length > 0
                ? `Rotate selection: pivot · ${sketchRotateDeg}° · Alt+click vertices · Esc clears selection.`
                : `Rotate sketch: click pivot (${sketchRotateDeg}°) · Alt+click vertices for selection-only.`)}
            {activeTool === 'scale_sk' &&
              (xformSelectionIds.length > 0
                ? `Scale selection: pivot · ×${sketchScaleFactor} · Alt+click vertices · Esc clears.`
                : `Scale sketch: click pivot (×${sketchScaleFactor}) · Alt+click vertices for selection-only.`)}
            {activeTool === 'mirror_sk' &&
              (xformSelectionIds.length > 0
                ? 'Mirror selection: axis A→B · Alt+click vertices · Esc clears.'
                : 'Mirror sketch: axis A→B · Alt+click vertices for selection-only.')}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => setXformSelectionIds([])}
            disabled={xformSelectionIds.length === 0}
          >
            Clear selection
          </button>
          <button type="button" className="secondary" onClick={() => setXformDraft([])} disabled={xformDraft.length === 0}>
            Clear
          </button>
        </div>
      )}
      {activeTool === 'polyline' && (
        <div className="sketch-toolbar">
          <button type="button" className="secondary" onClick={closePolyline} disabled={polyDraft.length < 3}>
            Close loop
          </button>
          <button type="button" className="secondary" onClick={cancelPolyline}>
            Cancel
          </button>
        </div>
      )}
      {activeTool === 'arc' && (
        <div className="sketch-toolbar">
          <span className="msg mr-2">Start → point on arc → end (non-collinear)</span>
          <label className="msg mr-2">
            <input
              type="checkbox"
              checked={arcCloseProfile}
              onChange={(ev) => setArcCloseProfile(ev.target.checked)}
            />{' '}
            Closed profile (chord)
          </label>
          <button type="button" className="secondary" onClick={cancelArcDraft} disabled={arcDraft.length === 0}>
            Cancel arc
          </button>
        </div>
      )}
      {activeTool === 'arc_center' && (
        <div className="sketch-toolbar">
          <span className="msg mr-2">Center → start (radius) → end (minor arc on that circle)</span>
          <label className="msg mr-2">
            <input
              type="checkbox"
              checked={arcCloseProfile}
              onChange={(ev) => setArcCloseProfile(ev.target.checked)}
            />{' '}
            Closed profile (chord)
          </label>
          <button type="button" className="secondary" onClick={cancelArcDraft} disabled={arcDraft.length === 0}>
            Cancel arc
          </button>
        </div>
      )}
      {activeTool === 'fillet' && (
        <div className="sketch-toolbar">
          <span className="msg">
            {filletFirst
              ? 'Second click: other edge at the same corner (same polyline, consecutive segment).'
              : 'First click: one polyline edge at the corner to round.'}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setFilletFirst(null)
              onSketchHint?.('Fillet first edge cleared.')
            }}
            disabled={!filletFirst}
          >
            Clear first edge
          </button>
        </div>
      )}
      {activeTool === 'chamfer' && (
        <div className="sketch-toolbar">
          <span className="msg">
            {chamferFirst
              ? 'Second click: other edge at the same corner (same polyline, consecutive segment).'
              : 'First click: one polyline edge at the corner to chamfer.'}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setChamferFirst(null)
              onSketchHint?.('Chamfer first edge cleared.')
            }}
            disabled={!chamferFirst}
          >
            Clear first edge
          </button>
        </div>
      )}
      {activeTool === 'trim' && (
        <div className="sketch-toolbar">
          <span className="msg">
            {trimCutter
              ? 'Second click: target edge. Cutter: polyline → infinite line; arc → full circle. Click the side to discard.'
              : 'First click: cutting edge (polyline segment or arc).'}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setTrimCutter(null)
              onSketchHint?.('Trim cutter cleared.')
            }}
            disabled={!trimCutter}
          >
            Clear cutter
          </button>
        </div>
      )}
      {activeTool === 'split' && (
        <div className="sketch-toolbar">
          <span className="msg">Click a polyline edge or arc to split at the clicked location.</span>
        </div>
      )}
      {activeTool === 'break' && (
        <div className="sketch-toolbar">
          <span className="msg">Click a polyline edge or arc to break into two disconnected entities.</span>
        </div>
      )}
      {activeTool === 'extend' && (
        <div className="sketch-toolbar">
          <span className="msg">
            {extendCutter
              ? 'Second click: target edge to extend (click near the end you want to extend).'
              : 'First click: boundary edge or arc to extend toward.'}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => setExtendCutter(null)}
            disabled={!extendCutter}
          >
            Clear boundary
          </button>
        </div>
      )}
    </div>
  )
}
