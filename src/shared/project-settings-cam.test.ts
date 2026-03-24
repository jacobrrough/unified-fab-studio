import { describe, expect, it } from 'vitest'
import { appSettingsSchema } from './project-schema'

describe('appSettingsSchema WorkTrackCAM fields', () => {
  it('parses partial settings with manufacturing default and safety fields', () => {
    const parsed = appSettingsSchema.parse({
      theme: 'dark',
      recentProjectPaths: [],
      camGcodeSafetyAcknowledged: true,
      camDefaultPostTemplate: 'grbl-mm.gcode.hbs',
      camDefaultMachineDialect: 'generic_mm'
    })
    expect(parsed.camGcodeSafetyAcknowledged).toBe(true)
    expect(parsed.camDefaultPostTemplate).toBe('grbl-mm.gcode.hbs')
    expect(parsed.camDefaultMachineDialect).toBe('generic_mm')
  })

  it('allows CAM fields to be absent', () => {
    const parsed = appSettingsSchema.parse({ theme: 'dark', recentProjectPaths: [] })
    expect(parsed.camGcodeSafetyAcknowledged).toBeUndefined()
    expect(parsed.camDefaultPostTemplate).toBeUndefined()
    expect(parsed.camDefaultMachineDialect).toBeUndefined()
  })

  it('rejects invalid camDefaultMachineDialect', () => {
    expect(() =>
      appSettingsSchema.parse({
        theme: 'dark',
        recentProjectPaths: [],
        camDefaultMachineDialect: 'invalid'
      })
    ).toThrow()
  })

  it('merges like settings-store defaults + patch', () => {
    const defaults = { theme: 'dark' as const, recentProjectPaths: [] as string[] }
    const patch = { camGcodeSafetyAcknowledged: false }
    const parsed = appSettingsSchema.parse({ ...defaults, ...patch })
    expect(parsed.camGcodeSafetyAcknowledged).toBe(false)
    expect(parsed.theme).toBe('dark')
  })
})
