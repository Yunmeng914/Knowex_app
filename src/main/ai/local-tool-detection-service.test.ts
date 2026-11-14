import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalToolDetectionService } from './local-tool-detection-service'
import type { SecureProcessRunnerLike } from './secure-process-runner'

const tempDirs: string[] = []

async function touchExecutable(name: string): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'knowex detect '))
  tempDirs.push(dir)
  const file = join(dir, name)
  await writeFile(file, '', 'utf8')
  return { dir, file }
}

async function createNpmClaudeInstall(root: string): Promise<{ shim: string; exe: string }> {
  const npmRoot = join(root, 'npm')
  const packageRoot = join(npmRoot, 'node_modules', '@anthropic-ai', 'claude-code')
  const binRoot = join(packageRoot, 'bin')
  await mkdir(binRoot, { recursive: true })
  const shim = join(npmRoot, 'claude.cmd')
  const exe = join(binRoot, 'claude.exe')
  await writeFile(shim, '@echo off', 'utf8')
  await writeFile(exe, '', 'utf8')
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', bin: { claude: 'bin/claude.exe' } }), 'utf8')
  return { shim, exe }
}

function claudeRunner() {
  return vi.fn(async ({ args }: { executablePath: string; args: string[] }) => {
    if (args[0] === '--version') return { stdout: '2.1.163 (Claude Code)', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    if (args[0] === '--help') return { stdout: 'Claude Code\n-p, --print\n--output-format <format> json\n--no-session-persistence\n--tools <tools...>\n--strict-mcp-config', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    if (args.join(' ') === 'auth status') return { stdout: '{"loggedIn":true}', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  vi.unstubAllEnvs()
})

describe('LocalToolDetectionService', () => {
  it('detects Codex and Claude with explicit paths', async () => {
    const codex = await touchExecutable('codex.exe')
    const claude = await touchExecutable('claude.exe')
    const runner = { run: vi.fn(async ({ executablePath, args }: { executablePath: string; args: string[] }) => ({
      stdout: executablePath.includes('codex')
        ? (args.join(' ') === 'exec --help' ? 'Usage: codex exec [OPTIONS]' : 'codex 1.0.0')
        : args[0] === '--version' ? '2.1.163 (Claude Code)' : args[0] === '--help' ? 'Claude Code - use -p/--print\n--output-format json' : '{"loggedIn":true}',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 1
    })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    const results = await service.detectAll({ codex: codex.file, 'claude-code': claude.file })

    expect(results.map((item) => item.status)).toEqual(['available', 'native-cli-available'])
    expect(JSON.stringify(results)).not.toMatch(/token|api[_-]?key|secret/i)
  })

  it('reports not installed without scanning the disk', async () => {
    vi.stubEnv('PATH', '')
    const runner = { run: vi.fn(async () => { throw new Error('where failed') }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex')).resolves.toMatchObject({ installed: false, status: 'not-installed' })
  })

  it('rejects invalid manual paths and maps version command failures', async () => {
    const tool = await touchExecutable('claude.exe')
    const runner = { run: vi.fn(async () => ({ stdout: '', stderr: 'not logged in', exitCode: 1, signal: null, durationMs: 1 })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code', `${tool.file} --bad`)).resolves.toMatchObject({ status: 'invalid-path' })
    await expect(service.detect('claude-code', tool.file)).resolves.toMatchObject({ installed: true, status: 'not-authenticated' })
  })

  it('does not treat the WindowsApps Codex desktop app as Codex CLI', async () => {
    const runner = { run: vi.fn(async () => { throw new Error('Access is denied') }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    const result = await service.detect('codex', 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe')

    expect(result).toMatchObject({
      installed: false,
      status: 'desktop-app-detected-cli-not-available'
    })
    expect(result.message).toContain('desktop app')
  })

  it('does not mark Codex available when --version fails', async () => {
    const codex = await touchExecutable('codex.exe')
    const runner = { run: vi.fn(async () => ({ stdout: '', stderr: 'Access is denied', exitCode: 1, signal: null, durationMs: 1 })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex', codex.file)).resolves.toMatchObject({ installed: true, status: 'launch-failed' })
  })

  it('does not mark Codex available when --version succeeds but exec help fails', async () => {
    const codex = await touchExecutable('codex.exe')
    const runner = { run: vi.fn(async ({ args }: { args: string[] }) => ({
      stdout: args[0] === '--version' ? 'codex 1.0.0' : '',
      stderr: args[0] === '--version' ? '' : 'unknown command exec',
      exitCode: args[0] === '--version' ? 0 : 1,
      signal: null,
      durationMs: 1
    })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex', codex.file)).resolves.toMatchObject({ installed: true, status: 'version-unsupported' })
  })

  it('marks Codex available only when version and exec help both validate', async () => {
    const codex = await touchExecutable('codex.exe')
    const runner = { run: vi.fn(async ({ args }: { args: string[] }) => ({
      stdout: args[0] === '--version' ? 'codex 1.0.0' : 'Usage: codex exec [OPTIONS]',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 1
    })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    const result = await service.detect('codex', codex.file)

    expect(result).toMatchObject({ installed: true, status: 'available', version: 'codex 1.0.0' })
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ args: ['--version'] }))
    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ args: ['exec', '--help'] }))
  })

  it('marks Claude Code available only after version, help, and auth checks validate', async () => {
    const claude = await touchExecutable('claude.exe')
    const run = claudeRunner()
    const runner = { run } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code', claude.file)).resolves.toMatchObject({ installed: true, status: 'native-cli-available' })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: ['--version'] }))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: ['--help'] }))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: ['auth', 'status'] }))
  })

  it('does not execute unknown Claude Code npm shim paths', async () => {
    const shim = await touchExecutable('claude.cmd')
    const runner = { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0, signal: null, durationMs: 1 })) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code', shim.file)).resolves.toMatchObject({ installed: false, status: 'npm-shim-detected' })
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('resolves a Claude Code npm shim to the official native binary', async () => {
    const appData = await mkdtemp(join(tmpdir(), 'knowex-claude-appdata-'))
    tempDirs.push(appData)
    const install = await createNpmClaudeInstall(appData)
    vi.stubEnv('APPDATA', appData)
    vi.stubEnv('PATH', join(appData, 'npm'))
    const run = claudeRunner()
    const runner = { run: vi.fn(async (input: { executablePath: string; args: string[] }) => {
      if (input.args.length === 1 && input.args[0] === 'claude') return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
      return run(input)
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code')).resolves.toMatchObject({ installed: true, status: 'npm-native-binary-available', executablePath: install.exe })
    expect(runner.run).not.toHaveBeenCalledWith(expect.objectContaining({ executablePath: install.shim }))
  })

  it('keeps searching Claude Code candidates after the first executable fails', async () => {
    const claudeBin = process.platform === 'win32' ? 'claude.exe' : 'claude'
    const bad = await touchExecutable(claudeBin)
    const good = await touchExecutable(claudeBin)
    vi.stubEnv('PATH', `${bad.dir}${delimiter}${good.dir}`)
    const runner = { run: vi.fn(async ({ executablePath, args }: { executablePath: string; args: string[] }) => {
      if (args.length === 1 && args[0] === 'claude') return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
      if (executablePath === bad.file) return { stdout: '', stderr: 'broken', exitCode: 1, signal: null, durationMs: 1 }
      if (args[0] === '--version') return { stdout: '2.1.163 (Claude Code)', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      if (args[0] === '--help') return { stdout: 'Claude Code -p --output-format json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      return { stdout: '{"loggedIn":true}', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code')).resolves.toMatchObject({ status: 'native-cli-available', executablePath: good.file })
  })

  it('distinguishes Claude Code authentication failures from not installed', async () => {
    const claude = await touchExecutable('claude.exe')
    const runner = { run: vi.fn(async ({ args }: { args: string[] }) => {
      if (args[0] === '--version') return { stdout: '2.1.163 (Claude Code)', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      if (args[0] === '--help') return { stdout: 'Claude Code -p --output-format json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      return { stdout: '{"loggedIn":false}', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('claude-code', claude.file)).resolves.toMatchObject({ installed: true, status: 'not-authenticated' })
  })

  it('continues after a WindowsApps Codex desktop app candidate and selects the independent CLI', async () => {
    const local = await mkdtemp(join(tmpdir(), 'knowex-localappdata-'))
    tempDirs.push(local)
    const cliDir = join(local, 'OpenAI', 'Codex', 'bin', 'hash-one')
    await mkdir(cliDir, { recursive: true })
    const cli = join(cliDir, 'codex.exe')
    await writeFile(cli, '', 'utf8')
    vi.stubEnv('LOCALAPPDATA', local)
    vi.stubEnv('PATH', '')
    const desktop = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe'
    const runner = { run: vi.fn(async ({ executablePath, args }: { executablePath: string; args: string[] }) => {
      if (args.length === 1 && args[0] === 'codex') return { stdout: `${desktop}\r\n`, stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      if (executablePath === desktop) throw new Error('Access is denied')
      return { stdout: args[0] === '--version' ? 'codex-cli 0.146.0' : 'Usage: codex exec [OPTIONS]', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    const result = await service.detect('codex')

    expect(result).toMatchObject({ status: 'available', executablePath: cli })
  })

  it('finds independent Codex CLI across changing hash directories', async () => {
    const local = await mkdtemp(join(tmpdir(), 'knowex-localappdata-'))
    tempDirs.push(local)
    const cliDir = join(local, 'OpenAI', 'Codex', 'bin', 'different-hash-value')
    await mkdir(cliDir, { recursive: true })
    const cli = join(cliDir, 'codex.exe')
    await writeFile(cli, '', 'utf8')
    vi.stubEnv('LOCALAPPDATA', local)
    vi.stubEnv('PATH', '')
    const runner = { run: vi.fn(async ({ args }: { args: string[] }) => {
      if (args.length === 1 && args[0] === 'codex') return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
      return { stdout: args[0] === '--version' ? 'codex-cli 0.146.0' : 'Usage: codex exec [OPTIONS]', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex')).resolves.toMatchObject({ status: 'available', executablePath: cli })
  })

  it('chooses the first candidate that fully validates among multiple candidates', async () => {
    const codexBin = process.platform === 'win32' ? 'codex.exe' : 'codex'
    const bad = await touchExecutable(codexBin)
    const good = await touchExecutable(codexBin)
    vi.stubEnv('PATH', `${bad.dir}${delimiter}${good.dir}`)
    const runner = { run: vi.fn(async ({ executablePath, args }: { executablePath: string; args: string[] }) => {
      if (args.length === 1 && args[0] === 'codex') return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
      if (executablePath === bad.file) return { stdout: args[0] === '--version' ? 'codex-cli 0.1.0' : '', stderr: args[0] === '--version' ? '' : 'unknown command', exitCode: args[0] === '--version' ? 0 : 1, signal: null, durationMs: 1 }
      return { stdout: args[0] === '--version' ? 'codex-cli 0.146.0' : 'Usage: codex exec [OPTIONS]', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex')).resolves.toMatchObject({ status: 'available', executablePath: good.file })
  })

  it('reports not installed only after all non-desktop candidates fail', async () => {
    const bad = await touchExecutable(process.platform === 'win32' ? 'codex.exe' : 'codex')
    vi.stubEnv('PATH', bad.dir)
    const runner = { run: vi.fn(async ({ args }: { args: string[] }) => {
      if (args.length === 1 && args[0] === 'codex') return { stdout: '', stderr: '', exitCode: 1, signal: null, durationMs: 1 }
      return { stdout: '', stderr: 'broken', exitCode: 1, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const service = new LocalToolDetectionService(runner)

    await expect(service.detect('codex')).resolves.toMatchObject({ installed: false, status: 'not-installed' })
  })
})
