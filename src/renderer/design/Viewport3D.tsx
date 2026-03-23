import { Canvas } from '@react-three/fiber'
import { Bounds, Grid, OrbitControls } from '@react-three/drei'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { measureMarkerRadiusMmFromGeometry } from './viewport3d-bounds'
import { Viewport3DDatumPlanes, type SketchDatumId } from './Viewport3DDatumPlanes'

export type MeasureMarker = { x: number; y: number; z: number }

type FacePick = {
  origin: [number, number, number]
  normal: [number, number, number]
  xAxis: [number, number, number]
}

type NavMode = 'orbit' | 'pan' | 'zoom'

type Props = {
  geometry: THREE.BufferGeometry | null
  /**
   * 3D pick modes are mutually exclusive in the parent (`DesignWorkspace` viewport reducer):
   * measure (Shift+click), project (plain click), face pick. `Solid` evaluates handlers in that order.
   */
  /** When true, **Shift+click** the solid to pick world points (see `onMeasurePoint`). */
  measureMode?: boolean
  onMeasurePoint?: (p: THREE.Vector3) => void
  /** When true, plain click on the solid reports a world point for sketch **Project** (see `onProjectSketchPoint`). */
  projectSketchMode?: boolean
  onProjectSketchPoint?: (p: THREE.Vector3) => void
  /** When true, plain click picks a model face for sketch placement. */
  facePickMode?: boolean
  onPickFace?: (pick: FacePick) => void
  measureMarkers?: MeasureMarker[]
  /** World Y (mm) — clip geometry below this plane when `sectionClipY` is finite. */
  sectionClipY?: number | null
  /** Sketch tab + model phase: allow clicking tinted datum planes (with solid / measure / face pick off). */
  datumPlanePickMode?: boolean
  sketchPlaneIsFace?: boolean
  activeDatum?: SketchDatumId | null
  onDatumPlaneSelect?: (d: SketchDatumId) => void
}

const HOME_POS: [number, number, number] = [120, 90, 120]

/** Geometry is already placed in world space (see `sketchPreviewPlacementMatrix`). */
const Solid = memo(function Solid({
  geometry,
  measureMode,
  onMeasurePoint,
  projectSketchMode,
  onProjectSketchPoint,
  facePickMode,
  onPickFace,
  clipPlane
}: {
  geometry: THREE.BufferGeometry
  measureMode?: boolean
  onMeasurePoint?: (p: THREE.Vector3) => void
  projectSketchMode?: boolean
  onProjectSketchPoint?: (p: THREE.Vector3) => void
  facePickMode?: boolean
  onPickFace?: (pick: FacePick) => void
  clipPlane?: THREE.Plane | null
}) {
  return (
    <mesh geometry={geometry} position={[0, 0, 0]}
      onClick={(e) => {
        if (measureMode && onMeasurePoint) {
          if (!e.shiftKey) return
          e.stopPropagation()
          onMeasurePoint(e.point.clone())
          return
        }
        if (projectSketchMode && onProjectSketchPoint) {
          e.stopPropagation()
          onProjectSketchPoint(e.point.clone())
          return
        }
        if (!facePickMode || !onPickFace) return
        e.stopPropagation()
        const worldNormal = e.face?.normal.clone().transformDirection(e.object.matrixWorld).normalize()
        if (!worldNormal || worldNormal.lengthSq() < 1e-8) return
        let xAxis = new THREE.Vector3(1, 0, 0)
        if (Math.abs(worldNormal.dot(xAxis)) > 0.97) xAxis.set(0, 1, 0)
        xAxis.addScaledVector(worldNormal, -xAxis.dot(worldNormal)).normalize()
        if (xAxis.lengthSq() < 1e-8) xAxis.set(0, 0, 1)
        onPickFace({
          origin: [e.point.x, e.point.y, e.point.z],
          normal: [worldNormal.x, worldNormal.y, worldNormal.z],
          xAxis: [xAxis.x, xAxis.y, xAxis.z]
        })
      }}
    >
      <meshStandardMaterial
        color="#a855f7"
        metalness={0.12}
        roughness={0.42}
        side={THREE.DoubleSide}
        clippingPlanes={clipPlane ? [clipPlane] : undefined}
        clipShadows={!!clipPlane}
      />
    </mesh>
  )
})

const Markers = memo(function Markers({ markers, radiusMm }: { markers: MeasureMarker[]; radiusMm: number }) {
  return (
    <group>
      {markers.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, m.z]}>
          <sphereGeometry args={[radiusMm, 16, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#78350f" emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  )
})

function applyStandardView(controls: OrbitControlsImpl, preset: 'top' | 'front' | 'back' | 'right' | 'left' | 'iso') {
  const cam = controls.object as THREE.PerspectiveCamera
  const t = controls.target
  const dist = Math.max(80, cam.position.distanceTo(t))

  cam.up.set(0, 1, 0)

  switch (preset) {
    case 'top':
      cam.position.set(t.x, t.y + dist, t.z)
      cam.up.set(0, 0, -1)
      cam.lookAt(t)
      break
    case 'front':
      cam.position.set(t.x, t.y, t.z + dist)
      cam.lookAt(t)
      break
    case 'back':
      cam.position.set(t.x, t.y, t.z - dist)
      cam.lookAt(t)
      break
    case 'right':
      cam.position.set(t.x + dist, t.y, t.z)
      cam.lookAt(t)
      break
    case 'left':
      cam.position.set(t.x - dist, t.y, t.z)
      cam.lookAt(t)
      break
    case 'iso': {
      const d = new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(dist)
      cam.position.set(t.x + d.x, t.y + d.y, t.z + d.z)
      cam.up.set(0, 1, 0)
      cam.lookAt(t)
      break
    }
    default:
      break
  }
  controls.update()
}

function ViewportHud({
  controlsRef,
  navMode,
  onNavMode
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  navMode: NavMode
  onNavMode: (m: NavMode) => void
}) {
  const run = useCallback(
    (fn: (c: OrbitControlsImpl) => void) => {
      const c = controlsRef.current
      if (c) fn(c)
    },
    [controlsRef]
  )

  return (
    <div className="viewport-3d__hud">
      <div className="viewport-3d__viewcube" role="group" aria-label="Standard views">
        <button type="button" className="viewport-3d__cube-btn" onClick={() => run((c) => applyStandardView(c, 'iso'))} title="Isometric">
          ISO
        </button>
        <button type="button" className="viewport-3d__cube-btn" onClick={() => run((c) => applyStandardView(c, 'top'))} title="Top">
          T
        </button>
        <button type="button" className="viewport-3d__cube-btn" onClick={() => run((c) => applyStandardView(c, 'front'))} title="Front">
          F
        </button>
        <button type="button" className="viewport-3d__cube-btn" onClick={() => run((c) => applyStandardView(c, 'right'))} title="Right">
          R
        </button>
        <button
          type="button"
          className="viewport-3d__cube-btn viewport-3d__cube-btn--home"
          onClick={() =>
            run((c) => {
              const cam = c.object as THREE.PerspectiveCamera
              cam.position.set(HOME_POS[0], HOME_POS[1], HOME_POS[2])
              c.target.set(0, 0, 0)
              cam.up.set(0, 1, 0)
              c.update()
            })
          }
          title="Home view"
        >
          ⌂
        </button>
      </div>

      <div className="viewport-3d__navstrip" role="toolbar" aria-label="Viewport navigation">
        <button
          type="button"
          className={`viewport-3d__nav-btn${navMode === 'orbit' ? ' viewport-3d__nav-btn--active' : ''}`}
          onClick={() => onNavMode('orbit')}
          title="Orbit (rotate)"
        >
          Orbit
        </button>
        <button
          type="button"
          className={`viewport-3d__nav-btn${navMode === 'pan' ? ' viewport-3d__nav-btn--active' : ''}`}
          onClick={() => onNavMode('pan')}
          title="Pan"
        >
          Pan
        </button>
        <button
          type="button"
          className={`viewport-3d__nav-btn${navMode === 'zoom' ? ' viewport-3d__nav-btn--active' : ''}`}
          onClick={() => onNavMode('zoom')}
          title="Zoom only"
        >
          Zoom
        </button>
      </div>
    </div>
  )
}

export function Viewport3D({
  geometry,
  measureMode,
  onMeasurePoint,
  projectSketchMode,
  onProjectSketchPoint,
  facePickMode,
  onPickFace,
  measureMarkers,
  sectionClipY,
  datumPlanePickMode = false,
  sketchPlaneIsFace = false,
  activeDatum = null,
  onDatumPlaneSelect
}: Props) {
  const disposed = useRef<THREE.BufferGeometry | null>(null)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const [navMode, setNavMode] = useState<NavMode>('orbit')

  useEffect(() => {
    return () => {
      disposed.current?.dispose()
    }
  }, [])

  const stable = useMemo(() => {
    disposed.current?.dispose()
    disposed.current = geometry
    return geometry
  }, [geometry])

  const clipPlane = useMemo(() => {
    if (sectionClipY == null || !Number.isFinite(sectionClipY)) return null
    return new THREE.Plane(new THREE.Vector3(0, 1, 0), -sectionClipY)
  }, [sectionClipY])

  const clipping = clipPlane != null

  const gridFade = datumPlanePickMode ? 1.12 : clipping ? 0.92 : 1.05
  const gridCell = datumPlanePickMode ? '#1a1220' : clipping ? '#30253c' : '#2a1f38'

  const measureMarkerRadiusMm = useMemo(() => measureMarkerRadiusMmFromGeometry(stable), [stable])

  const enableRotate = navMode === 'orbit'
  const enablePan = navMode !== 'zoom'
  const enableZoom = true

  return (
    <div className="viewport-3d">
      <Canvas
        camera={{ position: HOME_POS, fov: 45, near: 0.5, far: 8000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, localClippingEnabled: clipping }}
      >
        <color attach="background" args={['#0c0612']} />
        <ambientLight intensity={0.38} />
        <hemisphereLight args={['#c4b5fd', '#1a1024', 0.45]} />
        <directionalLight position={[90, 140, 70]} intensity={1.05} />
        <directionalLight position={[-70, 55, -55]} intensity={0.32} color="#e9d5ff" />
        {stable ? (
          <Bounds fit clip margin={1.32} maxDuration={0.38} key={stable.uuid}>
            <Solid
              geometry={stable}
              measureMode={measureMode}
              onMeasurePoint={onMeasurePoint}
              projectSketchMode={projectSketchMode}
              onProjectSketchPoint={onProjectSketchPoint}
              facePickMode={facePickMode}
              onPickFace={onPickFace}
              clipPlane={clipPlane}
            />
          </Bounds>
        ) : null}
        {measureMarkers && measureMarkers.length > 0 ? (
          <Markers markers={measureMarkers} radiusMm={measureMarkerRadiusMm} />
        ) : null}
        <Grid
          args={[520, 520]}
          cellSize={10}
          sectionSize={50}
          cellColor={gridCell}
          sectionColor={clipping ? '#8b7aad' : '#4c3d63'}
          cellThickness={0.6}
          sectionThickness={clipping ? 1.42 : 1.1}
          fadeDistance={clipping ? 380 : 300}
          fadeStrength={gridFade}
          infiniteGrid
          followCamera
          position={[0, 0, 0]}
        />
        <Viewport3DDatumPlanes
          halfExtentMm={200}
          datumPlanePickMode={datumPlanePickMode}
          sketchPlaneIsFace={sketchPlaneIsFace}
          activeDatum={activeDatum}
          onDatumPlaneSelect={onDatumPlaneSelect}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.085}
          rotateSpeed={0.72}
          zoomSpeed={0.8}
          panSpeed={0.88}
          minDistance={6}
          maxDistance={6000}
          maxPolarAngle={Math.PI / 2 - 0.06}
          minPolarAngle={0.12}
          screenSpacePanning={false}
          enableRotate={enableRotate}
          enablePan={enablePan}
          enableZoom={enableZoom}
        />
      </Canvas>
      <ViewportHud controlsRef={controlsRef} navMode={navMode} onNavMode={setNavMode} />
    </div>
  )
}
