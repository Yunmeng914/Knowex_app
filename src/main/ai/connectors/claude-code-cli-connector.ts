import type { AIConnectorContext, AIRequest, AIResponse } from '../ai-types'
import { AIError } from '../ai-errors'
import { cleanupCliWorkdir, createIsolatedCliWorkdir, stripAnsi, type SecureProcessRunnerLike } from '../secure-process-runner'
import { serializeCliPrompt } from '../cli-prompt-serializer'
import type { AIConnector } from './ai-connector'

export class ClaudeCodeCliConnector implements AIConnector {
  readonly transport = 'claude-code-cli' as const

  constructor(private readonly runner: SecureProcessRunnerLike) {}

  async ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse> {
    if (request.images.length) throw new AIError('UNSUPPORTED_CAPABILITY', 'Claude Code CLI image input has not been verified in Knowex. Switch to an image-capable cloud connection.')
    if (!context.connection.executablePath) throw new AIError('LOCAL_TOOL_INVALID_PATH', 'Choose a Claude Code CLI executable before asking a question.')
    const help = await this.readHelp(context.connection.executablePath)
    const workdir = createIsolatedCliWorkdir()
    try {
      const args = buildClaudeArgs(help, context.connection.model)
      const result = await this.runner.run({
        executablePath: context.connection.executablePath,
        args,
        cwd: workdir,
        stdin: serializeCliPrompt(request),
        timeoutMs: context.connection.timeoutMs,
        maxOutputBytes: 1_000_000,
        signal: context.signal
      })
      if (result.exitCode !== 0) throw mapCliExit(result.stderr || result.stdout)
      const text = parseClaudeOutput(result.stdout)
      if (!text.trim()) throw new AIError('LOCAL_TOOL_EMPTY_OUTPUT', 'Claude Code CLI returned no answer text.')
      return { text }
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }

  private async readHelp(executablePath: string): Promise<string> {
    const workdir = createIsolatedCliWorkdir()
    try {
      const result = await this.runner.run({
        executablePath,
        args: ['--help'],
        cwd: workdir,
        timeoutMs: 10_000,
        maxOutputBytes: 300_000
      })
      if (result.exitCode !== 0) throw mapCliExit(result.stderr || result.stdout)
      return `${result.stdout}\n${result.stderr}`
    } catch (error) {
      if (error instanceof AIError) throw error
      throw new AIError('LOCAL_TOOL_LAUNCH_FAILED', 'Claude Code help could not be read.', { cause: error })
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }
}

export function parseClaudeOutput(output: string): string {
  const cleaned = stripCliOutput(output)
  try {
    const parsed = JSON.parse(cleaned) as { result?: unknown; content?: unknown; text?: unknown; message?: { content?: unknown } }
    return stripAnsi(extractClaudeText(parsed)).trim()
  } catch {
    throw new AIError('LOCAL_TOOL_INVALID_JSON', 'Claude Code returned output that was not valid JSON.')
  }
}

export function buildClaudeArgs(help: string, model?: string): string[] {
  if (!/(^|\s)-p\b/.test(help) && !/--print\b/.test(help)) {
    throw new AIError('LOCAL_TOOL_VERSION_UNSUPPORTED', 'This Claude Code version does not support non-interactive print mode.')
  }
  if (!/--output-format\b/.test(help) || !/\bjson\b/i.test(help)) {
    throw new AIError('LOCAL_TOOL_VERSION_UNSUPPORTED', 'This Claude Code version does not support JSON output.')
  }
  const args = ['-p', '--output-format', 'json']
  if (/--input-format\b/.test(help)) args.push('--input-format', 'text')
  if (/--no-session-persistence\b/.test(help)) args.push('--no-session-persistence')
  if (/--no-chrome\b/.test(help)) args.push('--no-chrome')
  if (/--disable-slash-commands\b/.test(help)) args.push('--disable-slash-commands')
  if (/--strict-mcp-config\b/.test(help)) args.push('--strict-mcp-config')
  if (/--permission-mode\b/.test(help)) args.push('--permission-mode', 'default')
  if (/--tools\b/.test(help)) args.push('--tools', '')
  if (/--disallowedTools\b/.test(help) || /--disallowed-tools\b/.test(help)) {
    args.push('--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,MultiEdit,NotebookEdit,WebFetch,WebSearch')
  }
  if (/--max-turns\b/.test(help)) args.push('--max-turns', '1')
  if (/--safe-mode\b/.test(help)) args.push('--safe-mode')
  if (model && /--model\b/.test(help)) args.push('--model', model)
  return args
}

export function stripCliOutput(output: string): string {
  return stripAnsi(output)
    .split(/\r?\n/)
    .filter((line) => !/^\s*(debug|info|progress)[:\]]/i.test(line))
    .join('\n')
    .trim()
}

export function mapCliExit(output: string): AIError {
  const lower = output.toLowerCase()
  if (lower.includes('auth') || lower.includes('login') || lower.includes('not logged in')) {
    return new AIError('LOCAL_TOOL_NOT_AUTHENTICATED', 'The local AI tool is not authenticated. Sign in with the CLI and try again.')
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return new AIError('LOCAL_TOOL_AUTHORIZATION_ERROR', 'The local AI tool authorization failed. Check the CLI account access from a terminal.')
  }
  if (lower.includes('network') || lower.includes('enotfound') || lower.includes('econn') || lower.includes('certificate') || lower.includes('stream disconnected')) {
    return new AIError('LOCAL_TOOL_NETWORK_ERROR', 'The local AI tool could not reach its service. Check network, proxy, certificates, and provider status.')
  }
  if (lower.includes('timeout')) return new AIError('LOCAL_TOOL_TIMEOUT', 'The local AI tool timed out.')
  return new AIError('LOCAL_TOOL_EXIT_ERROR', summarize(output) || 'The local AI tool exited with an error.')
}

function extractClaudeText(parsed: { result?: unknown; content?: unknown; text?: unknown; message?: { content?: unknown } }): string {
  const direct = asText(parsed.result) ?? asText(parsed.content) ?? asText(parsed.text) ?? asText(parsed.message?.content)
  return direct ?? ''
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return undefined
}

function summarize(output: string): string {
  return stripCliOutput(output).slice(0, 500)
}
