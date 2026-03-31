/**
 * ShopModelViewer – Three.js STL viewer with:
 *  • Binary/ASCII STL loading via IPC (no file:// restrictions)
 *  • Transparent stock bounding box overlay
 *  • Model transform (position, rotation, scale) applied live
 *  • Orbit (left-drag), Pan (right/middle-drag), Zoom (scroll)
 *  • Interactive 3-axis gizmo: Translate / Rotate / Scale
 *  • Full-size: fills parent via position:absolute + ResizeObserver
 *  • 4-axis mode: Makera Carvera 4th-axis rig visualization
 *  • G-code toolpath preview overlay (colored rapid/cutting/plunge lines)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { parseGcodeToolpath, type ToolpathGeometry } from './gcode-toolpath-parse'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelTransform {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }  // degrees
  scale:    { x: number; y: number; z: number }
}

export function defaultTransform(): ModelTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale:    { x: 1, y: 1, z: 1 }
  }
}

export interface StockDimensions { x: number; y: number; z: number }

export type GizmoMode = 'translate' | 'rotate' | 'scale' | null

// ── Axis colours ──────────────────────────────────────────────────────────────
const AX_COLOR = { x: 0xe74c3c, y: 0x2ecc71, z: 0x3d7eff } as const
const AX_HOVER  = 0xffff00
// Three.js Y = model Z (up), Three.js Z = model Y (depth)
const THREEJS_TO_MODEL = { x: 'x', y: 'z', z: 'y' } as const

// ── STL parsers ───────────────────────────────────────────────────────────────
function parseStlBuffer(buf: ArrayBuffer): THREE.BufferGeometry {
  const txt = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf, 0, 256))
  return txt.trimStart().startsWith('solid') ? parseAscii(new TextDecoder().decode(buf)) : parseBinary(buf)
}
function parseBinary(buf: ArrayBuffer): THREE.BufferGeometry {
  const v = new DataView(buf)
  const n = v.getUint32(80, true)
  const pos: number[] = [], nrm: number[] = []
  let off = 84
  for (let i = 0; i < n; i++) {
    const nx = v.getFloat32(off, true), ny = v.getFloat32(off+4, true), nz = v.getFloat32(off+8, true)
    off += 12
    for (let j = 0; j < 3; j++) {
      pos.push(v.getFloat32(off, true), v.getFloat32(off+4, true), v.getFloat32(off+8, true))
      nrm.push(nx, ny, nz); off += 12
    }
    off += 2
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3))
  return g
}
function parseAscii(txt: string): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = []
  const vRe = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g
  const nRe = /facet normal\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g
  const ns: RegExpExecArray[] = []; let m: RegExpExecArray | null
  while ((m = nRe.exec(txt)) !== null) ns.push(m)
  let ni = 0, tc = 0
  while ((m = vRe.exec(txt)) !== null) {
    const fn = ns[Math.floor(tc/3)] ?? ns[ni] ?? null
    nrm.push(fn ? +fn[1] : 0, fn ? +fn[2] : 1, fn ? +fn[3] : 0)
    pos.push(+m[1], +m[2], +m[3]); tc++
    if (tc % 3 === 0) ni++
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3))
  return g
}
function deg(d: number): number { return d * Math.PI / 180 }

function buildToolpathGroup(geo: ToolpathGeometry): THREE.Group {
  const root = new THREE.Group(); root.name = 'toolpath'
  const add = (g: THREE.BufferGeometry, color: number, opacity: number): void => {
    if (g.getAttribute('position')?.count === 0) return
    const m = new THREE.LineBasicMaterial({ color, opacity, transparent: opacity < 1, depthTest: true, linewidth: 1 })
    root.add(new THREE.LineSegments(g, m))
  }
  add(geo.rapids,  0xfbbf24, 0.45)   // amber — rapid moves
  add(geo.plunges, 0xe879f9, 0.80)   // magenta — plunge moves
  add(geo.cuts,    0x22d3ee, 0.85)   // cyan — cutting moves
  return root
}

// ── Stock wireframe ───────────────────────────────────────────────────────────
function buildStockBox(s: StockDimensions): THREE.LineSegments {
  const ls = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(s.x, s.z, s.y)),
    new THREE.LineBasicMaterial({ color: 0xf59e0b, opacity: 0.7, transparent: true })
  )
  ls.position.set(0, s.z / 2, 0)
  return ls
}

// ── Makera Carvera 4th-axis rig ───────────────────────────────────────────────
// Coordinate system: Three.js X = machine X (4th axis rotation axis)
//                   Three.js Y = up
//                   Three.js Z = machine Y (depth / toward operator)
// The rotation axis (A-axis) is the Three.js X axis at Y = AXIS_Y, Z = 0.
//
// ── 4-axis post config (mirrors PostConfig in ShopApp — kept local to avoid circular dep) ──
interface PostConfig4Axis {
  count: number            // 1 = single centre post; 2 or 4 = offset posts
  diameterMm: number       // post diameter (mm)
  offsetRadiusMm: number   // radial offset from rotation axis; 0 = centre
}

// Accurate geometry derived from video measurements of the Makera Carvera 4th Axis:
//   Headstock: white anodized Al block (~65×65×62mm) with integrated NEMA17
//              stepper visible through lower acrylic section; spindle output
//              exits +X face → collar → K01-50 4-jaw scroll chuck (Ø50mm)
//   Tailstock: white anodized Al block (~55×55×58mm) with spring live center
//              on -X face (bearing housing, 60° cone tip)
//   Rail: 2040-style extrusion spanning headstock → tailstock
//   Stock zones: RED = clamped (chuckDepthMm), ORANGE = clamp offset buffer, AMBER = machinable
//   Posts: green cylinder(s) running axially through centre of stock
//
function buildFourAxisRig(
  stockLen: number,
  stockDia: number,
  chuckDepthMm: number,
  clampOffsetMm: number,
  posts: PostConfig4Axis | null,
  scene: THREE.Scene
): THREE.Group {
  const root = new THREE.Group()
  root.name = 'fourAxisRig'

  // ── Measured dimensions ────────────────────────────────────────────────────
  const AXIS_Y      = 55    // rotation axis height above spoilboard (mm)
  const halfLen     = stockLen / 2
  const stockR      = stockDia / 2

  // Headstock
  const HS_W        = 60    // axial depth of headstock body (along X)
  const HS_D        = 62    // depth into machine (Z)
  const HS_H_TOTAL  = AXIS_Y + 10  // total body height (spindle at AXIS_Y)
  const MOTOR_H     = 32    // lower acrylic/motor section height

  // Chuck — K01-50 style 50mm 4-jaw scroll chuck
  const CHUCK_R     = 25    // outer radius (50 mm dia body)
  const CHUCK_DEP   = 22    // axial depth of chuck body
  const COLLAR_R    = 28    // backing collar/flange radius
  const COLLAR_DEP  = 8     // collar axial depth
  const SPINDLE_LEN = 10    // spindle stub from headstock +X face

  // Tailstock
  const TS_W        = 55    // axial width of tailstock body
  const TS_D        = 58    // depth (Z)
  const TS_H        = AXIS_Y + 5   // body height (spindle centred at AXIS_Y)
  const BEAR_R      = 16    // bearing housing radius on -X face
  const BEAR_DEP    = 10    // bearing housing axial depth
  const LC_LEN      = 28    // live center shaft length
  const LC_SHAFT_R  = 8     // shaft radius
  const LC_CONE_H   = 18    // cone height (60° included angle)
  const LC_CONE_R   = 7     // cone base radius

  // Rail
  const RAIL_H      = 20
  const RAIL_W      = 42
  const railLen     = stockLen + 230

  // ── World-space origin for each sub-group ──────────────────────────────────
  // Chuck face (= stock left end) is at X = -halfLen
  // Headstock body centre-X = -(halfLen + CHUCK_DEP + COLLAR_DEP + SPINDLE_LEN + HS_W/2)
  const headBodyX  = -(halfLen + CHUCK_DEP + COLLAR_DEP + SPINDLE_LEN + HS_W / 2)

  // Tailstock body centre-X = halfLen + LC_CONE_H + LC_LEN + BEAR_DEP + TS_W/2
  const tailBodyX  = halfLen + LC_CONE_H + LC_LEN + BEAR_DEP + TS_W / 2

  // ── Materials ─────────────────────────────────────────────────────────────
  const whiteMat   = new THREE.MeshPhongMaterial({ color: 0xe4e7ea, specular: 0x8899aa, shininess: 55 })
  const acrylicMat = new THREE.MeshPhongMaterial({ color: 0xb5c8d5, opacity: 0.42, transparent: true, shininess: 100 })
  const darkMat    = new THREE.MeshPhongMaterial({ color: 0x2a3038, specular: 0x141820, shininess: 25 })
  const metalMat   = new THREE.MeshPhongMaterial({ color: 0x8a9aaa, specular: 0x4d6070, shininess: 90 })
  const jawMat     = new THREE.MeshPhongMaterial({ color: 0x363e47, specular: 0x1c2228, shininess: 40 })
  const railMat    = new THREE.MeshPhongMaterial({ color: 0x505862, specular: 0x303840, shininess: 30 })
  const stockMat   = new THREE.MeshPhongMaterial({
    color: 0xd4a55a, opacity: 0.55, transparent: true,
    side: THREE.DoubleSide, depthWrite: false
  })
  const clampMat   = new THREE.MeshPhongMaterial({
    color: 0xcc4040, opacity: 0.52, transparent: true,
    side: THREE.DoubleSide, depthWrite: false
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  function part(geo: THREE.BufferGeometry, m: THREE.Material, x=0, y=0, z=0, rx=0, ry=0, rz=0): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); root.add(mesh); return mesh
  }

  // ── Base Rail (2040-style extrusion) ──────────────────────────────────────
  part(new THREE.BoxGeometry(railLen, RAIL_H, RAIL_W), railMat, 0, RAIL_H / 2, 0)
  // Top channel groove
  part(new THREE.BoxGeometry(railLen, 4, 8), darkMat, 0, RAIL_H + 2, 0)
  // T-nut bolt stubs at ends
  for (const bx of [-railLen / 2 + 22, railLen / 2 - 22]) {
    part(new THREE.CylinderGeometry(3.5, 3.5, 6, 8), railMat, bx, RAIL_H + 3, 0)
  }

  // ── Headstock ─────────────────────────────────────────────────────────────
  const hs = new THREE.Group()
  hs.position.x = headBodyX
  root.add(hs)

  function hsPart(geo: THREE.BufferGeometry, m: THREE.Material, x=0, y=0, z=0, rx=0, ry=0, rz=0): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); hs.add(mesh); return mesh
  }

  // Upper block — white anodized aluminum
  const upperH = HS_H_TOTAL - MOTOR_H
  hsPart(new THREE.BoxGeometry(HS_W, upperH, HS_D), whiteMat, 0, MOTOR_H + upperH / 2, 0)
  // Lower section — clear acrylic over stepper motor
  hsPart(new THREE.BoxGeometry(HS_W, MOTOR_H, HS_D), acrylicMat, 0, MOTOR_H / 2, 0)
  // NEMA17 stepper (42×42mm body, visible through acrylic)
  hsPart(new THREE.BoxGeometry(42, 28, 42), darkMat, 0, 14, 0)
  // Motor connector stub (−Z side)
  hsPart(new THREE.BoxGeometry(10, 10, 8), darkMat, 0, 14, -(HS_D / 2 + 4))

  // Rail-mount foot (slightly wider bracket at base)
  hsPart(new THREE.BoxGeometry(HS_W + 10, RAIL_H, HS_D + 12), railMat, 0, -(RAIL_H / 2), 0)
  // Foot bolt knobs
  for (const fz of [-HS_D / 2 - 2, HS_D / 2 + 2]) {
    hsPart(new THREE.CylinderGeometry(4, 4, RAIL_H + 4, 8), darkMat, 0, -(RAIL_H / 2), fz)
  }

  // Chuck adjustment worm knob (on −Z face of headstock, knurled cylinder)
  hsPart(new THREE.CylinderGeometry(8.5, 8.5, 14, 14), darkMat, 0, AXIS_Y, -(HS_D / 2 + 7), Math.PI / 2, 0, 0)

  // Spindle stub (exits +X face toward tailstock)
  const hsRightFaceX = HS_W / 2
  hsPart(new THREE.CylinderGeometry(11, 11, SPINDLE_LEN, 16), metalMat,
    hsRightFaceX + SPINDLE_LEN / 2, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Backing collar (dark, larger diameter flange before chuck body)
  hsPart(new THREE.CylinderGeometry(COLLAR_R, COLLAR_R, COLLAR_DEP, 24), darkMat,
    hsRightFaceX + SPINDLE_LEN + COLLAR_DEP / 2, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Chuck body (dark gray)
  const chuckCenterX = hsRightFaceX + SPINDLE_LEN + COLLAR_DEP + CHUCK_DEP / 2
  hsPart(new THREE.CylinderGeometry(CHUCK_R, CHUCK_R, CHUCK_DEP, 24), darkMat,
    chuckCenterX, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Chuck face ring (polished steel)
  hsPart(new THREE.CylinderGeometry(CHUCK_R - 2, CHUCK_R - 2, 3, 24), metalMat,
    hsRightFaceX + SPINDLE_LEN + COLLAR_DEP + CHUCK_DEP + 1.5, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Chuck centre bore (dark hole)
  hsPart(new THREE.CylinderGeometry(5.5, 5.5, CHUCK_DEP + 4, 12), darkMat,
    chuckCenterX, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // ── 4 Chuck jaws ──────────────────────────────────────────────────────────
  // Jaws positioned radially; close-in to stockR + small gap
  const JAW_AXIAL = CHUCK_DEP - 2   // jaw axial length (along X)
  const JAW_RAD   = 9               // jaw radial thickness
  const JAW_TAN   = 5               // jaw tangential width
  const jawR      = Math.min(CHUCK_R - JAW_RAD / 2 - 1, Math.max(stockR + JAW_RAD / 2 + 2, 10))

  for (let j = 0; j < 4; j++) {
    const angle  = (j / 4) * Math.PI * 2   // 0, π/2, π, 3π/2
    const jy     = AXIS_Y + Math.cos(angle) * jawR
    const jz     = Math.sin(angle) * jawR

    // Jaw body (box, long-axis = X, radial = Y before rotation)
    const jawBox = new THREE.Mesh(new THREE.BoxGeometry(JAW_AXIAL, JAW_RAD, JAW_TAN), jawMat)
    jawBox.position.set(chuckCenterX, jy, jz)
    jawBox.rotation.set(angle, 0, 0)  // align Y-axis radially outward
    hs.add(jawBox)

    // Serration ridges on gripping face (inner side of jaw)
    for (let s = -1; s <= 1; s++) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(JAW_AXIAL, 1.5, 1), jawMat)
      ridge.position.set(chuckCenterX + s * 4, jy, jz)
      ridge.rotation.set(angle, 0, 0)
      hs.add(ridge)
    }
  }

  // Chuck key hole socket (small cylinder on outer edge of chuck body, at +Z)
  hsPart(new THREE.CylinderGeometry(3.5, 3.5, 10, 8), darkMat,
    chuckCenterX, AXIS_Y + CHUCK_R + 1, 0, 0, 0, 0)

  // ── Tailstock ─────────────────────────────────────────────────────────────
  const ts = new THREE.Group()
  ts.position.x = tailBodyX
  root.add(ts)

  function tsPart(geo: THREE.BufferGeometry, m: THREE.Material, x=0, y=0, z=0, rx=0, ry=0, rz=0): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m)
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); ts.add(mesh); return mesh
  }

  // Main body (white anodized)
  tsPart(new THREE.BoxGeometry(TS_W, TS_H, TS_D), whiteMat, 0, TS_H / 2, 0)

  // Rail-mount foot
  tsPart(new THREE.BoxGeometry(TS_W + 10, RAIL_H, TS_D + 12), railMat, 0, -(RAIL_H / 2), 0)
  for (const fz of [-TS_D / 2 - 2, TS_D / 2 + 2]) {
    tsPart(new THREE.CylinderGeometry(4, 4, RAIL_H + 4, 8), darkMat, 0, -(RAIL_H / 2), fz)
  }

  // Top lock knob + handle (clamps tailstock to rail)
  tsPart(new THREE.CylinderGeometry(8, 8, 14, 14), darkMat, 0, TS_H + 7, 0)
  // T-handle bar
  for (const tz of [-14, 14]) {
    tsPart(new THREE.CylinderGeometry(3.5, 3.5, 14, 8), darkMat, 0, TS_H + 14, tz, Math.PI / 2, 0, 0)
  }

  // Fine-adjust knob on +X end face
  tsPart(new THREE.CylinderGeometry(10, 10, 8, 14), metalMat, TS_W / 2 + 4, AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Bearing housing on −X face (square face with round bearing)
  // Face plate (square cover)
  tsPart(new THREE.BoxGeometry(6, 38, 38), whiteMat, -(TS_W / 2 + 3), AXIS_Y, 0)
  // Bearing ring (polished steel, round)
  tsPart(new THREE.CylinderGeometry(BEAR_R, BEAR_R, BEAR_DEP, 20), metalMat,
    -(TS_W / 2 + BEAR_DEP / 2), AXIS_Y, 0, 0, 0, Math.PI / 2)
  // 4 mounting bolts around bearing face
  for (let j = 0; j < 4; j++) {
    const angle = (j / 4) * Math.PI * 2 + Math.PI / 4
    const by = AXIS_Y + Math.cos(angle) * 22
    const bz = Math.sin(angle) * 22
    tsPart(new THREE.CylinderGeometry(2, 2, BEAR_DEP + 2, 6), darkMat,
      -(TS_W / 2 + BEAR_DEP / 2), by, bz, 0, 0, Math.PI / 2)
  }

  // Live center shaft
  tsPart(new THREE.CylinderGeometry(LC_SHAFT_R, LC_SHAFT_R, LC_LEN, 16), metalMat,
    -(TS_W / 2 + BEAR_DEP + LC_LEN / 2), AXIS_Y, 0, 0, 0, Math.PI / 2)

  // Live center cone (apex points −X toward headstock; rz = −π/2 rotates +Y → −X)
  tsPart(new THREE.ConeGeometry(LC_CONE_R, LC_CONE_H, 16), metalMat,
    -(TS_W / 2 + BEAR_DEP + LC_LEN + LC_CONE_H / 2), AXIS_Y, 0, 0, 0, -Math.PI / 2)

  // ── Stock: three visual zones ──────────────────────────────────────────────
  // RED zone    = portion inside chuck (not machinable)
  // ORANGE zone = clamp offset / safety buffer
  // AMBER zone  = machinable length
  const clampLen  = Math.max(0, Math.min(chuckDepthMm, stockLen * 0.6))
  const offsetLen = Math.max(0, Math.min(clampOffsetMm, stockLen - clampLen - 1))
  const machLen   = stockLen - clampLen - offsetLen

  // Clamped (red)
  if (clampLen > 0) {
    const clampGeo = new THREE.CylinderGeometry(stockR, stockR, clampLen, 32)
    const clampCyl = new THREE.Mesh(clampGeo, clampMat)
    clampCyl.position.set(-halfLen + clampLen / 2, AXIS_Y, 0)
    clampCyl.rotation.set(0, 0, Math.PI / 2)
    root.add(clampCyl)
  }

  // Clamp offset / safety buffer (orange)
  if (offsetLen > 0) {
    const offsetGeo = new THREE.CylinderGeometry(stockR, stockR, offsetLen, 32)
    const offsetCyl = new THREE.Mesh(offsetGeo,
      new THREE.MeshStandardMaterial({ color: 0xe67e22, opacity: 0.6, transparent: true }))
    offsetCyl.position.set(-halfLen + clampLen + offsetLen / 2, AXIS_Y, 0)
    offsetCyl.rotation.set(0, 0, Math.PI / 2)
    root.add(offsetCyl)
  }

  // Machinable (amber)
  const machGeo = new THREE.CylinderGeometry(stockR, stockR, Math.max(0.1, machLen), 32)
  const machCyl = new THREE.Mesh(machGeo, stockMat)
  machCyl.position.set(-halfLen + clampLen + offsetLen + machLen / 2, AXIS_Y, 0)
  machCyl.rotation.set(0, 0, Math.PI / 2)
  root.add(machCyl)

  // End-cap rings
  const ringGeo  = new THREE.TorusGeometry(stockR, 0.9, 8, 32)
  const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xf59e0b, opacity: 0.65, transparent: true })
  const ringL = new THREE.Mesh(ringGeo, ringMat2); ringL.position.set(-halfLen, AXIS_Y, 0); ringL.rotation.y = Math.PI / 2; root.add(ringL)
  const ringR2 = new THREE.Mesh(ringGeo, ringMat2); ringR2.position.set(+halfLen, AXIS_Y, 0); ringR2.rotation.y = Math.PI / 2; root.add(ringR2)

  // Chuck-depth boundary ring (red — shows end of clamped zone)
  if (clampLen > 0) {
    const clampRingGeo = new THREE.TorusGeometry(stockR + 1.5, 1.2, 8, 32)
    const clampRing = new THREE.Mesh(clampRingGeo,
      new THREE.MeshBasicMaterial({ color: 0xff4444, opacity: 0.85, transparent: true }))
    clampRing.position.set(-halfLen + clampLen, AXIS_Y, 0)
    clampRing.rotation.y = Math.PI / 2
    root.add(clampRing)
  }

  // Clamp-offset boundary ring (orange — shows start of machinable zone)
  if (offsetLen > 0) {
    const offRingGeo = new THREE.TorusGeometry(stockR + 1.5, 1.2, 8, 32)
    const offRing = new THREE.Mesh(offRingGeo,
      new THREE.MeshBasicMaterial({ color: 0xe67e22, opacity: 0.85, transparent: true }))
    offRing.position.set(-halfLen + clampLen + offsetLen, AXIS_Y, 0)
    offRing.rotation.y = Math.PI / 2
    root.add(offRing)
  }

  // ── Support posts ────────────────────────────────────────────────────────────
  // Each post is a cylinder that runs the FULL length of the stock along the
  // rotation axis (Three.js X).  The model is designed around the post: as
  // outer material is machined away the post keeps the part gripped in the chuck.
  if (posts && posts.count > 0 && posts.diameterMm > 0) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.35, metalness: 0.15 })
    const postR   = Math.max(0.5, posts.diameterMm / 2)
    for (let i = 0; i < posts.count; i++) {
      const angle    = (i / posts.count) * Math.PI * 2
      const offsetR  = posts.offsetRadiusMm ?? 0
      // Position along rotation axis: Y = AXIS_Y + offsetR·cos(θ), Z = offsetR·sin(θ)
      const py = AXIS_Y + offsetR * Math.cos(angle)
      const pz = offsetR * Math.sin(angle)
      // CylinderGeometry default axis = Three.js Y; rotate 90° about Z → aligns with X
      const postGeo = new THREE.CylinderGeometry(postR, postR, stockLen, 16)
      const postMesh = new THREE.Mesh(postGeo, postMat)
      postMesh.position.set(0, py, pz)
      postMesh.rotation.set(0, 0, Math.PI / 2)
      root.add(postMesh)
    }
  }

  // Rotation axis centerline
  const axisLinePts = [
    new THREE.Vector3(-(halfLen + 110), AXIS_Y, 0),
    new THREE.Vector3(+(halfLen + 110), AXIS_Y, 0),
  ]
  root.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(axisLinePts),
    new THREE.LineBasicMaterial({ color: 0xff6600, opacity: 0.32, transparent: true })
  ))

  void scene
  return root
}

// Dispose of all geometries and materials in a Group recursively
function disposeGroup(group: THREE.Group): void {
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else obj.material.dispose()
    }
    if (obj instanceof THREE.Line) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else (obj.material as THREE.Material).dispose()
    }
  })
}

// ── Gizmo builders ────────────────────────────────────────────────────────────
function mat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: opacity < 1, opacity })
}

function buildTranslateGizmo(): THREE.Group {
  const root = new THREE.Group(); root.name = 'gizmo'
  for (const [ax, col] of Object.entries(AX_COLOR) as [keyof typeof AX_COLOR, number][]) {
    const g = new THREE.Group(); g.userData.axis = ax
    // shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 35, 6), mat(col))
    shaft.position.y = 17.5; shaft.userData.axis = ax; shaft.renderOrder = 999
    // arrowhead cone
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 8), mat(col))
    cone.position.y = 42; cone.userData.axis = ax; cone.renderOrder = 999
    g.add(shaft, cone)
    if (ax === 'x') g.rotation.z = -Math.PI / 2
    if (ax === 'z') g.rotation.x =  Math.PI / 2
    root.add(g)
  }
  // center handle
  const center = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), mat(0xffffff, 0.9))
  center.userData.axis = 'xyz'; center.renderOrder = 999
  root.add(center)
  return root
}

function buildRotateGizmo(): THREE.Group {
  const root = new THREE.Group(); root.name = 'gizmo'
  const R = 44, tube = 2
  for (const [ax, col] of Object.entries(AX_COLOR) as [keyof typeof AX_COLOR, number][]) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(R, tube, 6, 40),
      mat(col, 0.85)
    )
    torus.userData.axis = ax; torus.renderOrder = 999
    if (ax === 'x') torus.rotation.y = Math.PI / 2
    if (ax === 'z') torus.rotation.x = Math.PI / 2
    root.add(torus)
  }
  // center sphere
  const center = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), mat(0xffffff, 0.7))
  center.userData.axis = 'xyz'; center.renderOrder = 999
  root.add(center)
  return root
}

function buildScaleGizmo(): THREE.Group {
  const root = new THREE.Group(); root.name = 'gizmo'
  for (const [ax, col] of Object.entries(AX_COLOR) as [keyof typeof AX_COLOR, number][]) {
    const g = new THREE.Group(); g.userData.axis = ax
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 35, 6), mat(col))
    shaft.position.y = 17.5; shaft.userData.axis = ax; shaft.renderOrder = 999
    const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat(col))
    cube.position.y = 42; cube.userData.axis = ax; cube.renderOrder = 999
    g.add(shaft, cube)
    if (ax === 'x') g.rotation.z = -Math.PI / 2
    if (ax === 'z') g.rotation.x =  Math.PI / 2
    root.add(g)
  }
  const center = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat(0xffffff, 0.9))
  center.userData.axis = 'xyz'; center.renderOrder = 999
  root.add(center)
  return root
}

function applyTransform(mesh: THREE.Mesh, t: ModelTransform): void {
  mesh.position.set(t.position.x, t.position.z, t.position.y)
  mesh.rotation.set(deg(t.rotation.x), deg(t.rotation.z), deg(t.rotation.y))
  mesh.scale.set(t.scale.x, t.scale.z, t.scale.y)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  stlPath: string | null
  stock: StockDimensions
  transform: ModelTransform
  transformMode: GizmoMode
  mode?: string
  gcodeOut?: string | null
  /** How many mm of stock are clamped inside the chuck (5 or 10). Default 5. */
  chuckDepthMm?: number
  /** Safety buffer between clamped zone and model, shown as orange (mm). Default 0. */
  clampOffsetMm?: number
  /** Support post(s) — cylinder(s) running axially through the workpiece centre. */
  posts?: PostConfig4Axis | null
  onTransformChange?: (t: ModelTransform) => void
  onModelLoaded?: (sx: number, sy: number, sz: number) => void
}

export function ShopModelViewer({
  stlPath, stock, transform, transformMode, mode, gcodeOut,
  chuckDepthMm = 5, clampOffsetMm = 0, posts = null,
  onTransformChange, onModelLoaded
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)

  // Store everything mutable in a ref so effects don't capture stale values
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera
    mesh: THREE.Mesh | null; stockBox: THREE.LineSegments | null
    fourAxisRig: THREE.Group | null
    toolpathGrp: THREE.Group | null
    gizmo: THREE.Group | null; gizmoMode: GizmoMode
    animId: number
    // orbit
    isDragging: boolean; isPanning: boolean
    lastMouse: { x: number; y: number }
    phi: number; theta: number; radius: number; target: THREE.Vector3
    // gizmo drag
    draggingAxis: string | null
    dragStartMouse: { x: number; y: number }
    dragStartTransform: ModelTransform | null
    hoveredAxis: string | null
    // live refs so callbacks always see fresh values
    transformRef: ModelTransform
    onTransformRef: ((t: ModelTransform) => void) | undefined
  } | null>(null)

  // Keep live refs so mouse handlers always see the latest props
  useEffect(() => {
    if (stateRef.current) {
      stateRef.current.transformRef    = transform
      stateRef.current.onTransformRef  = onTransformChange
    }
  })

  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [modelSize,      setModelSize]      = useState('')
  const [showToolpath,   setShowToolpath]   = useState(false)
  const [toolpathStats,  setToolpathStats]  = useState<{ rapids: number; cuts: number; plunges: number } | null>(null)
  const [toolpathLoading, setToolpathLoading] = useState(false)

  const is4Axis = mode === 'cnc_4axis' || mode === 'cnc_5axis'

  // ── Load / clear toolpath ─────────────────────────────────────────────────
  const loadToolpath = useCallback(async (path: string) => {
    const s = stateRef.current
    if (!s) return
    // Remove existing
    if (s.toolpathGrp) {
      disposeGroup(s.toolpathGrp)
      s.scene.remove(s.toolpathGrp)
      s.toolpathGrp = null
    }
    setToolpathLoading(true)
    try {
      const b64 = await (window as Window & { fab: { fsReadBase64:(p:string)=>Promise<string> } }).fab.fsReadBase64(path)
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      const geo = parseGcodeToolpath(text, {
        fourAxis: is4Axis,
        stockLenMm: stock.x
      })
      const grp = buildToolpathGroup(geo)
      s.scene.add(grp)
      s.toolpathGrp = grp
      setToolpathStats(geo.stats)
    } catch (e) {
      console.warn('Toolpath load failed:', e)
    } finally {
      setToolpathLoading(false)
    }
  }, [is4Axis, stock.x])

  const clearToolpath = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (s.toolpathGrp) {
      disposeGroup(s.toolpathGrp)
      s.scene.remove(s.toolpathGrp)
      s.toolpathGrp = null
    }
    setToolpathStats(null)
  }, [])

  useEffect(() => {
    if (showToolpath && gcodeOut) {
      void loadToolpath(gcodeOut)
    } else {
      clearToolpath()
    }
  }, [showToolpath, gcodeOut, loadToolpath, clearToolpath])

  // ── Init Three.js ────────────────────────────────────────────────────────────
  useEffect(() => {
    const c0 = canvasRef.current
    const w0 = wrapRef.current
    if (!c0 || !w0) return
    const canvasEl: HTMLCanvasElement = c0
    const wrapEl: HTMLDivElement = w0

    const W = wrapEl.clientWidth  || 800
    const H = wrapEl.clientHeight || 600
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(W, H)
    renderer.setClearColor(0x0d0e10)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(1, 2, 3); scene.add(d1)
    const d2 = new THREE.DirectionalLight(0x8899ff, 0.3); d2.position.set(-2,-1,-2); scene.add(d2)
    scene.add(new THREE.GridHelper(400, 20, 0x2e3140, 0x1c1e22))
    scene.add(new THREE.AxesHelper(20))

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 10000)
    camera.position.set(0, 120, 200)

    const raycaster = new THREE.Raycaster()

    const s = {
      renderer, scene, camera,
      mesh: null as THREE.Mesh | null, stockBox: null as THREE.LineSegments | null,
      fourAxisRig: null as THREE.Group | null,
      toolpathGrp: null as THREE.Group | null,
      gizmo: null as THREE.Group | null, gizmoMode: null as GizmoMode,
      animId: 0,
      isDragging: false, isPanning: false,
      lastMouse: { x: 0, y: 0 },
      phi: Math.PI / 3, theta: Math.PI / 4, radius: 250, target: new THREE.Vector3(),
      draggingAxis: null as string | null,
      dragStartMouse: { x: 0, y: 0 },
      dragStartTransform: null as ModelTransform | null,
      hoveredAxis: null as string | null,
      transformRef: transform,
      onTransformRef: onTransformChange
    }
    stateRef.current = s

    // ── Render loop ──────────────────────────────────────────────────────────
    function render(): void {
      s.animId = requestAnimationFrame(render)
      // Update orbit camera
      const cx = s.radius * Math.sin(s.phi) * Math.cos(s.theta) + s.target.x
      const cy = s.radius * Math.cos(s.phi)                      + s.target.y
      const cz = s.radius * Math.sin(s.phi) * Math.sin(s.theta)  + s.target.z
      s.camera.position.set(cx, cy, cz)
      s.camera.lookAt(s.target)
      // Resize gizmo to stay constant screen-size
      if (s.gizmo && s.mesh) {
        s.gizmo.position.copy(s.mesh.position)
        s.gizmo.scale.setScalar(s.radius * 0.20 / 50)
      }
      s.renderer.render(s.scene, s.camera)
    }
    render()

    // ── Helpers ───────────────────────────────────────────────────────────────
    function ndcOf(e: { clientX: number; clientY: number }): THREE.Vector2 {
      const r = canvasEl.getBoundingClientRect()
      return new THREE.Vector2(
        (e.clientX - r.left) / r.width  *  2 - 1,
       -(e.clientY - r.top)  / r.height *  2 + 1
      )
    }

    function gizmoAxisAt(e: MouseEvent): string | null {
      if (!s.gizmo) return null
      raycaster.setFromCamera(ndcOf(e), s.camera)
      const hits = raycaster.intersectObjects(s.gizmo.children, true)
      return hits.length > 0 ? (hits[0].object.userData.axis as string ?? null) : null
    }

    function setHover(axis: string | null): void {
      if (axis === s.hoveredAxis) return
      s.hoveredAxis = axis
      if (!s.gizmo) return
      s.gizmo.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return
        const m = obj.material as THREE.MeshBasicMaterial
        const ax = obj.userData.axis as string
        if (!ax) return
        const base = AX_COLOR[ax as keyof typeof AX_COLOR] ?? 0xffffff
        m.color.setHex(axis && (ax === axis || ax === 'xyz') ? AX_HOVER : base)
      })
    }

    // Project a world-axis direction to a normalised 2D screen direction
    function screenDir(worldAxis: THREE.Vector3): THREE.Vector2 {
      const origin = s.gizmo?.position.clone() ?? new THREE.Vector3()
      const tip = origin.clone().add(worldAxis.clone().multiplyScalar(50))
      const p0 = origin.clone().project(s.camera)
      const p1 = tip.clone().project(s.camera)
      const d = new THREE.Vector2(p1.x - p0.x, p1.y - p0.y)
      return d.length() < 0.0001 ? new THREE.Vector2(1, 0) : d.normalize()
    }

    function axisVec(ax: string): THREE.Vector3 {
      if (ax === 'x') return new THREE.Vector3(1, 0, 0)
      if (ax === 'y') return new THREE.Vector3(0, 1, 0)
      if (ax === 'z') return new THREE.Vector3(0, 0, 1)
      return new THREE.Vector3()
    }

    // ── Mouse handlers ────────────────────────────────────────────────────────
    function onDown(e: MouseEvent): void {
      const ax = gizmoAxisAt(e)
      if (ax && s.gizmoMode) {
        s.draggingAxis = ax
        s.dragStartMouse = { x: e.clientX, y: e.clientY }
        s.dragStartTransform = JSON.parse(JSON.stringify(s.transformRef)) as ModelTransform
        canvasEl.style.cursor = 'none'
        return
      }
      if (e.button === 2 || e.button === 1) s.isPanning = true
      else s.isDragging = true
      s.lastMouse = { x: e.clientX, y: e.clientY }
    }

    function onMove(e: MouseEvent): void {
      const dx = e.clientX - s.lastMouse.x
      const dy = e.clientY - s.lastMouse.y

      // ── Gizmo drag ────────────────────────────────────────────────────────
      if (s.draggingAxis && s.dragStartTransform && s.onTransformRef) {
        const totalDx = e.clientX - s.dragStartMouse.x
        const totalDy = e.clientY - s.dragStartMouse.y
        const t = JSON.parse(JSON.stringify(s.dragStartTransform)) as ModelTransform

        if (s.gizmoMode === 'translate') {
          if (s.draggingAxis === 'xyz') {
            // Free XY move in camera plane
            const right = new THREE.Vector3()
            const up = new THREE.Vector3(0, 1, 0)
            right.crossVectors(s.camera.position.clone().sub(s.target).normalize(), up).normalize()
            const scale = s.radius * 0.0015
            t.position.x += right.x * totalDx * scale
            t.position.z += right.z * totalDx * scale
            t.position.z -= totalDy * scale
          } else {
            const av = axisVec(s.draggingAxis)
            const sd = screenDir(av)
            const rect = canvasEl.getBoundingClientRect()
            const ndcDx = totalDx / rect.width
            const ndcDy = -totalDy / rect.height
            const proj = ndcDx * sd.x + ndcDy * sd.y
            const worldDelta = proj * s.radius * 1.8
            const modelAx = THREEJS_TO_MODEL[s.draggingAxis as keyof typeof THREEJS_TO_MODEL]
            if (modelAx) (t.position as Record<string, number>)[modelAx] = (s.dragStartTransform.position as Record<string, number>)[modelAx] + worldDelta
          }
        }

        if (s.gizmoMode === 'rotate') {
          const DEG_PER_PX = 0.5
          if (s.draggingAxis === 'x') t.rotation.x = s.dragStartTransform.rotation.x - totalDy * DEG_PER_PX
          if (s.draggingAxis === 'y') t.rotation.z = s.dragStartTransform.rotation.z + totalDx * DEG_PER_PX
          if (s.draggingAxis === 'z') t.rotation.y = s.dragStartTransform.rotation.y + totalDx * DEG_PER_PX
          if (s.draggingAxis === 'xyz') {
            t.rotation.z = s.dragStartTransform.rotation.z + totalDx * DEG_PER_PX
            t.rotation.x = s.dragStartTransform.rotation.x - totalDy * DEG_PER_PX
          }
        }

        if (s.gizmoMode === 'scale') {
          const SCALE_PER_PX = 0.005
          const delta = totalDx * SCALE_PER_PX
          if (s.draggingAxis === 'xyz') {
            t.scale.x = Math.max(0.01, s.dragStartTransform.scale.x + delta)
            t.scale.y = Math.max(0.01, s.dragStartTransform.scale.y + delta)
            t.scale.z = Math.max(0.01, s.dragStartTransform.scale.z + delta)
          } else {
            const modelAx = THREEJS_TO_MODEL[s.draggingAxis as keyof typeof THREEJS_TO_MODEL]
            if (modelAx) (t.scale as Record<string, number>)[modelAx] = Math.max(0.01, (s.dragStartTransform.scale as Record<string, number>)[modelAx] + delta)
          }
        }

        s.onTransformRef(t)
        s.lastMouse = { x: e.clientX, y: e.clientY }
        return
      }

      // ── Orbit / pan ───────────────────────────────────────────────────────
      if (s.isDragging) {
        s.theta -= dx * 0.008
        s.phi = Math.max(0.05, Math.min(Math.PI - 0.05, s.phi + dy * 0.008))
      } else if (s.isPanning) {
        const right = new THREE.Vector3()
        right.crossVectors(s.camera.position.clone().sub(s.target).normalize(), new THREE.Vector3(0,1,0)).normalize()
        const sc = s.radius * 0.001
        s.target.addScaledVector(right, -dx * sc)
        s.target.y += dy * sc
      } else {
        // hover gizmo highlight
        setHover(gizmoAxisAt(e))
      }
      s.lastMouse = { x: e.clientX, y: e.clientY }
    }

    function onUp(): void {
      s.draggingAxis = null
      s.dragStartTransform = null
      s.isDragging = false
      s.isPanning = false
      canvasEl.style.cursor = ''
    }
    function onWheel(e: WheelEvent): void {
      s.radius = Math.max(10, Math.min(3000, s.radius + e.deltaY * 0.4))
    }

    const onContextMenu = (e: Event): void => { e.preventDefault() }

    canvasEl.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvasEl.addEventListener('wheel', onWheel, { passive: true })
    canvasEl.addEventListener('contextmenu', onContextMenu)

    // ── ResizeObserver ────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const nw = wrapEl.clientWidth, nh = wrapEl.clientHeight
      if (!nw || !nh) return
      s.renderer.setSize(nw, nh)
      s.camera.aspect = nw / nh
      s.camera.updateProjectionMatrix()
    })
    ro.observe(wrapEl)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(s.animId)
      renderer.dispose()
      canvasEl.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvasEl.removeEventListener('wheel', onWheel)
      canvasEl.removeEventListener('contextmenu', onContextMenu)
      stateRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Rebuild gizmo when mode changes ──────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    // Remove old gizmo
    if (s.gizmo) { s.scene.remove(s.gizmo); s.gizmo = null }
    s.gizmoMode = transformMode
    if (!transformMode) return
    const g = transformMode === 'translate' ? buildTranslateGizmo()
             : transformMode === 'rotate'    ? buildRotateGizmo()
             :                                 buildScaleGizmo()
    if (s.mesh) g.position.copy(s.mesh.position)
    s.scene.add(g)
    s.gizmo = g
  }, [transformMode])

  // ── Rebuild stock box or 4-axis rig ───────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s) return

    // Always remove the old flat stock box
    if (s.stockBox) { s.scene.remove(s.stockBox); s.stockBox = null }

    // Always remove old rig
    if (s.fourAxisRig) {
      disposeGroup(s.fourAxisRig)
      s.scene.remove(s.fourAxisRig)
      s.fourAxisRig = null
    }

    if (is4Axis) {
      // 4-axis mode: show rig + cylinder stock, hide flat box
      // Use stock.x as cylinder length, stock.y as diameter (matches 4-axis cylinderDiameterMm concept)
      const cylLen = Math.max(20, stock.x)
      const cylDia = Math.max(10, stock.y)
      const rig = buildFourAxisRig(cylLen, cylDia, chuckDepthMm, clampOffsetMm, posts, s.scene)
      s.scene.add(rig)
      s.fourAxisRig = rig
      // Adjust camera target to look at the rig center (slightly elevated)
      if (!stlPath) {
        s.target.set(0, 55, 0)
        s.radius = Math.max(s.radius, cylLen * 1.8 + 200)
        s.phi = Math.PI / 3.5
        s.theta = -Math.PI / 5
      }
    } else {
      // Normal mode: show flat stock box
      const b = buildStockBox(stock); s.scene.add(b); s.stockBox = b
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // posts is an object — serialize primitives into deps to avoid infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.x, stock.y, stock.z, is4Axis, chuckDepthMm, clampOffsetMm,
    posts?.count, posts?.diameterMm, posts?.offsetRadiusMm])

  // ── Load STL ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    if (s.mesh) { s.scene.remove(s.mesh); s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); s.mesh = null }
    if (!stlPath) { setModelSize(''); return }
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const b64 = await (window as Window & { fab: { fsReadBase64:(p:string)=>Promise<string> } }).fab.fsReadBase64(stlPath)
        const bin = atob(b64); const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const geo = parseStlBuffer(bytes.buffer)
        geo.computeBoundingBox()
        const bb = geo.boundingBox!
        const c = new THREE.Vector3(); bb.getCenter(c); geo.translate(-c.x, -c.y, -c.z)
        const sz = new THREE.Vector3(); bb.getSize(sz)
        setModelSize(`${sz.x.toFixed(1)} × ${sz.y.toFixed(1)} × ${sz.z.toFixed(1)} mm`)
        onModelLoaded?.(sz.x, sz.y, sz.z)
        const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
          color: 0x3d7eff, emissive: 0x0a1840, specular: 0x224488, shininess: 40, side: THREE.DoubleSide
        }))
        applyTransform(mesh, transform)
        s.scene.add(mesh); s.mesh = mesh
        const md = Math.max(sz.x, sz.y, sz.z)
        s.radius = md * 2.2; s.phi = Math.PI / 3; s.theta = Math.PI / 4
        if (is4Axis) {
          // In 4-axis mode, position model along the rotation axis
          s.target.set(0, 55, 0)
          s.radius = Math.max(s.radius, md * 2.5)
        } else {
          s.target.set(transform.position.x, transform.position.z * 0.5, transform.position.y)
        }
        setLoading(false)
      } catch (e) { setLoading(false); setError(e instanceof Error ? e.message : String(e)) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlPath])

  // ── Apply transform live ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s?.mesh) return
    applyTransform(s.mesh, transform)
  }, [transform.position.x, transform.position.y, transform.position.z,
      transform.rotation.x, transform.rotation.y, transform.rotation.z,
      transform.scale.x, transform.scale.y, transform.scale.z])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0d0e10' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {loading && (
        <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,background:'rgba(13,14,16,0.85)',pointerEvents:'none' }}>
          <span style={{ fontSize:28,opacity:0.5 }}>⟳</span>
          <span style={{ color:'var(--txt2)',fontSize:13 }}>Loading model…</span>
        </div>
      )}
      {error && !loading && (
        <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,background:'rgba(13,14,16,0.85)',pointerEvents:'none' }}>
          <span style={{ fontSize:22,color:'var(--err)' }}>⚠</span>
          <span style={{ color:'var(--err)',fontSize:12,maxWidth:320,textAlign:'center' }}>{error}</span>
        </div>
      )}
      {modelSize && !loading && !error && (
        <div style={{ position:'absolute',bottom:10,left:12,fontSize:10,color:'var(--txt2)',fontFamily:'var(--mono)',pointerEvents:'none',background:'rgba(13,14,16,0.6)',padding:'3px 7px',borderRadius:4 }}>
          Model: {modelSize}
        </div>
      )}
      {!loading && !error && (
        <div style={{ position:'absolute',bottom:10,right:12,fontSize:10,color:'var(--txt2)',pointerEvents:'none',background:'rgba(13,14,16,0.6)',padding:'3px 7px',borderRadius:4,display:'flex',alignItems:'center',gap:8 }}>
          {is4Axis ? (
            <>
              <span><span style={{ color:'#8a9aaa' }}>■</span> Headstock / Tailstock</span>
              <span><span style={{ color:'#cc4040' }}>■</span> Clamped ({chuckDepthMm}mm)</span>
              {(clampOffsetMm ?? 0) > 0 && (
                <span><span style={{ color:'#e67e22' }}>■</span> Offset ({clampOffsetMm}mm)</span>
              )}
              <span><span style={{ color:'#d4a55a' }}>■</span> Machinable</span>
              {posts && posts.count > 0 && (
                <span><span style={{ color:'#22c55e' }}>■</span> Post{posts.count > 1 ? `s ×${posts.count}` : ` Ø${posts.diameterMm}mm`}</span>
              )}
              <span><span style={{ color:'#3d7eff' }}>■</span> Model</span>
            </>
          ) : (
            <>
              <span><span style={{ color:'#f59e0b' }}>■</span> Stock</span>
              <span><span style={{ color:'#3d7eff' }}>■</span> Model</span>
            </>
          )}
        </div>
      )}
      {is4Axis && !loading && !error && (
        <div style={{ position:'absolute',top:10,left:12,fontSize:10,color:'#fbbf24',pointerEvents:'none',background:'rgba(13,14,16,0.7)',padding:'4px 8px',borderRadius:4,display:'flex',alignItems:'center',gap:6 }}>
          <span style={{ fontSize:14 }}>↻</span>
          <span>Makera Carvera · 4th Axis · Ø{stock.y}×{stock.x} mm &nbsp;|&nbsp; Chuck {chuckDepthMm}mm{(clampOffsetMm ?? 0) > 0 ? ` + ${clampOffsetMm}mm offset` : ''}{posts && posts.count > 0 ? ` · ${posts.count > 1 ? `${posts.count}×` : ''}Ø${posts.diameterMm}mm post` : ''}</span>
        </div>
      )}

      {/* Toolpath toggle button — top-right */}
      {gcodeOut && !loading && !error && (
        <div style={{ position:'absolute', top:10, right:12, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
          <button
            onClick={() => setShowToolpath(v => !v)}
            style={{
              background: showToolpath ? 'rgba(34,211,238,0.18)' : 'rgba(13,14,16,0.75)',
              border: `1px solid ${showToolpath ? '#22d3ee' : 'rgba(255,255,255,0.12)'}`,
              color: showToolpath ? '#22d3ee' : 'var(--txt2)',
              borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              display:'flex', alignItems:'center', gap:6, fontFamily: 'var(--mono)'
            }}
          >
            {toolpathLoading ? '⏳' : '🗺'} Toolpath {showToolpath ? 'ON' : 'OFF'}
          </button>
          {showToolpath && toolpathStats && (
            <div style={{ background:'rgba(13,14,16,0.8)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:5, padding:'5px 9px', fontSize:10, fontFamily:'var(--mono)', color:'var(--txt2)', display:'flex', flexDirection:'column', gap:3 }}>
              <span><span style={{ color:'#fbbf24' }}>▬</span> Rapids: {toolpathStats.rapids.toLocaleString()}</span>
              <span><span style={{ color:'#e879f9' }}>▬</span> Plunges: {toolpathStats.plunges.toLocaleString()}</span>
              <span><span style={{ color:'#22d3ee' }}>▬</span> Cuts: {toolpathStats.cuts.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ShopModelViewer
