import { describe, expect, it } from 'vitest'
import { spawnBounded } from './subprocess-bounded'

describe('spawnBounded', () => {
  it('captures stdout from node -e', async () => {
    const r = await spawnBounded(process.execPath, ['-e', "console.log('ok')"], { timeoutMs: 10_000 })
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe('ok')
  })

  it('rejects when output exceeds maxBufferBytes', async () => {
    const script =
      "for (let i = 0; i < 5000; i++) { process.stdout.write('y'.repeat(200) + '\\n') }"
    await expect(
      spawnBounded(process.execPath, ['-e', script], {
        timeoutMs: 30_000,
        maxBufferBytes: 4000
      })
    ).rejects.toThrow(/maxBufferBytes/)
  })

  it('rejects on timeout for a long-running child', async () => {
    await expect(
      spawnBounded(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        timeoutMs: 400,
        maxBufferBytes: 1024 * 1024
      })
    ).rejects.toThrow(/timed out/)
  })
})
