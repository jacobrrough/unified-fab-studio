import Handlebars from 'handlebars'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MachineProfile } from '../shared/machine-schema'

export type PostContext = {
  machine: MachineProfile
  /** One G-code block per line, no header/footer */
  toolpathLines: string[]
  spindleOn: string
  spindleOff: string
  units: 'G21' | 'G20'
  /** e.g. G54…G59 when workCoordinateIndex 1–6 was supplied to the post. */
  wcsLine?: string
}

function dialectSnippets(dialect: MachineProfile['dialect']): { on: string; off: string; units: 'G21' | 'G20' } {
  switch (dialect) {
    case 'grbl':
      return { on: 'M3 S12000', off: 'M5', units: 'G21' }
    case 'grbl_4axis':
      // Carvera with 4th-axis: confirm actual RPM range in Makera docs
      return { on: 'M3 S18000', off: 'M5', units: 'G21' }
    case 'mach3':
      return { on: 'M3', off: 'M5', units: 'G21' }
    default:
      return { on: 'M3 S10000', off: 'M5', units: 'G21' }
  }
}

function workOffsetLine(index: number | undefined): string | undefined {
  if (index == null) return undefined
  if (!Number.isInteger(index) || index < 1 || index > 6) return undefined
  return `G${53 + index}`
}

export async function renderPost(
  resourcesRoot: string,
  machine: MachineProfile,
  toolpathLines: string[],
  opts?: { workCoordinateIndex?: number }
): Promise<string> {
  const tplPath = join(resourcesRoot, 'posts', machine.postTemplate)
  const source = await readFile(tplPath, 'utf-8')
  const { on, off, units } = dialectSnippets(machine.dialect)
  const wcsLine = workOffsetLine(opts?.workCoordinateIndex)
  const ctx: PostContext = {
    machine,
    toolpathLines,
    spindleOn: on,
    spindleOff: off,
    units,
    ...(wcsLine ? { wcsLine } : {})
  }
  const template = Handlebars.compile(source)
  return template(ctx)
}
