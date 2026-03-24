import { describe, expect, it } from 'vitest'
import { sanitizeMachineIdForToolLibrary } from './machine-tool-library'

describe('sanitizeMachineIdForToolLibrary', () => {
  it('normalizes ids', () => {
    expect(sanitizeMachineIdForToolLibrary('  My-Machine_1  ')).toBe('my-machine_1')
  })

  it('throws on empty', () => {
    expect(() => sanitizeMachineIdForToolLibrary('   ')).toThrow()
  })
})
