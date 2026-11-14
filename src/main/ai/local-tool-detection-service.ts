import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, delimiter, dirname, join } from 'node:path'
import type { LocalToolDetectionPublic, LocalToolKind, LocalToolStatus, LocalToolTestPublic } from '../../shared/domain/models'
import { AIError } from './ai-errors'
import { createIsolatedCliWorkdir, cleanupCliWorkdir, isExpectedExecutableFile, isSafeExecutablePath, type SecureProcessRunnerLike } from './secure-process-runner'

const TOOL_COMMANDS: Record<LocalToolKind, string> = {
  codex: 'codex',
  'claude-code': 'claude'
}

const TOOL_LABELS: Record<LocalToolKind, string> = {
  codex: 'Codex CLI',
  'claude-code': 'Claude Code CLI'
}

export class LocalToolDetectionService {
  constructor(private readonly runner: SecureProcessRunnerLike) {}

  async detectAll(executablePaths?: Partial<Record<LocalToolKind, string>>): Promise<LocalToolDetectionPublic[]> {
    return Promise.all([
      this.detect('codex', executablePaths?.codex),
      this.detect('claude-code', executablePaths?.['claude-code'])
    ])
  }

  async detect(tool: LocalToolKind, explicitPath?: string): Promise<LocalToolDetectionPublic> {
    const checkedAt = new Date().toISOString()
    if (explicitPath?.trim()) {
      if (tool === 'claude-code') return this.detectClaudeCandidates(checkedAt, [explicitPath.trim()])
      return this.detectCandidate(tool, explicitPath.trim(), checkedAt)
    }
    if (tool === 'codex') return this.detectCodexCandidates(checkedAt)
    if (tool === 'claude-code') return this.detectClaudeCandidates(checkedAt)
    const executablePath = await this.findExecutable(tool)
    if (!executablePath) {
      return { tool, installed: false, status: 'not-installed', message: `${TOOL_LABELS[tool]} was not found on PATH.`, checkedAt }
    }
    return this.detectCandidate(tool, executablePath, checkedAt)
  }

  private async detectCodexCandidates(checkedAt: string): Promise<LocalToolDetectionPublic> {
    const candidates = await this.findCodexCandidates()
    if (!candidates.length) {
      return { tool: 'codex', installed: false, status: 'not-installed', message: 'Codex CLI was not found on PATH or in the standard user install directory.', checkedAt }
    }
    let desktopApp: LocalToolDetectionPublic | undefined
    for (const candidate of candidates) {
      const result = await this.detectCandidate('codex', candidate, checkedAt)
      if (result.status === 'available') return result
      if (result.status === 'desktop-app-detected-cli-not-available') desktopApp = result
    }
    return desktopApp ?? { tool: 'codex', installed: false, status: 'not-installed', message: 'Codex CLI was not found. Install the standalone Codex CLI, then run detection again.', checkedAt }
  }

  private async detectClaudeCandidates(checkedAt: string, explicitCandidates: string[] = []): Promise<LocalToolDetectionPublic> {
    const candidates = explicitCandidates.length ? explicitCandidates : await this.findClaudeCandidates()
    if (!candidates.length) return claudeNotInstalled(checkedAt)

    let fallback: LocalToolDetectionPublic | undefined
    for (const candidate of candidates) {
      const resolved = await this.resolveClaudeCandidate(candidate, checkedAt)
      if (resolved.status === 'npm-shim-detected' || resolved.status === 'invalid-path') {
        fallback ??= resolved
        continue
      }
      const result = await this.detectCandidate('claude-code', resolved.executablePath ?? candidate, checkedAt)
      if (isAvailableLocalToolStatus(result.status)) return result
      fallback ??= result.status === 'not-authenticated' || result.status === 'version-unsupported' || result.status === 'executable-found-validation-failed' ? result : fallback
    }
    return fallback ?? claudeNotInstalled(checkedAt)
  }

  private async detectCandidate(tool: LocalToolKind, executablePath: string, checkedAt: string): Promise<LocalToolDetectionPublic> {
    const pathStatus = await validateExecutablePath(executablePath)
    if (pathStatus) {
      if (tool === 'codex' && isCodexDesktopAppPath(executablePath)) return codexDesktopAppDetected(executablePath, checkedAt)
      return { tool, installed: false, executablePath, status: pathStatus, message: `${TOOL_LABELS[tool]} path is not valid.`, checkedAt }
    }
    const workdir = createIsolatedCliWorkdir()
    try {
      const result = await this.runner.run({
        executablePath,
        args: ['--version'],
        cwd: workdir,
        timeoutMs: 10_000,
        maxOutputBytes: 64_000
      })
      const output = `${result.stdout}\n${result.stderr}`.trim()
      if (result.exitCode !== 0) {
        if (tool === 'codex' && isCodexDesktopAppPath(executablePath)) return codexDesktopAppDetected(executablePath, checkedAt)
        return { tool, installed: true, executablePath, status: statusFromOutput(output, 'launch-failed'), message: summarizeToolOutput(output, `${TOOL_LABELS[tool]} version check failed.`), checkedAt }
      }
      if (tool === 'codex') {
        const codexCli = await this.verifyCodexCli(executablePath, workdir)
        if (!codexCli.ok) {
          if (isCodexDesktopAppPath(executablePath)) return codexDesktopAppDetected(executablePath, checkedAt)
          return { tool, installed: true, executablePath, version: firstLine(output), status: codexCli.status, message: codexCli.message, checkedAt }
        }
      }
      if (tool === 'claude-code') {
        const claudeCli = await this.verifyClaudeCodeCli(executablePath, output, workdir)
        if (!claudeCli.ok) {
          return { tool, installed: true, executablePath, version: firstLine(output), status: claudeCli.status, message: claudeCli.message, checkedAt }
        }
        return {
          tool,
          installed: true,
          executablePath,
          version: firstLine(output),
          status: claudeCli.status,
          message: claudeCli.message,
          checkedAt
        }
      }
      return {
        tool,
        installed: true,
        executablePath,
        version: firstLine(output),
        status: 'available',
        message: `${TOOL_LABELS[tool]} is available.`,
        checkedAt
      }
    } catch (error) {
      if (tool === 'codex' && isCodexDesktopAppPath(executablePath)) return codexDesktopAppDetected(executablePath, checkedAt)
      return {
        tool,
        installed: true,
        executablePath,
        status: error instanceof AIError ? mapAIErrorToStatus(error.code) : 'launch-failed',
        message: error instanceof Error ? error.message : `${TOOL_LABELS[tool]} could not be launched.`,
        checkedAt
      }
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }

  async test(input: { tool: LocalToolKind; executablePath: string; model?: string }, runText: (path: string, prompt: string, model?: string) => Promise<string>): Promise<LocalToolTestPublic> {
    const started = Date.now()
    const detected = await this.detect(input.tool, input.executablePath)
    if (!isAvailableLocalToolStatus(detected.status)) {
      return {
        success: false,
        tool: input.tool,
        executablePath: input.executablePath,
        version: detected.version,
        message: detected.message,
        errorCode: statusToErrorCode(detected.status),
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }
    }
    try {
      const text = await runText(input.executablePath, 'Please only answer: Knowex CLI connection test passed.', input.model)
      return {
        success: true,
        tool: input.tool,
        executablePath: input.executablePath,
        version: detected.version,
        message: text || 'Local tool test succeeded.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        success: false,
        tool: input.tool,
        executablePath: input.executablePath,
        version: detected.version,
        message: error instanceof Error ? error.message : 'Local tool test failed.',
        errorCode: error instanceof AIError ? error.code : 'UNKNOWN_PROVIDER_ERROR',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }
    }
  }

  private async findExecutable(tool: LocalToolKind): Promise<string | undefined> {
    const candidates = await this.findCommandCandidates(TOOL_COMMANDS[tool])
    return candidates[0]
  }

  private async findCodexCandidates(): Promise<string[]> {
    return uniquePaths([
      ...await this.findCommandCandidates('codex'),
      ...await this.findKnownIndependentCodexCandidates()
    ])
  }

  private async findClaudeCandidates(): Promise<string[]> {
    return uniquePaths([
      ...await this.findCommandCandidates('claude'),
      ...await this.findPowerShellCommandCandidates('claude'),
      ...await this.findKnownClaudeCandidates()
    ])
  }

  private async findCommandCandidates(command: string): Promise<string[]> {
    return uniquePaths([
      ...await this.findWithWhere(command),
      ...await this.findInPath(command)
    ])
  }

  private async findWithWhere(command: string): Promise<string[]> {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    const wherePath = systemRoot ? join(systemRoot, 'System32', 'where.exe') : undefined
    if (!wherePath) return []
    const workdir = createIsolatedCliWorkdir()
    try {
      const result = await this.runner.run({
        executablePath: wherePath,
        args: [command],
        cwd: workdir,
        timeoutMs: 5_000,
        maxOutputBytes: 64_000
      })
      return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    } catch {
      return []
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }

  private async findPowerShellCommandCandidates(command: string): Promise<string[]> {
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    const powershellPath = systemRoot ? join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : undefined
    if (!powershellPath) return []
    const workdir = createIsolatedCliWorkdir()
    try {
      const result = await this.runner.run({
        executablePath: powershellPath,
        args: ['-NoProfile', '-Command', `Get-Command ${command} -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source }`],
        cwd: workdir,
        timeoutMs: 5_000,
        maxOutputBytes: 64_000
      })
      if (result.exitCode !== 0) return []
      return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    } catch {
      return []
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }

  private async findInPath(command: string): Promise<string[]> {
    const pathValue = process.env.PATH ?? process.env.Path ?? ''
    const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.ps1', ''] : ['', '.sh']
    const candidates: string[] = []
    for (const directory of pathValue.split(delimiter).filter(Boolean)) {
      for (const suffix of suffixes) {
        const candidate = join(directory, `${command}${suffix}`)
        try {
          await access(candidate)
          candidates.push(candidate)
        } catch {
          // Continue through PATH candidates only; no broad disk scan.
        }
      }
    }
    return candidates
  }

  private async findKnownIndependentCodexCandidates(): Promise<string[]> {
    const localAppData = process.env.LOCALAPPDATA
    if (!localAppData) return []
    const root = join(localAppData, 'OpenAI', 'Codex', 'bin')
    try {
      const entries = await readdir(root, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'codex.exe'))
    } catch {
      return []
    }
  }

  private async resolveClaudeCandidate(candidate: string, checkedAt: string): Promise<LocalToolDetectionPublic> {
    if (!isSafeExecutablePath(candidate)) {
      return { tool: 'claude-code', installed: false, executablePath: candidate, status: 'invalid-path', message: 'Claude Code path is not valid.', checkedAt }
    }
    if (isExpectedExecutableFile(candidate)) {
      return { tool: 'claude-code', installed: true, executablePath: candidate, status: 'unknown', message: 'Claude Code executable candidate found.', checkedAt }
    }
    if (!isClaudeWindowsShimPath(candidate)) {
      return { tool: 'claude-code', installed: false, executablePath: candidate, status: 'invalid-path', message: 'Claude Code candidate is not a directly executable .exe file.', checkedAt }
    }
    const resolved = await resolveClaudeNpmShim(candidate)
    if (resolved) {
      return { tool: 'claude-code', installed: true, executablePath: resolved, status: 'unknown', message: 'Claude Code npm shim resolved to its native executable.', checkedAt }
    }
    return {
      tool: 'claude-code',
      installed: false,
      executablePath: candidate,
      status: 'npm-shim-detected',
      message: 'Claude Code Windows launcher script was detected, but Knowex could not safely locate the native executable. Knowex will not run .cmd or .ps1 through a shell.',
      checkedAt
    }
  }

  private async findKnownClaudeCandidates(): Promise<string[]> {
    const candidates: string[] = []
    const appData = process.env.APPDATA
    const localAppData = process.env.LOCALAPPDATA
    const userProfile = process.env.USERPROFILE
    if (appData) {
      candidates.push(join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
      candidates.push(join(appData, 'npm', 'claude.cmd'))
      candidates.push(join(appData, 'npm', 'claude.ps1'))
    }
    if (localAppData) {
      candidates.push(join(localAppData, 'Programs', 'Anthropic', 'Claude Code', 'claude.exe'))
      candidates.push(join(localAppData, 'Anthropic', 'Claude Code', 'claude.exe'))
      candidates.push(...await this.findWinGetClaudeCandidates(localAppData))
    }
    if (userProfile) {
      candidates.push(join(userProfile, 'AppData', 'Local', 'Programs', 'Anthropic', 'Claude Code', 'claude.exe'))
    }
    return candidates
  }

  private async findWinGetClaudeCandidates(localAppData: string): Promise<string[]> {
    const root = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    try {
      const entries = await readdir(root, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory() && /^Anthropic\.ClaudeCode/i.test(entry.name))
        .flatMap((entry) => [
          join(root, entry.name, 'claude.exe'),
          join(root, entry.name, 'bin', 'claude.exe')
        ])
    } catch {
      return []
    }
  }

  private async verifyCodexCli(executablePath: string, cwd: string): Promise<{ ok: true } | { ok: false; status: LocalToolStatus; message: string }> {
    const result = await this.runner.run({
      executablePath,
      args: ['exec', '--help'],
      cwd,
      timeoutMs: 10_000,
      maxOutputBytes: 200_000
    })
    const output = `${result.stdout}\n${result.stderr}`.trim()
    if (result.exitCode !== 0) {
      return { ok: false, status: statusFromOutput(output, 'version-unsupported'), message: summarizeToolOutput(output, 'Codex CLI exec help could not be read.') }
    }
    if (!isCodexCliExecHelp(output)) {
      return { ok: false, status: 'version-unsupported', message: 'The detected program does not expose the expected Codex CLI exec command.' }
    }
    return { ok: true }
  }

  private async verifyClaudeCodeCli(executablePath: string, versionOutput: string, cwd: string): Promise<{ ok: true; status: LocalToolStatus; message: string } | { ok: false; status: LocalToolStatus; message: string }> {
    if (!/claude\s*code/i.test(versionOutput)) {
      return { ok: false, status: 'version-unsupported', message: 'The detected executable did not report a Claude Code version.' }
    }
    const helpResult = await this.runner.run({
      executablePath,
      args: ['--help'],
      cwd,
      timeoutMs: 10_000,
      maxOutputBytes: 300_000
    })
    const help = `${helpResult.stdout}\n${helpResult.stderr}`.trim()
    if (helpResult.exitCode !== 0) {
      return { ok: false, status: statusFromOutput(help, 'version-unsupported'), message: summarizeToolOutput(help, 'Claude Code help could not be read.') }
    }
    if (!isClaudeCodeHelpSupported(help)) {
      return { ok: false, status: 'version-unsupported', message: 'This Claude Code version does not expose the non-interactive JSON output mode required by Knowex.' }
    }

    const authResult = await this.runner.run({
      executablePath,
      args: ['auth', 'status'],
      cwd,
      timeoutMs: 10_000,
      maxOutputBytes: 64_000
    })
    const authOutput = `${authResult.stdout}\n${authResult.stderr}`.trim()
    if (authResult.exitCode !== 0 || isClaudeAuthMissing(authOutput)) {
      return { ok: false, status: 'not-authenticated', message: 'Claude Code CLI is installed, but sign-in is not complete. Sign in from a terminal; Knowex does not read or save CLI tokens.' }
    }

    return {
      ok: true,
      status: classifyClaudeAvailableStatus(executablePath),
      message: 'Claude Code CLI is available. Sign-in is managed by Claude Code.'
    }
  }
}

export async function validateExecutablePath(executablePath: string): Promise<LocalToolStatus | undefined> {
  if (!isSafeExecutablePath(executablePath)) return 'invalid-path'
  if (!isExpectedExecutableFile(executablePath)) return 'invalid-path'
  try {
    const info = await stat(executablePath)
    if (!info.isFile()) return 'invalid-path'
    return undefined
  } catch {
    return 'invalid-path'
  }
}

export function statusFromOutput(output: string, fallback: LocalToolStatus): LocalToolStatus {
  const lower = output.toLowerCase()
  if (lower.includes('auth') || lower.includes('login') || lower.includes('not logged in')) return 'not-authenticated'
  if (lower.includes('unsupported') || lower.includes('version')) return 'version-unsupported'
  if (lower.includes('network') || lower.includes('econn') || lower.includes('enotfound')) return 'unavailable'
  return fallback
}

function mapAIErrorToStatus(code: string): LocalToolStatus {
  if (code === 'REQUEST_TIMEOUT' || code === 'LOCAL_TOOL_TIMEOUT') return 'unavailable'
  if (code === 'LOCAL_TOOL_INVALID_PATH' || code === 'UNSAFE_EXECUTABLE_PATH') return 'invalid-path'
  if (code === 'LOCAL_TOOL_NOT_AUTHENTICATED') return 'not-authenticated'
  return 'launch-failed'
}

function statusToErrorCode(status: LocalToolStatus): string {
  if (isAvailableLocalToolStatus(status)) return 'UNKNOWN_PROVIDER_ERROR'
  if (status === 'not-installed') return 'LOCAL_TOOL_NOT_INSTALLED'
  if (status === 'npm-shim-detected') return 'LOCAL_TOOL_SHIM_DETECTED'
  if (status === 'executable-found-validation-failed') return 'LOCAL_TOOL_NATIVE_BINARY_NOT_FOUND'
  if (status === 'desktop-app-detected-cli-not-available') return 'LOCAL_TOOL_DESKTOP_APP_DETECTED'
  if (status === 'invalid-path') return 'LOCAL_TOOL_INVALID_PATH'
  if (status === 'not-authenticated') return 'LOCAL_TOOL_NOT_AUTHENTICATED'
  if (status === 'version-unsupported') return 'LOCAL_TOOL_VERSION_UNSUPPORTED'
  return 'LOCAL_TOOL_LAUNCH_FAILED'
}

export function isCodexDesktopAppPath(executablePath: string): boolean {
  return /\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\resources\\codex(?:\.exe)?$/i.test(executablePath)
}

export function isCodexCliExecHelp(output: string): boolean {
  const lower = output.toLowerCase()
  return /\bexec\b/.test(lower) && (/\busage\b/.test(lower) || /\bcommands?\b/.test(lower) || /codex/.test(lower))
}

export function isAvailableLocalToolStatus(status: LocalToolStatus): boolean {
  return status === 'available' || status === 'native-cli-available' || status === 'winget-cli-available' || status === 'npm-native-binary-available'
}

export function isClaudeCodeHelpSupported(output: string): boolean {
  const lower = output.toLowerCase()
  const hasPrint = /(^|\s)-p\b/.test(output) || lower.includes('--print')
  const hasJsonOutput = lower.includes('--output-format') && lower.includes('json')
  return lower.includes('claude code') && hasPrint && hasJsonOutput
}

function isClaudeAuthMissing(output: string): boolean {
  const lower = output.toLowerCase()
  if (lower.includes('"loggedin": false') || lower.includes('"loggedin":false')) return true
  if (lower.includes('not logged in') || lower.includes('not authenticated') || lower.includes('login required')) return true
  return false
}

function isClaudeWindowsShimPath(executablePath: string): boolean {
  const name = basename(executablePath).toLowerCase()
  return name === 'claude.cmd' || name === 'claude.ps1' || (name === 'claude' && process.platform === 'win32')
}

async function resolveClaudeNpmShim(shimPath: string): Promise<string | undefined> {
  if (!isLikelyNpmGlobalShim(shimPath)) return undefined
  const npmRoot = dirname(shimPath)
  const packageRoot = join(npmRoot, 'node_modules', '@anthropic-ai', 'claude-code')
  const packageJsonPath = join(packageRoot, 'package.json')
  try {
    const info = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { name?: string; bin?: { claude?: string } }
    if (info.name !== '@anthropic-ai/claude-code') return undefined
    const binPath = info.bin?.claude
    const candidates = [
      binPath ? join(packageRoot, binPath) : '',
      join(packageRoot, 'bin', 'claude.exe'),
      join(packageRoot, 'node_modules', '@anthropic-ai', process.arch === 'arm64' ? 'claude-code-win32-arm64' : 'claude-code-win32-x64', 'claude.exe'),
      join(packageRoot, 'node_modules', '@anthropic-ai', process.arch === 'arm64' ? 'claude-code-win32-arm64' : 'claude-code-win32-x64', 'bin', 'claude.exe')
    ].filter(Boolean)
    for (const candidate of candidates) {
      if (!isExpectedExecutableFile(candidate)) continue
      const info = await stat(candidate).catch(() => undefined)
      if (info?.isFile()) return candidate
    }
    return undefined
  } catch {
    return undefined
  }
}

function isLikelyNpmGlobalShim(shimPath: string): boolean {
  const normalized = shimPath.toLowerCase()
  const appData = process.env.APPDATA?.toLowerCase()
  if (appData && normalized.startsWith(join(appData, 'npm').toLowerCase())) return true
  return false
}

function classifyClaudeAvailableStatus(executablePath: string): LocalToolStatus {
  const normalized = executablePath.toLowerCase()
  if (normalized.includes('\\npm\\node_modules\\@anthropic-ai\\claude-code\\') || normalized.includes('/npm/node_modules/@anthropic-ai/claude-code/')) return 'npm-native-binary-available'
  if (normalized.includes('\\microsoft\\winget\\packages\\anthropic.claudecode')) return 'winget-cli-available'
  return 'native-cli-available'
}

function claudeNotInstalled(checkedAt: string): LocalToolDetectionPublic {
  return {
    tool: 'claude-code',
    installed: false,
    status: 'not-installed',
    message: 'Claude Code CLI was not found. Install Claude Code, then run detection again.',
    checkedAt
  }
}

function codexDesktopAppDetected(executablePath: string, checkedAt: string): LocalToolDetectionPublic {
  return {
    tool: 'codex',
    installed: false,
    executablePath,
    status: 'desktop-app-detected-cli-not-available',
    message: 'Codex desktop app was detected, but Codex CLI is not available. The desktop app and CLI are separate clients; install Codex CLI separately.',
    checkedAt
  }
}

function firstLine(output: string): string | undefined {
  return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
}

function summarizeToolOutput(output: string, fallback: string): string {
  const line = firstLine(output)
  return line ? line.slice(0, 300) : fallback
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const path of paths) {
    const key = process.platform === 'win32' ? path.toLowerCase() : path
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(path)
  }
  return unique
}
