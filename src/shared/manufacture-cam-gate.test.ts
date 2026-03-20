import { describe, expect, it } from 'vitest'
import { getManufactureCamRunBlock, isManufactureKindBlockedFromCam } from './manufacture-cam-gate'

describe('manufacture-cam-gate', () => {
  it('blocks only fdm_slice and export_stl', () => {
    expect(isManufactureKindBlockedFromCam(undefined)).toBe(false)
    expect(isManufactureKindBlockedFromCam('')).toBe(false)
    expect(isManufactureKindBlockedFromCam('cnc_parallel')).toBe(false)
    expect(isManufactureKindBlockedFromCam('fdm_slice')).toBe(true)
    expect(isManufactureKindBlockedFromCam('export_stl')).toBe(true)
  })

  it('returns structured messages for blocked kinds', () => {
    expect(getManufactureCamRunBlock('cnc_waterline')).toBeNull()
    const f = getManufactureCamRunBlock('fdm_slice')
    expect(f).not.toBeNull()
    expect(f!.error).toMatch(/FDM|Generate CAM/i)
    expect(f!.hint).toMatch(/Slice|Cura/i)
    const e = getManufactureCamRunBlock('export_stl')
    expect(e).not.toBeNull()
    expect(e!.hint).toMatch(/assets|planning/i)
  })
})
