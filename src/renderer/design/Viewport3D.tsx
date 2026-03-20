import { Canvas } from '@react-three/fiber'
import { Bounds, Grid, OrbitControls } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { measureMarkerRadiusMmFromGeometry } from './viewport3d-bounds'

export type MeasureMarker = { x: number; y: number; z: number }

type FacePick = {
  origin: [number, number, number]
  normal: [number, number, number]
  xAxis: [number, number, number]
}

type Props = {
  geometry: THREE.BufferGeometry | null
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
}

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

export function Viewport3D({
  geometry,
  measureMode,
  onMeasurePoint,
  projectSketchMode,
  onProjectSketchPoint,
  facePickMode,
  onPickFace,
  measureMarkers,
  sectionClipY
}: Props) {
  const disposed = useRef<THREE.BufferGeometry | null>(null)
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

  const measureMarkerRadiusMm = useMemo(() => measureMarkerRadiusMmFromGeometry(stable), [stable])

  return (
    <div className="viewport-3d">
      <Canvas
        camera={{ position: [120, 90, 120], fov: 45, near: 0.5, far: 8000 }}
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
          cellColor={clipping ? '#30253c' : '#2a1f38'}
          sectionColor={clipping ? '#8b7aad' : '#4c3d63'}
          cellThickness={0.6}
          sectionThickness={clipping ? 1.42 : 1.1}
          fadeDistance={clipping ? 380 : 300}
          fadeStrength={clipping ? 0.92 : 1.05}
          infiniteGrid
          followCamera
          position={[0, 0, 0]}
        />
        <OrbitControls
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
        />
      </Canvas>
    </div>
  )
}
