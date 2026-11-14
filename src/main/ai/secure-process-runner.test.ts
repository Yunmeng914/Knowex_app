import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSafeProcessEnv, isExpectedExecutableFile, SecureProcessRunner, stripAnsi } from './secure-process-runner'

const tempDirs: string[] = []

async function makeScript(source: string, folderName = 'knowex runner '): Promise<{ dir: string; script: string }> {
  const dir = await mkdtemp(join(tmpdir(), folderName))
  tempDirs.push(dir)
  const script = join(dir, 'script.js')
  await writeFile(script, source, 'utf8')
  return { dir, script }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('SecureProcessRunner', () => {
  it('passes argument arrays with shell disabled and supports unicode stdin/stdout/stderr', async () => {
    const { dir, script } = await makeScript(`
      process.stderr.write('warn');
      process.stdin.on('data', value => process.stdout.write(process.argv.slice(2).join('|') + ':' + value.toString()));
    `)
    const result = await new SecureProcessRunner().run({
      executablePath: process.execPath,
      args: [script, 'hello && ignored', '参数'],
      cwd: dir,
      stdin: '中文 Prompt',
      timeoutMs: 5_000
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello && ignored|参数:中文 Prompt')
    expect(result.stderr).toContain('warn')
  })

  it('reports non-zero exit code without executing through a shell', async () => {
    const { dir, script } = await makeScript('process.exit(7)')
    const result = await new SecureProcessRunner().run({ executablePath: process.execPath, args: [script], cwd: dir })

    expect(result.exitCode).toBe(7)
  })

  it('handles launch failure, timeout, cancellation, and output limit', async () => {
    const runner = new SecureProcessRunner()
    const { dir, script } = await makeScript('setTimeout(() => {}, 10000)')
    await expect(runner.run({ executablePath: join(dir, 'missing.exe'), args: [], cwd: dir })).rejects.toMatchObject({ code: 'LOCAL_TOOL_INVALID_PATH' })
    await expect(runner.run({ executablePath: process.execPath, args: [script], cwd: dir, timeoutMs: 20 })).rejects.toMatchObject({ code: 'LOCAL_TOOL_TIMEOUT' })

    const controller = new AbortController()
    const promise = runner.run({ executablePath: process.execPath, args: [script], cwd: dir, signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })

    const noisy = await makeScript('process.stdout.write("x".repeat(20000))')
    await expect(runner.run({ executablePath: process.execPath, args: [noisy.script], cwd: noisy.dir, maxOutputBytes: 100 })).rejects.toMatchObject({ code: 'LOCAL_TOOL_OUTPUT_TOO_LARGE' })
  })

  it('filters environment variables and strips ANSI output', () => {
    const env = createSafeProcessEnv({ PATH: 'x', OPENAI_API_KEY: 'secret', CODEX_TOKEN: 'token', USERPROFILE: 'home' })

    expect(env.PATH).toBe('x')
    expect(env.USERPROFILE).toBe('home')
    expect(JSON.stringify(env)).not.toContain('secret')
    expect(JSON.stringify(env)).not.toContain('token')
    expect(stripAnsi('\u001b[31mred\u001b[0m')).toBe('red')
  })

  it('allows only direct Windows executable files for local CLI launch', () => {
    expect(isExpectedExecutableFile('C:\\Tools\\codex.exe')).toBe(true)
    expect(isExpectedExecutableFile('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd')).toBe(false)
    expect(isExpectedExecutableFile('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.ps1')).toBe(false)
  })
})
