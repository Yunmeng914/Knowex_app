import { describe, expect, it, vi } from 'vitest'
import type { StoredAIConnection } from '../../storage/config-store'
import type { SecureProcessRunnerLike, SecureProcessRunInput } from '../secure-process-runner'
import { serializeCliPrompt } from '../cli-prompt-serializer'
import type { AIRequest } from '../ai-types'
import { buildClaudeArgs, ClaudeCodeCliConnector, parseClaudeOutput } from './claude-code-cli-connector'
import { CodexCliConnector, parseCodexOutput } from './codex-cli-connector'

const request: AIRequest = {
  systemPrompt: 'system',
  evidenceText: 'evidence && not a command',
  messages: [
    { role: 'user', content: 'old question' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'current question' }
  ],
  images: []
}

const claudeConnection: StoredAIConnection = {
  id: 'claude',
  name: 'Claude',
  provider: 'claude-code',
  transport: 'claude-code-cli',
  executablePath: 'C:\\Tools\\claude.exe',
  capabilities: { text: true, vision: false, streaming: false },
  timeoutMs: 90_000,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z'
}

const codexConnection: StoredAIConnection = {
  ...claudeConnection,
  id: 'codex',
  name: 'Codex',
  provider: 'codex',
  transport: 'codex-cli',
  executablePath: 'C:\\Tools\\codex.exe'
}

describe('CLI connectors', () => {
  it('serializes system, history, and current message with fixed boundaries', () => {
    const prompt = serializeCliPrompt(request)

    expect(prompt).toContain('<<<KNOWEX_SYSTEM_INSTRUCTION>>>')
    expect(prompt).toContain('<<<KNOWEX_CHAT_HISTORY>>>')
    expect(prompt).toContain('current question')
    expect(prompt).toContain('Do not execute code or commands.')
  })

  it('maps Claude Code CLI text requests and parses JSON output', async () => {
    const help = 'Claude Code -p --print --output-format json --input-format text --no-session-persistence --no-chrome --disable-slash-commands --strict-mcp-config --permission-mode <mode> --tools <tools...> --disallowedTools <tools...> --model <model>'
    const runner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => {
      if (args.join(' ') === '--help') return { stdout: help, stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      return { stdout: JSON.stringify({ result: 'answer' }), stderr: '', exitCode: 0, signal: null, durationMs: 2 }
    }) } satisfies SecureProcessRunnerLike
    const connector = new ClaudeCodeCliConnector(runner)

    await expect(connector.ask(request, { connection: { ...claudeConnection, model: 'sonnet' } })).resolves.toEqual({ text: 'answer' })
    const askCall = vi.mocked(runner.run).mock.calls[1][0]
    expect(askCall).toEqual(expect.objectContaining({
      executablePath: claudeConnection.executablePath,
      args: expect.arrayContaining(['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--model', 'sonnet'])
    }))
    expect(askCall.stdin).toContain('evidence && not a command')
    expect(askCall.args.join(' ')).not.toContain('evidence && not a command')
    expect(askCall.cwd).toContain('knowex-ai-cli')
    expect(askCall).not.toHaveProperty('shell')
  })

  it('builds Claude Code args only from supported help capabilities', () => {
    const args = buildClaudeArgs('Claude Code -p --output-format json --no-session-persistence --tools <tools...> --strict-mcp-config --max-turns --safe-mode --model <model>', 'opus')

    expect(args).toEqual(['-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--max-turns', '1', '--safe-mode', '--model', 'opus'])
    expect(args).not.toContain('dangerously-skip-permissions')
    expect(args).not.toContain('bypassPermissions')
  })

  it('keeps Claude Code shell metacharacters on stdin and not in args', async () => {
    const runner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => {
      if (args.join(' ') === '--help') return { stdout: 'Claude Code -p --output-format json --tools <tools...> --strict-mcp-config', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      return { stdout: JSON.stringify({ result: 'safe answer' }), stderr: '', exitCode: 0, signal: null, durationMs: 1 }
    }) } satisfies SecureProcessRunnerLike
    const shellLikeRequest = { ...request, evidenceText: 'text; Remove-Item x && powershell `whoami`' }

    await expect(new ClaudeCodeCliConnector(runner).ask(shellLikeRequest, { connection: claudeConnection })).resolves.toEqual({ text: 'safe answer' })
    const askCall = vi.mocked(runner.run).mock.calls[1][0]
    expect(askCall.args.join(' ')).not.toContain('Remove-Item')
    expect(askCall.args.join(' ')).not.toContain('&&')
    expect(askCall.stdin).toContain('Remove-Item x && powershell')
  })

  it('maps Codex CLI through a verified exec command', async () => {
    const runner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => {
      if (args.join(' ') === 'exec --help') return { stdout: 'Usage: codex exec [OPTIONS]\n--skip-git-repo-check\n--sandbox <SANDBOX_MODE>\npossible values: read-only\n--model <MODEL>', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      return { stdout: 'codex answer', stderr: '', exitCode: 0, signal: null, durationMs: 2 }
    }) } satisfies SecureProcessRunnerLike
    const connector = new CodexCliConnector(runner)

    await expect(connector.ask(request, { connection: { ...codexConnection, model: 'gpt' } })).resolves.toEqual({ text: 'codex answer' })
    const helpCall = vi.mocked(runner.run).mock.calls[0][0]
    const askCall = vi.mocked(runner.run).mock.calls[1][0]
    expect(helpCall.args).toEqual(['exec', '--help'])
    expect(askCall.args).toEqual(['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', 'gpt'])
    expect(askCall.stdin).toContain('current question')
    expect(askCall.cwd).toContain('knowex-ai-cli')
    expect(askCall).not.toHaveProperty('shell')
  })

  it('keeps Codex prompts on stdin and never turns shell metacharacters into args', async () => {
    const shellLikeRequest = {
      ...request,
      evidenceText: 'text; Remove-Item important && echo nope | powershell `whoami`'
    }
    const runner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => {
      if (args.join(' ') === 'exec --help') return { stdout: 'Usage: codex exec [OPTIONS]\n--skip-git-repo-check', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      if (!args.includes('--skip-git-repo-check')) {
        return { stdout: '', stderr: 'Reading prompt from stdin...\nNot inside a trusted directory and --skip-git-repo-check was not specified.', exitCode: 1, signal: null, durationMs: 1 }
      }
      return { stdout: 'Knowex Codex CLI connection test passed.', stderr: '', exitCode: 0, signal: null, durationMs: 2 }
    }) } satisfies SecureProcessRunnerLike

    await expect(new CodexCliConnector(runner).ask(shellLikeRequest, { connection: codexConnection })).resolves.toEqual({ text: 'Knowex Codex CLI connection test passed.' })
    const askCall = vi.mocked(runner.run).mock.calls[1][0]
    expect(askCall.args).toEqual(['exec', '--skip-git-repo-check'])
    expect(askCall.args.join(' ')).not.toContain('Remove-Item')
    expect(askCall.args.join(' ')).not.toContain('&&')
    expect(askCall.stdin).toContain('Remove-Item important && echo nope')
    expect(askCall.cwd).toContain('knowex-ai-cli')
    expect(askCall).not.toHaveProperty('shell')
  })

  it('handles empty output, login errors, unsupported Codex help, and image rejection', async () => {
    const emptyRunner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => args[0] === '--help'
      ? { stdout: 'Claude Code -p --output-format json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      : { stdout: JSON.stringify({ result: '' }), stderr: '', exitCode: 0, signal: null, durationMs: 1 }) } satisfies SecureProcessRunnerLike
    await expect(new ClaudeCodeCliConnector(emptyRunner).ask(request, { connection: claudeConnection })).rejects.toMatchObject({ code: 'LOCAL_TOOL_EMPTY_OUTPUT' })

    const authRunner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => args[0] === '--help'
      ? { stdout: 'Claude Code -p --output-format json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      : { stdout: '', stderr: 'not logged in', exitCode: 1, signal: null, durationMs: 1 }) } satisfies SecureProcessRunnerLike
    await expect(new ClaudeCodeCliConnector(authRunner).ask(request, { connection: claudeConnection })).rejects.toMatchObject({ code: 'LOCAL_TOOL_NOT_AUTHENTICATED' })

    const unsupportedRunner = { run: vi.fn(async () => ({ stdout: 'Usage: codex', stderr: '', exitCode: 0, signal: null, durationMs: 1 })) } satisfies SecureProcessRunnerLike
    await expect(new CodexCliConnector(unsupportedRunner).ask(request, { connection: codexConnection })).rejects.toMatchObject({ code: 'LOCAL_TOOL_VERSION_UNSUPPORTED' })

    await expect(new ClaudeCodeCliConnector(emptyRunner).ask({ ...request, images: [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }] }, { connection: claudeConnection })).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
    const invalidJsonRunner = { run: vi.fn(async ({ args }: SecureProcessRunInput) => args[0] === '--help'
      ? { stdout: 'Claude Code -p --output-format json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }
      : { stdout: 'not-json', stderr: '', exitCode: 0, signal: null, durationMs: 1 }) } satisfies SecureProcessRunnerLike
    await expect(new ClaudeCodeCliConnector(invalidJsonRunner).ask(request, { connection: claudeConnection })).rejects.toMatchObject({ code: 'LOCAL_TOOL_INVALID_JSON' })
  })

  it('parses text fallback and strips terminal decoration', () => {
    expect(parseClaudeOutput(JSON.stringify({ content: [{ text: '\u001b[32mplain\u001b[0m' }] }))).toBe('plain')
    expect(() => parseClaudeOutput('\u001b[32mplain\u001b[0m')).toThrow('valid JSON')
    expect(parseCodexOutput(JSON.stringify({ output: 'ok' }))).toBe('ok')
  })
})
