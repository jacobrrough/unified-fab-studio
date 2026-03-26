import { Canvas } from '@react-three/fiber'
import { Bounds, ContactShadows, Grid, Line, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { buildHeightFieldFromCuttingSegments } from '../../shared/cam-heightfield-2d5'
import { compareToolpathToMachineEnvelope } from '../../shared/cam-machine-envelope'
import {
  buildContiguousPathChains,
  buildToolpathLengthSampler,
  extractToolpathSegmentsFromGcode
} from '../../shared/cam-gcode-toolpath'
import { buildVoxelRemovalFromCuttingSegments } from '../../shared/cam-voxel-removal-proxy'
import type { MachineProfile } from '../../shared/machine-schema'
import type { ManufactureFile, ManufactureOperation } from '../../shared/manufacture-schema'
import { resolveCamToolDiameterMm } from '../../shared/cam-tool-resolve'
import {
  stockBoxDimensionsFromPartBounds,
  triangulateBinaryStl,
  type StlAxisAlignedBounds
} from '../../shared/stl-binary-preview'
import type { ToolLibraryFile } from '../../shared/tool-schema'

/** G-code XYZ → Three.js (X, Y_up, Z) with CNC Z vertical as Three Y. Part STL vertices use the same mapping. */
function gcodeToThree(x: number, y: number, z: number): THREE.Vector3Tuple {
  return [x, z, y]
}

function gcodePointKey(p: { x: number; y: number; z: number }): string {
  return `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`
}

function dedupeGcodePolyline(points: { x: number; y: number; z: number }[]): { x: number; y: number; z: number }[] {
  if (points.length <= 1) return points
  const out: { x: number; y: number; z: number }[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    if (gcodePointKey(p) !== gcodePointKey(out[out.length - 1]!)) out.push(p)
  }
  return out
}

function chainToTubeGeometry(points: THREE.Vector3[], radius: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(points[i]!, points[i + 1]!))
  }
  const tubular = Math.min(512, Math.max(8, (points.length - 1) * 4))
  return new THREE.TubeGeometry(path, tubular, radius, 8, false)
}

function ToolpathMeshTubes({
  chains,
  rapidRadiusMm,
  feedRadiusMm
}: {
  chains: ReturnType<typeof buildContiguousPathChains>
  rapidRadiusMm: number
  feedRadiusMm: number
}): ReactNode {
  const items = useMemo(() => {
    const out: { key: string; geometry: THREE.BufferGeometry; kind: 'rapid' | 'feed' }[] = []
    let k = 0
    for (const chain of chains) {
      const deduped = dedupeGcodePolyline(chain.points)
      if (deduped.length < 2) continue
      const pts = deduped.map((p) => new THREE.Vector3(...gcodeToThree(p.x, p.y, p.z)))
      const r = chain.kind === 'rapid' ? rapidRadiusMm : feedRadiusMm
      const geom = chainToTubeGeometry(pts, r)
      if (geom) {
        out.push({ key: `c-${k++}`, geometry: geom, kind: chain.kind })
      }
    }
    return out
  }, [chains, rapidRadiusMm, feedRadiusMm])

  return (
    <group>
      {items.map((item) => {
        const color = item.kind === 'rapid' ? '#fbbf24' : '#22d3ee'
        return (
          <mesh key={item.key} geometry={item.geometry} castShadow>
            <meshStandardMaterial
              color={color}
              metalness={0.42}
              roughness={0.38}
              emissive={color}
              emissiveIntensity={0.12}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function ToolpathLines({ segments }: { segments: ReturnType<typeof extractToolpathSegmentsFromGcode> }): ReactNode {
  return (
    <group>
      {segments.map((s, i) => {
        const a = gcodeToThree(s.x0, s.y0, s.z0)
        const b = gcodeToThree(s.x1, s.y1, s.z1)
        const color = s.kind === 'rapid' ? '#fbbf24' : '#22d3ee'
        const lw = s.kind === 'rapid' ? 1.25 : 2
        return <Line key={i} points={[a, b]} color={color} lineWidth={lw} />
      })}
    </group>
  )
}

function StockOutlineBox({
  sx,
  sy,
  sz
}: {
  sx: number
  sy: number
  sz: number
}): ReactNode {
  const geo = useMemo(() => new THREE.BoxGeometry(sx, sz, sy), [sx, sy, sz])
  return (
    <mesh position={[sx / 2, -sz / 2, sy / 2]} geometry={geo}>
      <meshBasicMaterial color="#475569" wireframe transparent opacity={0.35} depthWrite={false} />
    </mesh>
  )
}

/**
 * Machine work volume from profile `workAreaMm` — same corner convention as {@link StockOutlineBox}
 * (G-code origin at one corner; box spans 0…wx, 0…wy, 0…wz in X/Y/Z).
 */
function MachineEnvelopeBox({ wx, wy, wz }: { wx: number; wy: number; wz: number }): ReactNode {
  const geo = useMemo(() => new THREE.BoxGeometry(wx, wz, wy), [wx, wy, wz])
  return (
    <mesh position={[wx / 2, -wz / 2, wy / 2]} geometry={geo}>
      <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.5} depthWrite={false} />
    </mesh>
  )
}

/** Table plane at G-code Z=0 (CNC XY), spanning machine X × Y extent. Maps to Three.js XZ at y_three=0. */
function MachineTablePlane({ wx, wy }: { wx: number; wy: number }): ReactNode {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx / 2, 0, wy / 2]} receiveShadow>
      <planeGeometry args={[wx, wy]} />
      <meshStandardMaterial
        color="#475569"
        roughness={0.92}
        metalness={0.08}
        transparent
        opacity={0.45}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function VoxelCarveSamples({ positions }: { positions: Float32Array }): ReactNode {
  const geometry = useMemo(() => {
    if (positions.length < 3) return null
    const n = positions.length / 3
    const arr = new Float32Array(positions.length)
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3]!
      const y = positions[i * 3 + 1]!
      const z = positions[i * 3 + 2]!
      const t = gcodeToThree(x, y, z)
      arr[i * 3] = t[0]
      arr[i * 3 + 1] = t[1]
      arr[i * 3 + 2] = t[2]
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return geo
  }, [positions])

  if (!geometry) return null
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#fb923c" size={0.45} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  )
}

function HeightFieldTerrain({ hf }: { hf: ReturnType<typeof buildHeightFieldFromCuttingSegments> }): ReactNode {
  const geometry = useMemo(() => {
    if (!hf) return null
    const { originX, originY, cellMm, cols, rows, topZ, stockTopZ } = hf
    const vx = cols + 1
    const vy = rows + 1
    const positions = new Float32Array(vx * vy * 3)
    const sample = (ci: number, cj: number) => {
      const ii = Math.max(0, Math.min(cols - 1, ci))
      const jj = Math.max(0, Math.min(rows - 1, cj))
      return topZ[jj * cols + ii]!
    }
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        const zAvg =
          0.25 *
          (sample(i - 1, j - 1) + sample(i, j - 1) + sample(i - 1, j) + sample(i, j))
        const gx = originX + i * cellMm
        const gy = originY + j * cellMm
        const o = (j * vx + i) * 3
        positions[o] = gx
        positions[o + 1] = zAvg
        positions[o + 2] = gy
      }
    }
    const indices: number[] = []
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * vx + i
        const b = j * vx + i + 1
        const c = (j + 1) * vx + i
        const d = (j + 1) * vx + i + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    let minTop = Infinity
    for (let i = 0; i < topZ.length; i++) minTop = Math.min(minTop, topZ[i]!)

    const colors = new Float32Array(vx * vy * 3)
    const denom = Math.max(1e-6, stockTopZ - minTop)
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        const o = (j * vx + i) * 3
        const zAvg = positions[o + 1]!
        const t = Math.min(1, Math.max(0, (stockTopZ - zAvg) / denom))
        const c = new THREE.Color().setHSL(0.55 - t * 0.45, 0.65, 0.45)
        colors[o] = c.r
        colors[o + 1] = c.g
        colors[o + 2] = c.b
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [hf])

  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} side={THREE.DoubleSide} transparent opacity={0.88} />
    </mesh>
  )
}

function PartStlMesh({ geometry }: { geometry: THREE.BufferGeometry }): ReactNode {
  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#94a3b8"
        metalness={0.22}
        roughness={0.65}
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function PlaybackToolHead({
  position,
  radius
}: {
  position: THREE.Vector3Tuple
  radius: number
}): ReactNode {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 20, 20]} />
      <meshStandardMaterial color="#f472b6" metalness={0.35} roughness={0.4} emissive="#9d174d" emissiveIntensity={0.25} />
    </mesh>
  )
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const len = bin.length
  const u8 = new Uint8Array(len)
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

type Props = {
  projectDir: string
  mfg: ManufactureFile
  tools?: ToolLibraryFile | null
  /** Active CNC machine for work envelope + table preview (G-code vs profile bounds). */
  machine?: MachineProfile
  /** Setup row whose stock drives the preview box (CAM-resolved setup index). */
  stockSetupIndex?: number
  /** Project-relative path to preview in the viewport (e.g. selected op `sourceMesh`). */
  previewMeshRelativePath?: string | null
  /** Operation used for tool-diameter proxy (e.g. selected row). */
  previewOperation?: ManufactureOperation | null
  /** When `workspace`, the 3D canvas is shown first and uses a taller viewport. */
  layout?: 'compact' | 'workspace'
}

const TUBE_MAX_SEGMENTS = 10000
const TUBE_MAX_CHAINS = 900
/** Playback: approximate path fraction advanced per second when playing (loops). */
const PLAYBACK_SPEED = 0.09

export function ManufactureCamSimulationPanel({
  projectDir,
  mfg,
  tools,
  machine,
  stockSetupIndex = 0,
  previewMeshRelativePath = null,
  previewOperation = null,
  layout = 'compact'
}: Props): ReactNode {
  const [gcode, setGcode] = useState<string>('')
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [showRemoval, setShowRemoval] = useState(true)
  const [removalMode, setRemovalMode] = useState<'tier2' | 'tier3'>('tier2')
  const [pathPreviewMode, setPathPreviewMode] = useState<'rendered' | 'lines'>('rendered')
  const [showPartMesh, setShowPartMesh] = useState(true)
  const [partLoadNote, setPartLoadNote] = useState<string | null>(null)
  const [partBoundsCnc, setPartBoundsCnc] = useState<StlAxisAlignedBounds | null>(null)
  const [partPositionsRaw, setPartPositionsRaw] = useState<Float32Array | null>(null)
  const [playbackU, setPlaybackU] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const setupIdx = Math.max(0, Math.min(stockSetupIndex, Math.max(0, mfg.setups.length - 1)))
  const stockDef = mfg.setups[setupIdx]?.stock

  const toolOp =
    previewOperation && !previewOperation.suppressed && previewOperation.kind.startsWith('cnc_')
      ? previewOperation
      : mfg.operations.find((o) => !o.suppressed && o.kind.startsWith('cnc_'))
  const toolDia = useMemo(
    () => resolveCamToolDiameterMm({ operation: toolOp, tools: tools ?? undefined }) ?? 6,
    [toolOp, tools]
  )

  const stockBox = useMemo(() => {
    const st = stockDef
    if (!st) return null
    if (st.kind === 'box') {
      const x = st.x ?? 0
      const y = st.y ?? 0
      const z = st.z ?? 0
      if (!(x > 0) || !(y > 0) || !(z > 0)) return null
      return { x, y, z }
    }
    if (st.kind === 'fromExtents') {
      if (!partBoundsCnc) return null
      const pad = st.allowanceMm ?? 0
      return stockBoxDimensionsFromPartBounds(partBoundsCnc, pad)
    }
    return null
  }, [stockDef, partBoundsCnc])

  const partGeometry = useMemo(() => {
    if (!partPositionsRaw || !showPartMesh) return null
    const n = partPositionsRaw.length
    const pos = new Float32Array(n)

    // ── WCS-alignment offset ──────────────────────────────────────────────────
    // G-code uses a WCS where:
    //   X=0, Y=0 = stock min corner (front-left)
    //   Z=0       = TOP of stock (all cuts go negative Z)
    //
    // The raw STL vertices carry whatever coordinates the CAD model was saved
    // at, which is almost never at the G-code WCS origin.  Without correction,
    // the part mesh renders at its model-space coordinates while the toolpath
    // renders near [0,0,0] — they appear far apart.
    //
    // Fix: translate every vertex so that:
    //   • STL minX → 0  (aligns part left edge with G-code X=0)
    //   • STL minY → 0  (aligns part front edge with G-code Y=0)
    //   • STL maxZ → 0  (aligns part TOP face with G-code Z=0)
    //
    // After this transform the part, stock outline box, and toolpath tubes
    // all share the same Three.js origin.
    const ox = partBoundsCnc ? partBoundsCnc.min[0] : 0
    const oy = partBoundsCnc ? partBoundsCnc.min[1] : 0
    const ozTop = partBoundsCnc ? partBoundsCnc.max[2] : 0   // top of part → Z=0

    for (let i = 0; i < n; i += 3) {
      const x = partPositionsRaw[i]! - ox
      const y = partPositionsRaw[i + 1]! - oy
      const z = partPositionsRaw[i + 2]! - ozTop  // part top lands at Z=0; rest is negative

      // CNC → Three.js axis remap: X→X, CNC-Z→Three-Y (up), CNC-Y→Three-Z (depth)
      pos[i]     = x
      pos[i + 1] = z   // CNC Z (now offset so top=0) → Three.js Y
      pos[i + 2] = y
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [partPositionsRaw, showPartMesh, partBoundsCnc])

  useEffect(() => {
    const rel = previewMeshRelativePath?.trim()
    if (!projectDir || !rel) {
      setPartLoadNote(null)
      setPartBoundsCnc(null)
      setPartPositionsRaw(null)
      return
    }
    let cancelled = false
    setPartLoadNote('Loading mesh…')
    void (async () => {
      try {
        const r = await window.fab.assemblyReadStlBase64(projectDir, rel)
        if (cancelled) return
        if (!r.ok) {
          setPartLoadNote(r.error)
          setPartBoundsCnc(null)
          setPartPositionsRaw(null)
          return
        }
        const u8 = base64ToUint8Array(r.base64)
        const tri = triangulateBinaryStl(u8, 120_000)
        if ('error' in tri) {
          setPartLoadNote(tri.error)
          setPartBoundsCnc(null)
          setPartPositionsRaw(null)
          return
        }
        setPartBoundsCnc(tri.bbox)
        setPartPositionsRaw(tri.positions)
        setPartLoadNote(
          tri.truncated
            ? `Preview uses first ${(tri.positions.length / 9).toLocaleString()} triangles (${tri.triangleCount.toLocaleString()} in file).`
            : null
        )
      } catch (e) {
        if (!cancelled) {
          setPartLoadNote(e instanceof Error ? e.message : String(e))
          setPartBoundsCnc(null)
          setPartPositionsRaw(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectDir, previewMeshRelativePath])

  const segments = useMemo(() => (gcode.trim() ? extractToolpathSegmentsFromGcode(gcode) : []), [gcode])

  const pathSampler = useMemo(() => buildToolpathLengthSampler(segments), [segments])

  const pathChains = useMemo(() => buildContiguousPathChains(segments), [segments])

  const tubeTooHeavy =
    segments.length > TUBE_MAX_SEGMENTS ||
    pathChains.length > TUBE_MAX_CHAINS ||
    segments.length === 0

  const rapidRadiusMm = Math.max(0.22, toolDia * 0.065)
  const feedRadiusMm = Math.max(0.38, toolDia * 0.11)

  const envelopeMachine = machine?.kind === 'cnc' ? machine : undefined
  const workArea = envelopeMachine?.workAreaMm

  const envelopeCheck = useMemo(() => {
    if (!workArea || segments.length === 0) return null
    return compareToolpathToMachineEnvelope(segments, workArea)
  }, [segments, workArea])

  const heightField = useMemo(() => {
    if (!showRemoval || removalMode !== 'tier2' || segments.length === 0) return null
    return buildHeightFieldFromCuttingSegments(segments, {
      toolRadiusMm: toolDia * 0.5,
      maxCols: 88,
      maxRows: 88,
      stockTopZ: 0,
      cuttingZThreshold: 0.08
    })
  }, [segments, showRemoval, removalMode, toolDia])

  const voxelPreview = useMemo(() => {
    if (!showRemoval || removalMode !== 'tier3' || segments.length === 0) return null
    return buildVoxelRemovalFromCuttingSegments(segments, {
      toolRadiusMm: toolDia * 0.5,
      maxCols: 34,
      maxRows: 34,
      maxLayers: 20,
      stockTopZ: 0,
      cuttingZThreshold: 0.08,
      maxStamps: 8000,
      maxSamplePoints: 2400
    })
  }, [segments, showRemoval, removalMode, toolDia])

  useEffect(() => {
    if (!isPlaying || pathSampler.totalMm < 1e-9) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000)
      last = now
      setPlaybackU((u) => {
        const nu = u + PLAYBACK_SPEED * dt
        return nu >= 1 ? nu % 1 : nu
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, pathSampler.totalMm])

  const playbackGcodePos = useMemo(() => {
    if (segments.length === 0) return null
    return pathSampler.atUnit(playbackU)
  }, [pathSampler, playbackU, segments.length])

  async function loadOutputCam(): Promise<void> {
    setLoadNote(null)
    const sep = projectDir.includes('\\') ? '\\' : '/'
    const path = `${projectDir}${sep}output${sep}cam.nc`
    try {
      const text = await window.fab.readTextFile(path)
      setGcode(text)
      setLoadNote(`Loaded ${path}`)
    } catch (e) {
      setLoadNote(e instanceof Error ? e.message : String(e))
    }
  }

  const hasPath = segments.length > 0
  const showSimCanvas =
    hasPath ||
    Boolean(envelopeMachine && workArea) ||
    Boolean(stockBox) ||
    Boolean(showPartMesh && partGeometry)

  const useTubePreview = hasPath && pathPreviewMode === 'rendered' && !tubeTooHeavy

  const playbackHeadThree = playbackGcodePos
    ? (gcodeToThree(playbackGcodePos.x, playbackGcodePos.y, playbackGcodePos.z) as THREE.Vector3Tuple)
    : null

  const viewportWrapClass =
    layout === 'workspace'
      ? 'cam-sim-viewport-wrap cam-sim-viewport-wrap--workspace'
      : 'cam-sim-viewport-wrap'

  const canvasBlock = (
    <div className={viewportWrapClass}>
      {showSimCanvas ? (
        <Canvas shadows camera={{ position: [80, 70, 80], fov: 45 }} gl={{ antialias: true }}>
          <color attach="background" args={['#0f172a']} />
          <fog attach="fog" args={['#0f172a', 120, 520]} />
          <hemisphereLight intensity={0.35} color="#a5b4fc" groundColor="#1e293b" />
          <ambientLight intensity={0.45} />
          <directionalLight castShadow position={[55, 110, 45]} intensity={1.05} shadow-mapSize={[1024, 1024]} />
          <Grid
            infiniteGrid
            fadeDistance={220}
            fadeStrength={1.2}
            cellSize={5}
            sectionSize={25}
            sectionColor="#6366f1"
            cellColor="#334155"
            position={[0, 0, 0]}
          />
          <Bounds fit clip observe margin={1.2} maxDuration={0.45}>
            <group>
              {envelopeMachine && workArea ? (
                <>
                  <MachineTablePlane wx={workArea.x} wy={workArea.y} />
                  <MachineEnvelopeBox wx={workArea.x} wy={workArea.y} wz={workArea.z} />
                </>
              ) : null}
              {stockBox ? <StockOutlineBox sx={stockBox.x} sy={stockBox.y} sz={stockBox.z} /> : null}
              {showPartMesh && partGeometry ? <PartStlMesh geometry={partGeometry} /> : null}
              {showRemoval && removalMode === 'tier2' && heightField ? <HeightFieldTerrain hf={heightField} /> : null}
              {showRemoval && removalMode === 'tier3' && voxelPreview && voxelPreview.samplePositions.length > 0 ? (
                <VoxelCarveSamples positions={voxelPreview.samplePositions} />
              ) : null}
              {hasPath ? (
                useTubePreview ? (
                  <ToolpathMeshTubes
                    chains={pathChains}
                    rapidRadiusMm={rapidRadiusMm}
                    feedRadiusMm={feedRadiusMm}
                  />
                ) : (
                  <ToolpathLines segments={segments} />
                )
              ) : null}
              {hasPath && playbackHeadThree ? (
                <PlaybackToolHead position={playbackHeadThree} radius={Math.max(0.35, toolDia * 0.07)} />
              ) : null}
            </group>
          </Bounds>
          <ContactShadows
            position={[0, 0.04, 0]}
            opacity={0.45}
            scale={260}
            blur={2.2}
            far={6}
            color="#0f172a"
          />
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      ) : (
        <p className="msg msg--muted cam-sim-pad">
          Select a mesh path on an operation, define stock, or load G-code. With a CNC machine profile, the work envelope
          appears even before paths or parts load.
        </p>
      )}
    </div>
  )

  const metaBlock = (
    <>
      <h3 className="subh">Fabrication 3D workspace — path, stock, part mesh</h3>
      <p className="msg msg--muted">
        <strong>Part mesh</strong> uses the same CNC→Three mapping as G-code (X→X, CNC Z→Three Y, CNC Y→Three Z).{' '}
        <strong>Tier 1:</strong> rendered tubes vs lines. <strong>Tier 2/3:</strong> approximate removal. Not collision-safe —{' '}
        <code>docs/MACHINES.md</code>.
      </p>
      <p className="msg msg--muted msg--xs" aria-live="polite">
        <strong>Machine safety:</strong> verify posts, units, tool length, and clearances before running G-code. Purple
        wireframe = profile work volume (may not match fixture / WCS).
      </p>
      {envelopeMachine && workArea ? (
        <p className="msg msg--muted msg--xs">
          <strong>Machine envelope (preview):</strong> {envelopeMachine.name} — {workArea.x}×{workArea.y}×{workArea.z} mm
        </p>
      ) : null}
      {stockDef?.kind === 'fromExtents' ? (
        <p className="msg msg--muted msg--xs">
          Stock kind <strong>from extents</strong>: preview box = part AABB + allowance (mm per side). Use <strong>Fit stock
          from part</strong> in the sidebar to write a box into <code>manufacture.json</code>.
        </p>
      ) : null}
      {hasPath && envelopeCheck && workArea ? (
        <p
          className={`msg msg--xs ${envelopeCheck.withinEnvelope ? 'msg--muted' : ''}`}
          role="status"
          aria-live="polite"
        >
          {envelopeCheck.bounds ? (
            <>
              <strong>G-code bounds (mm):</strong> X [{envelopeCheck.bounds.minX.toFixed(2)}, {envelopeCheck.bounds.maxX.toFixed(2)}],
              Y [{envelopeCheck.bounds.minY.toFixed(2)}, {envelopeCheck.bounds.maxY.toFixed(2)}], Z [
              {envelopeCheck.bounds.minZ.toFixed(2)}, {envelopeCheck.bounds.maxZ.toFixed(2)}] vs profile [0,{workArea.x}]×[0,
              {workArea.y}]×[0,{workArea.z}].{' '}
            </>
          ) : null}
          {envelopeCheck.withinEnvelope ? (
            <span>Within machine profile box (does not prove collision-safe).</span>
          ) : (
            <span>
              <strong>Outside profile box:</strong>{' '}
              {envelopeCheck.violations.map((v) => {
                const lim = v.axis === 'x' ? workArea.x : v.axis === 'y' ? workArea.y : workArea.z
                return (
                  <span key={`${v.axis}-${v.kind}`}>
                    {v.axis.toUpperCase()}{' '}
                    {v.kind === 'below_min' ? 'below 0' : `above ${lim} mm`} by {v.excessMm.toFixed(2)} mm;{' '}
                  </span>
                )
              })}
            </span>
          )}
        </p>
      ) : null}
    </>
  )

  const controlsBlock = (
    <>
      <div className="row row--align-center row--wrap">
        <button type="button" className="secondary" onClick={() => void loadOutputCam()}>
          Load output/cam.nc
        </button>
        <label className="chk">
          <input type="checkbox" checked={showPartMesh} onChange={(e) => setShowPartMesh(e.target.checked)} />
          Show part mesh
        </label>
        <label>
          Path display
          <select
            value={tubeTooHeavy ? 'lines' : pathPreviewMode}
            onChange={(e) => setPathPreviewMode(e.target.value as 'rendered' | 'lines')}
            disabled={!hasPath}
            className="ml-6"
          >
            <option value="rendered">Rendered (3D tubes)</option>
            <option value="lines">Lines (fast)</option>
          </select>
        </label>
        {hasPath && tubeTooHeavy ? (
          <span className="msg msg--muted msg--xs">
            Switched to lines: program has {segments.length.toLocaleString()} segments or {pathChains.length.toLocaleString()}{' '}
            chains (limit for tube preview).
          </span>
        ) : null}
        <label className="chk">
          <input type="checkbox" checked={showRemoval} onChange={(e) => setShowRemoval(e.target.checked)} />
          Show removal preview
        </label>
        {showRemoval ? (
          <label>
            Model
            <select
              value={removalMode}
              onChange={(e) => setRemovalMode(e.target.value as 'tier2' | 'tier3')}
              className="ml-6"
            >
              <option value="tier2">Tier 2 — 2.5D height field</option>
              <option value="tier3">Tier 3 — coarse voxels (experimental)</option>
            </select>
          </label>
        ) : null}
        <span className="msg msg--muted msg--xs">
          Tool Ø for proxy: {toolDia.toFixed(2)} mm (selected or first CNC op + library)
        </span>
      </div>
      {hasPath ? (
        <div className="row row--align-center manufacture-playback-row">
          <span className="msg msg--muted msg--xs">Playback</span>
          <button type="button" className="secondary" onClick={() => setIsPlaying((p) => !p)}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <label className="manufacture-playback-scrub">
            <span className="msg msg--xs msg--muted">Position</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.002}
              value={playbackU}
              onChange={(e) => {
                setPlaybackU(Number(e.target.value))
                setIsPlaying(false)
              }}
            />
          </label>
          <span className="msg msg--muted msg--xs">
            {pathSampler.totalMm > 0 ? `${pathSampler.totalMm.toFixed(1)} mm path` : ''}
          </span>
        </div>
      ) : null}
      {showRemoval && removalMode === 'tier3' && voxelPreview ? (
        <p className="msg msg--muted cam-msg-tier3">
          Tier 3: grid {voxelPreview.cols}×{voxelPreview.rows}×{voxelPreview.layers}, cell ≈{voxelPreview.cellMm.toFixed(2)}{' '}
          mm — carved voxels ~{voxelPreview.carvedVoxelCount.toLocaleString()} (~
          {voxelPreview.approxRemovedVolumeMm3.toFixed(0)} mm³ heuristic).
          {voxelPreview.stampsCapped ? ' Stamp budget capped for performance.' : ''} Orange points sample removed volume.
        </p>
      ) : null}
      {showRemoval && removalMode === 'tier3' && segments.length > 0 && !voxelPreview ? (
        <p className="msg msg--muted cam-msg-tier3">
          Tier 3: no voxel data (no qualifying feed moves below the Z threshold, or path too small).
        </p>
      ) : null}
      {loadNote ? <p className="msg">{loadNote}</p> : null}
      {partLoadNote ? <p className="msg msg--muted msg--xs">{partLoadNote}</p> : null}
    </>
  )

  const textareaBlock = (
    <label className="cam-label-stack">
      <span className="msg">G-code (paste or load)</span>
      <textarea
        value={gcode}
        onChange={(e) => setGcode(e.target.value)}
        rows={layout === 'workspace' ? 4 : 5}
        className="textarea--code input--full"
        spellCheck={false}
      />
    </label>
  )

  return (
    <section className="panel panel--nested" aria-label="CAM path and approximate stock preview" id="manufacture-cam-simulation">
      {layout === 'workspace' ? (
        <>
          {canvasBlock}
          {metaBlock}
          {controlsBlock}
          {textareaBlock}
        </>
      ) : (
        <>
          {metaBlock}
          {controlsBlock}
          {textareaBlock}
          {canvasBlock}
        </>
      )}
    </section>
  )
}
