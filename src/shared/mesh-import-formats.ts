/** Tier A + B: extensions offered by the unified import dialog and registry. */
export const MESH_IMPORT_FILE_EXTENSIONS = [
  'stl',
  'step',
  'stp',
  'obj',
  'ply',
  'gltf',
  'glb',
  '3mf',
  /** Tier B: common trimesh loaders (no extra binary deps in typical installs). */
  'off',
  'dae'
] as const

export type MeshImportFileExtension = (typeof MESH_IMPORT_FILE_EXTENSIONS)[number]

/** Extensions converted via `engines/mesh/mesh_to_stl.py` (trimesh). */
export const MESH_PYTHON_EXTENSIONS = new Set<string>([
  'obj',
  'ply',
  'gltf',
  'glb',
  '3mf',
  'off',
  'dae'
])
