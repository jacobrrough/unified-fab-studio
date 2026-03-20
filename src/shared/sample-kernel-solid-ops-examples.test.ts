import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { partFeaturesFileSchema } from './part-features-schema'

const here = dirname(fileURLToPath(import.meta.url))
const samplePartDir = join(here, '../../resources/sample-kernel-solid-ops/part')

describe('sample-kernel-solid-ops part examples', () => {
  it('every *.example.json under resources/sample-kernel-solid-ops/part parses as part features', () => {
    const names = readdirSync(samplePartDir).filter((f) => f.endsWith('.example.json'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const raw = readFileSync(join(samplePartDir, name), 'utf8')
      const parsed = partFeaturesFileSchema.safeParse(JSON.parse(raw))
      expect(parsed.success, `${name}: ${parsed.success ? '' : JSON.stringify(parsed.error.format())}`).toBe(
        true
      )
    }
  })
})
