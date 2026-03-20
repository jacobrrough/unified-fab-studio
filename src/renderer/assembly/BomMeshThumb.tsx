import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

const MAX_CONCURRENT = 3
let inFlight = 0
const queue: Array<() => void> = []

const MAX_CACHE_ENTRIES = 80
const thumbDataUrlCache = new Map<string, string>()

function cacheKey(projectDir: string, meshPath: string): string {
  return `${projectDir}\0${meshPath}`
}

function cacheGet(projectDir: string, meshPath: string): string | undefined {
  return thumbDataUrlCache.get(cacheKey(projectDir, meshPath))
}

function cacheSet(projectDir: string, meshPath: string, dataUrl: string): void {
  const k = cacheKey(projectDir, meshPath)
  if (thumbDataUrlCache.has(k)) thumbDataUrlCache.delete(k)
  thumbDataUrlCache.set(k, dataUrl)
  while (thumbDataUrlCache.size > MAX_CACHE_ENTRIES) {
    const first = thumbDataUrlCache.keys().next().value as string
    thumbDataUrlCache.delete(first)
  }
}

function pump(): void {
  while (inFlight < MAX_CONCURRENT && queue.length) {
    const fn = queue.shift()!
    inFlight++
    fn()
  }
}

type Props = {
  projectDir: string
  meshPath: string | undefined | null
}

async function rasterizeStlToDataUrl(projectDir: string, meshPath: string): Promise<string> {
  const r = await window.fab.assemblyReadStlBase64(projectDir, meshPath)
  if (!r.ok) throw new Error(r.error ?? 'stl_read_failed')
  const loader = new STLLoader()
  const raw = atob(r.base64)
  const buf = new Uint8Array(raw.length)
  for (let k = 0; k < raw.length; k++) buf[k] = raw.charCodeAt(k)
  const geom = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  geom.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({ color: 0xa78bfa, metalness: 0.1, roughness: 0.45 })
  )
  mesh.rotation.x = -Math.PI / 2
  const scene = new THREE.Scene()
  scene.add(mesh)
  scene.add(new THREE.AmbientLight(0x404040))
  const dl = new THREE.DirectionalLight(0xffffff, 1)
  dl.position.set(1, 1, 2)
  scene.add(dl)
  const box = new THREE.Box3().setFromObject(mesh)
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  mesh.position.sub(center)
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setSize(48, 48)
  renderer.setClearColor(0x0c0612, 1)
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, maxDim * 100)
  cam.position.set(maxDim * 1.4, maxDim * 0.9, maxDim * 1.4)
  cam.lookAt(0, 0, 0)
  renderer.render(scene, cam)
  const url = canvas.toDataURL('image/png')
  geom.dispose()
  ;(mesh.material as THREE.Material).dispose()
  renderer.dispose()
  return url
}

/**
 * Lazy 48×48 raster preview from binary STL (same path as viewport / interference).
 * Caches by project + path; loads when scrolled near viewport (IntersectionObserver).
 */
export function BomMeshThumb({ projectDir, meshPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<'empty' | 'loading' | 'ok' | 'err'>('empty')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (e?.isIntersecting) setVisible(true)
      },
      { root: null, rootMargin: '120px', threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const p = meshPath?.trim()
    if (!p) {
      setDataUrl(null)
      setPhase('empty')
      return
    }
    if (!visible) {
      setPhase('empty')
      setDataUrl(null)
      return
    }

    const cached = cacheGet(projectDir, p)
    if (cached) {
      setDataUrl(cached)
      setPhase('ok')
      return
    }

    let cancelled = false
    const run = () => {
      void (async () => {
        setPhase('loading')
        setDataUrl(null)
        try {
          const url = await rasterizeStlToDataUrl(projectDir, p)
          if (cancelled) return
          cacheSet(projectDir, p, url)
          setDataUrl(url)
          setPhase('ok')
        } catch {
          if (!cancelled) setPhase('err')
        } finally {
          inFlight--
          pump()
        }
      })()
    }
    queue.push(run)
    pump()
    return () => {
      cancelled = true
    }
  }, [projectDir, meshPath, visible])

  if (!meshPath?.trim()) {
    return (
      <div ref={containerRef} style={{ minHeight: 48, minWidth: 48 }}>
        <span className="msg msg--muted">—</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ minHeight: 48, minWidth: 48 }}>
      {!visible ? (
        <span className="msg msg--muted" title="Scroll to load thumbnail">
          ○
        </span>
      ) : phase === 'err' ? (
        <span className="msg msg--muted" title="Could not rasterize STL for thumbnail">
          !
        </span>
      ) : phase === 'loading' && !dataUrl ? (
        <span className="msg msg--muted" aria-busy="true">
          …
        </span>
      ) : dataUrl ? (
        <img
          src={dataUrl}
          width={48}
          height={48}
          alt=""
          style={{ display: 'block', borderRadius: 4, verticalAlign: 'middle' }}
        />
      ) : (
        <span className="msg msg--muted">…</span>
      )}
    </div>
  )
}
