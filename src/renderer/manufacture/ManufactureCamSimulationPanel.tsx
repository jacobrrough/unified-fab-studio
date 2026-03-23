import { Canvas } from '@react-three/fiber'
import { Grid, Line, OrbitControls } from '@react-three/drei'
import { useMemo, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { buildHeightFieldFromCuttingSegments } from '../../shared/cam-heightfield-2d5'
import { extractToolpathSegmentsFromGcode } from '../../shared/cam-gcode-toolpath'
import { buildVoxelRemovalFromCuttingSegments } from '../../shared/cam-voxel-removal-proxy'
import type { ManufactureFile } from '../../shared/manufacture-schema'
import { resolveCamToolDiameterMm } from '../../shared/cam-tool-resolve'
import type { ToolLibraryFile } from '../../shared/tool-schema'
/** G-code XYZ → Three.js (X, Y_up, Z) with CNC Z vertical as Three Y. */
function gcodeToThree(x: number, y: number, z: number): THREE.Vector3Tuple {
  return [x, z, y]
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

type Props = {
  projectDir: string
  mfg: ManufactureFile
  tools?: ToolLibraryFile | null
}

export function ManufactureCamSimulationPanel({ projectDir, mfg, tools }: Props): ReactNode {
  const [gcode, setGcode] = useState<string>('')
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [showRemoval, setShowRemoval] = useState(true)
  const [removalMode, setRemovalMode] = useState<'tier2' | 'tier3'>('tier2')

  const firstCnc = useMemo(() => mfg.operations.find((o) => !o.suppressed && o.kind.startsWith('cnc_')), [mfg.operations])
  const toolDia = useMemo(
    () => resolveCamToolDiameterMm({ operation: firstCnc, tools: tools ?? undefined }) ?? 6,
    [firstCnc, tools]
  )

  const stockBox = useMemo(() => {
    const st = mfg.setups[0]?.stock
    if (!st || st.kind !== 'box') return null
    const x = st.x ?? 0
    const y = st.y ?? 0
    const z = st.z ?? 0
    if (!(x > 0) || !(y > 0) || !(z > 0)) return null
    return { x, y, z }
  }, [mfg.setups])

  const segments = useMemo(() => (gcode.trim() ? extractToolpathSegmentsFromGcode(gcode) : []), [gcode])

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

  return (
    <section className="panel panel--nested" aria-label="CAM path and approximate stock preview" id="manufacture-cam-simulation">
      <h3 className="subh">Simulation — Tier 1 path + Tier 2 / Tier 3 removal previews</h3>
      <p className="msg msg--muted">
        <strong>Tier 1:</strong> rapid (yellow) and cutting (cyan) polylines from <code>G0</code>/<code>G1</code> only — not
        machine kinematics or collision. <strong>Tier 2:</strong> stamps tool radius along shallow feed moves into a coarse
        2.5D height field — fast, <strong>approximate</strong>. <strong>Tier 3:</strong> experimental coarse{' '}
        <strong>voxel</strong> carve (sphere stamps along feeds); still not true swept volume, ignores holder/cycles. Neither
        tier is collision-safe — see <code>docs/MACHINES.md</code>.
      </p>
      <p className="msg msg--muted msg--xs" aria-live="polite">
        <strong>Machine safety:</strong> this panel is for orientation only. Verify posts, units, tool length, and clearances
        before running any G-code on real equipment.
      </p>
      <div className="row row--align-center">
        <button type="button" className="secondary" onClick={() => void loadOutputCam()}>
          Load output/cam.nc
        </button>
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
          Tool Ø for proxy: {toolDia.toFixed(2)} mm (first non-suppressed CNC op + library)
        </span>
      </div>
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
      <label className="cam-label-stack">
        <span className="msg">G-code (paste or load)</span>
        <textarea
          value={gcode}
          onChange={(e) => setGcode(e.target.value)}
          rows={5}
          className="textarea--code input--full"
          spellCheck={false}
        />
      </label>
      <div className="cam-sim-viewport-wrap">
        {hasPath ? (
          <Canvas camera={{ position: [80, 70, 80], fov: 45 }} gl={{ antialias: true }}>
            <color attach="background" args={['#0f172a']} />
            <ambientLight intensity={0.65} />
            <directionalLight position={[40, 80, 20]} intensity={0.9} />
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
            {stockBox ? <StockOutlineBox sx={stockBox.x} sy={stockBox.y} sz={stockBox.z} /> : null}
            {showRemoval && removalMode === 'tier2' && heightField ? <HeightFieldTerrain hf={heightField} /> : null}
            {showRemoval && removalMode === 'tier3' && voxelPreview && voxelPreview.samplePositions.length > 0 ? (
              <VoxelCarveSamples positions={voxelPreview.samplePositions} />
            ) : null}
            <ToolpathLines segments={segments} />
            <OrbitControls makeDefault enableDamping />
          </Canvas>
        ) : (
          <p className="msg msg--muted cam-sim-pad">
            Paste G-code or load <code>output/cam.nc</code> to preview toolpath.
          </p>
        )}
      </div>
    </section>
  )
}
