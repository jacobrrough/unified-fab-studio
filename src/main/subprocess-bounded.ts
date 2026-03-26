import { spawn } from 'node:child_process'

export type SpawnBoundedOptions = {
  cwd?: string
  /** Merged onto `process.env` when set. */
  env?: NodeJS.ProcessEnv
  shell?: boolean
  /** Omit or `null` for no timeout. */
  timeoutMs?: number | null
  /** Total cap for decoded stdout+stderr (UTF-8 string length). Default 10 MiB. */
  maxBufferBytes?: number
}

export type SpawnBoundedResult = {
  code: number | null
  stdout: string
  stderr: string
}

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024

/**
 * Spawn a child process with optional timeout and a hard cap on accumulated stdout/stderr size
 * to avoid main-process memory blowups from noisy or runaway tools.
 */
export function spawnBounded(
  command: string,
  args: string[],
  options: SpawnBoundedOptions = {}
): Promise<SpawnBoundedResult> {
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
  const timeoutMs = options.timeoutMs

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : { ...process.env },
      shell: options.shell ?? false
    })

    let stdout = ''
    let stderr = ''
    let combinedLen = 0
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const clearTimer = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimer()
      fn()
    }

    const append = (which: 'stdout' | 'stderr', chunk: Buffer): void => {
      const s = chunk.toString()
      if (combinedLen + s.length > maxBufferBytes) {
        finish(() => {
          try {
            child.kill()
          } catch {
            /* ignore */
          }
          reject(
            new Error(
              `Child process output exceeded maxBufferBytes (${maxBufferBytes}); process was killed.`
            )
          )
        })
        return
      }
      combinedLen += s.length
      if (which === 'stdout') stdout += s
      else stderr += s
    }

    if (timeoutMs != null && timeoutMs > 0) {
      timer = setTimeout(() => {
        finish(() => {
          try {
            child.kill()
          } catch {
            /* ignore */
          }
          reject(
            new Error(
              `Process timed out after ${timeoutMs / 1000}s. Check the executable path and whether the task can finish on this machine.`
            )
          )
        })
      }, timeoutMs)
    }

    child.stdout?.on('data', (d: Buffer) => append('stdout', d))
    child.stderr?.on('data', (d: Buffer) => append('stderr', d))
    child.on('error', (err) => {
      finish(() => reject(err))
    })
    child.on('close', (code) => {
      finish(() => resolve({ code, stdout, stderr }))
    })
  })
}
