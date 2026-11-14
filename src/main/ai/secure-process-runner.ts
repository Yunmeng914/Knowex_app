import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AIError } from './ai-errors'

const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000

export interface SecureProcessRunInput {
  executablePath: string
  args: string[]
  cwd: string
  stdin?: string
  timeoutMs?: number
  maxOutputBytes?: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}

export interface SecureProcessResult {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
}

export interface SecureProcessRunnerLike {
  run(input: SecureProcessRunInput): Promise<SecureProcessResult>
}

export class SecureProcessRunner implements SecureProcessRunnerLike {
  private readonly children = new Set<ChildProcessWithoutNullStreams>()

  async run(input: SecureProcessRunInput): Promise<SecureProcessResult> {
    const started = Date.now()
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    const executablePath = input.executablePath.trim()
    if (!isSafeExecutablePath(executablePath)) throw new AIError('UNSAFE_EXECUTABLE_PATH', 'The executable path is not safe to run.')
    await assertExecutableFile(executablePath)
    await mkdir(input.cwd, { recursive: true })

    return new Promise<SecureProcessResult>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let outputBytes = 0
      let settled = false
      let timedOut = false
      let outputTooLarge = false
      let cancelled = false

      const child = spawn(executablePath, input.args, {
        shell: false,
        cwd: input.cwd,
        env: createSafeProcessEnv(input.env)
      })
      this.children.add(child)

      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        input.signal?.removeEventListener('abort', onAbort)
        this.children.delete(child)
        callback()
      }

      const stopChild = (): void => {
        if (!child.killed) child.kill()
        windowedKill(child)
      }

      const timeout = setTimeout(() => {
        timedOut = true
        stopChild()
      }, timeoutMs)

      const onAbort = (): void => {
        cancelled = true
        stopChild()
      }
      input.signal?.addEventListener('abort', onAbort, { once: true })
      if (input.signal?.aborted) onAbort()

      child.on('error', (error) => {
        finish(() => reject(new AIError('LOCAL_TOOL_LAUNCH_FAILED', 'The local AI tool could not be started.', { cause: error })))
      })

      const capture = (chunk: Buffer, target: 'stdout' | 'stderr'): void => {
        outputBytes += chunk.byteLength
        const text = stripAnsi(chunk.toString('utf8'))
        if (target === 'stdout') stdout += text
        else stderr += text
        if (outputBytes > maxOutputBytes && !outputTooLarge) {
          outputTooLarge = true
          stopChild()
        }
      }

      child.stdout.on('data', (chunk: Buffer) => capture(chunk, 'stdout'))
      child.stderr.on('data', (chunk: Buffer) => capture(chunk, 'stderr'))
      if (input.stdin !== undefined) child.stdin.end(input.stdin, 'utf8')
      else child.stdin.end()

      child.on('close', (exitCode, signal) => {
        finish(() => {
          if (cancelled) reject(new AIError('REQUEST_CANCELLED', 'The AI request was cancelled.'))
          else if (timedOut) reject(new AIError('LOCAL_TOOL_TIMEOUT', 'The local AI tool timed out.'))
          else if (outputTooLarge) reject(new AIError('LOCAL_TOOL_OUTPUT_TOO_LARGE', 'The local AI tool produced too much output.'))
          else resolve({ stdout, stderr, exitCode, signal, durationMs: Date.now() - started })
        })
      })
    })
  }
}

export function createIsolatedCliWorkdir(root = tmpdir()): string {
  return join(root, 'knowex-ai-cli', randomUUID())
}

export async function cleanupCliWorkdir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

export function createSafeProcessEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'Path',
    'PATHEXT',
    'SYSTEMROOT',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMDATA',
    'COMSPEC'
  ]
  const env: NodeJS.ProcessEnv = {}
  for (const key of allowed) {
    const value = source[key]
    if (value) env[key] = value
  }
  return env
}

export async function assertExecutableFile(executablePath: string): Promise<void> {
  const info = await stat(executablePath).catch((error: unknown) => {
    throw new AIError('LOCAL_TOOL_INVALID_PATH', 'The local AI tool path does not exist.', { cause: error })
  })
  if (!info.isFile()) throw new AIError('LOCAL_TOOL_INVALID_PATH', 'The local AI tool path must be a file.')
  if (!isExpectedExecutableFile(executablePath)) throw new AIError('LOCAL_TOOL_INVALID_PATH', 'The local AI tool path must point to an executable file.')
  await access(executablePath, constants.F_OK).catch((error: unknown) => {
    throw new AIError('LOCAL_TOOL_INVALID_PATH', 'The local AI tool path is not accessible.', { cause: error })
  })
}

export function isSafeExecutablePath(value: string): boolean {
  if (!value || /[\n\r]/.test(value)) return false
  if (/[;&|`<>]/.test(value)) return false
  if (/\s--?[\w-]+/.test(value)) return false
  return basename(value).trim().length > 0
}

/**
 * Validates that a candidate CLI path is a direct executable rather than a Windows shell shim.
 * On Windows only `.exe` is accepted; on POSIX hosts `.cmd`/`.bat`/`.ps1` remain rejected while native binaries pass.
 */
export function isExpectedExecutableFile(value: string): boolean {
  if (/\.(cmd|bat|ps1)$/i.test(value)) return false
  if (process.platform === 'win32') return /\.exe$/i.test(value)
  return true
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function windowedKill(child: ChildProcessWithoutNullStreams): void {
  setTimeout(() => {
    if (!child.killed && child.exitCode === null) child.kill('SIGKILL')
  }, 1_500).unref()
}
