import { Canvas } from '@react-three/fiber'
import { Bounds, Grid, OrbitControls } from '@react-three/drei'
import { memo, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { AssemblyComponent, AssemblyExplodeViewMetadata, AssemblyFile } from '../../shared/assembly-schema'
import {
  explodeOffsetMm
} from '../../shared/assembly-viewport-math'
import { solveAssemblyKinematics } from '../../shared/assembly-kinematics-core'

type LoadedMesh = {
  id: string
  name: string
  geometry: THREE.BufferGeometry
  transform: AssemblyComponent['transform']
  activeIndex: number
}

type SceneMesh = LoadedMesh & { effectiveTransform: AssemblyComponent['transform'] }

type Props = {
  projectDir: string
  asm: AssemblyFile
  explodeFactor: number
  motionRzDeg: number
}

function hashHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 360) / 360
}

const PartMesh = memo(function PartMesh({
  geometry,
  color
}: {
  geometry: THREE.BufferGeometry
  color: string
}) {
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.45} />
    </mesh>
  )
})

function SceneContent({
  items,
  explodeView,
  explodeFactor,
  motionRzDeg
}: {
  items: SceneMesh[]
  explodeView: AssemblyExplodeViewMetadata | undefined
  explodeFactor: number
  motionRzDeg: number
}) {
  const motionR = useMemo(() => (motionRzDeg * Math.PI) / 180, [motionRzDeg])

  return (
    <group rotation={[0, motionR, 0]}>
      {items.map((it) => {
        const [ex, ey, ez] = explodeView
          ? explodeOffsetMm(explodeView.axis, explodeView.stepMm, it.activeIndex, explodeFactor)
          : [0, 0, 0]
        const t = it.effectiveTransform
        const euler = new THREE.Euler(
          (t.rxDeg * Math.PI) / 180,
          (t.ryDeg * Math.PI) / 180,
          (t.rzDeg * Math.PI) / 180,
          'ZYX'
        )
        const c = new THREE.Color().setHSL(hashHue(it.id), 0.55, 0.52)
        return (
          <group key={it.id} position={[t.x + ex, t.y + ey, t.z + ez]} rotation={euler}>
            <PartMesh geometry={it.geometry} color={`#${c.getHexString()}`} />
          </group>
        )
      })}
    </group>
  )
}

export function AssemblyViewport3D({ projectDir, asm, explodeFactor, motionRzDeg }: Props) {
  const [items, setItems] = useState<LoadedMesh[]>([])
  const [loadNote, setLoadNote] = useState<string | null>(null)

  const activeRows = useMemo(() => asm.components.filter((c) => !c.suppressed), [asm.components])

  const solved = useMemo(() => solveAssemblyKinematics(activeRows), [activeRows])

  const sceneItems = useMemo((): SceneMesh[] => {
    return items.map((it) => ({
      ...it,
      effectiveTransform: solved.transforms.get(it.id) ?? it.transform
    }))
  }, [items, solved.transforms])

  const loadKey = useMemo(
    () =>
      activeRows
        .map((c) => `${c.id}:${(c.meshPath ?? '').trim()}`)
        .join('|'),
    [activeRows]
  )

  useEffect(() => {
    let cancelled = false
    const fab = window.fab
    setItems((prev) => {
      for (const p of prev) p.geometry.dispose()
      return []
    })
    const toLoad = activeRows
      .map((c, activeIndex) => ({ c, activeIndex }))
      .filter(({ c }) => c.meshPath != null && c.meshPath.trim() !== '')
    if (toLoad.length === 0) {
      setLoadNote(null)
      return
    }
    setLoadNote('Loading meshes…')
    const loader = new STLLoader()
    void (async () => {
      const next: LoadedMesh[] = []
      const errors: string[] = []
      for (const { c, activeIndex } of toLoad) {
        const mp = c.meshPath!.trim()
        const r = await fab.assemblyReadStlBase64(projectDir, mp)
        if (cancelled) return
        if (!r.ok) {
          errors.push(`${c.name}: ${r.error}`)
          continue
        }
        try {
          const raw = atob(r.base64)
          const buf = new Uint8Array(raw.length)
          for (let k = 0; k < raw.length; k++) buf[k] = raw.charCodeAt(k)
          const geom = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
          geom.computeVertexNormals()
          next.push({
            id: c.id,
            name: c.name,
            geometry: geom,
            transform: c.transform,
            activeIndex
          })
        } catch {
          errors.push(`${c.name}: parse_failed`)
        }
      }
      if (cancelled) {
        for (const x of next) x.geometry.dispose()
        return
      }
      setItems((prev) => {
        for (const p of prev) p.geometry.dispose()
        return next
      })
      if (errors.length && next.length === 0) {
        setLoadNote(errors.slice(0, 3).join(' · ') + (errors.length > 3 ? ' …' : ''))
      } else if (errors.length) {
        setLoadNote(`Some meshes failed: ${errors.slice(0, 2).join(' · ')}${errors.length > 2 ? ' …' : ''}`)
      } else {
        setLoadNote(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectDir, loadKey])

  const explodeView = asm.explodeView

  return (
    <div className="assembly-viewport-3d">
      <div className="viewport-3d">
        <Canvas
          camera={{ position: [180, 120, 180], fov: 45, near: 0.5, far: 20000 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        >
          <color attach="background" args={['#0c0612']} />
          <ambientLight intensity={0.4} />
          <hemisphereLight args={['#c4b5fd', '#1a1024', 0.45]} />
          <directionalLight position={[120, 160, 80]} intensity={1} />
          {sceneItems.length > 0 ? (
            <Bounds fit clip margin={1.25} maxDuration={0.35} key={sceneItems.map((x) => x.id).join(',')}>
              <SceneContent
                items={sceneItems}
                explodeView={explodeView}
                explodeFactor={explodeFactor}
                motionRzDeg={motionRzDeg}
              />
            </Bounds>
          ) : null}
          <Grid
            args={[800, 800]}
            cellSize={10}
            sectionSize={50}
            cellColor="#2a1f38"
            sectionColor="#4c3d63"
            cellThickness={0.6}
            sectionThickness={1.1}
            fadeDistance={400}
            fadeStrength={1.05}
            infiniteGrid
            followCamera
            position={[0, 0, 0]}
          />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.085}
            minDistance={8}
            maxDistance={12000}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minPolarAngle={0.1}
            screenSpacePanning={false}
          />
        </Canvas>
      </div>
      <p className="msg msg--muted msg--fine mt-xs">
        {activeRows.every((c) => !c.meshPath?.trim())
          ? 'Set mesh path (binary STL) on active rows to preview. Interference check still uses saved assembly.json on disk.'
          : loadNote ??
            `${sceneItems.length} mesh(es) — explode uses active row order; keyframes add world +Y rotation; solved joints drive subtree transforms. Violations: ${solved.diagnostics.violations.length}.`}
      </p>
    </div>
  )
}
