import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectSchema, type ProjectFile } from '../shared/project-schema'

export async function readProjectFile(projectDir: string): Promise<ProjectFile> {
  const p = join(projectDir, 'project.json')
  const raw = await readFile(p, 'utf-8')
  const data = JSON.parse(raw) as unknown
  return projectSchema.parse(data)
}

export async function writeProjectFile(projectDir: string, project: ProjectFile): Promise<void> {
  await mkdir(projectDir, { recursive: true })
  const p = join(projectDir, 'project.json')
  await writeFile(p, JSON.stringify(project, null, 2), 'utf-8')
}

export function newProject(name: string, activeMachineId: string): ProjectFile {
  return {
    version: 1,
    name,
    updatedAt: new Date().toISOString(),
    activeMachineId,
    meshes: [],
    importHistory: [],
    notes: ''
  }
}
