import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { machineProfileSchema, type MachineProfile } from '../shared/machine-schema'
import { getResourcesRoot } from './paths'

export async function loadAllMachines(): Promise<MachineProfile[]> {
  const dir = join(getResourcesRoot(), 'machines')
  const names = await readdir(dir)
  const out: MachineProfile[] = []
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    const raw = await readFile(join(dir, n), 'utf-8')
    const data = JSON.parse(raw) as unknown
    out.push(machineProfileSchema.parse(data))
  }
  return out
}

export async function getMachineById(id: string): Promise<MachineProfile | null> {
  const all = await loadAllMachines()
  return all.find((m) => m.id === id) ?? null
}
