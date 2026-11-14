import type { AIConnectorContext, AIRequest, AIResponse } from '../ai-types'
import { AIError } from '../ai-errors'
import { cleanupCliWorkdir, createIsolatedCliWorkdir, stripAnsi, type SecureProcessRunnerLike } from '../secure-process-runner'
import { serializeCliPrompt } from '../cli-prompt-serializer'
import { mapCliExit, stripCliOutput } from './claude-code-cli-connector'
import type { AIConnector } from './ai-connector'

export class CodexCliConnector implements AIConnector {
  readonly transport = 'codex-cli' as const

  constructor(private readonly runner: SecureProcessRunnerLike) {}

  async ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse> {
    if (request.images.length) throw new AIError('UNSUPPORTED_CAPABILITY', 'Codex CLI image input has not been verified in Knowex. Switch to an image-capable cloud connection.')
    if (!context.connection.executablePath) throw new AIError('LOCAL_TOOL_INVALID_PATH', 'Choose a Codex CLI executable before asking a question.')
    const execHelp = await this.readExecHelp(context.connection.executablePath)
    if (!/\busage:\s*codex\s+exec\b/i.test(execHelp) && !/\bcodex\s+exec\s+\[options\]/i.test(execHelp)) {
      throw new AIError('LOCAL_TOOL_VERSION_UNSUPPORTED', 'This Codex CLI version does not expose a verified non-interactive exec command.')
    }

    const workdir = createIsolatedCliWorkdir()
    try {
      const args = ['exec']
      if (/--skip-git-repo-check/.test(execHelp)) args.push('--skip-git-repo-check')
      if (/--sandbox\b/.test(execHelp) && /\bread-only\b/.test(execHelp)) args.push('--sandbox', 'read-only')
      if (context.connection.model && /--model\b/.test(execHelp)) args.push('--model', context.connection.model)
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
      const text = parseCodexOutput(result.stdout)
      if (!text.trim()) throw new AIError('LOCAL_TOOL_EMPTY_OUTPUT', 'Codex CLI returned no answer text.')
      return { text }
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }

  private async readExecHelp(executablePath: string): Promise<string> {
    const workdir = createIsolatedCliWorkdir()
    try {
      const result = await this.runner.run({
        executablePath,
        args: ['exec', '--help'],
        cwd: workdir,
        timeoutMs: 10_000,
        maxOutputBytes: 200_000
      })
      if (result.exitCode !== 0) throw mapCliExit(result.stderr || result.stdout)
      return `${result.stdout}\n${result.stderr}`
    } catch (error) {
      if (error instanceof AIError) throw error
      throw new AIError('LOCAL_TOOL_LAUNCH_FAILED', 'Codex CLI exec help could not be read.', { cause: error })
    } finally {
      await cleanupCliWorkdir(workdir)
    }
  }
}

export function parseCodexOutput(output: string): string {
  const cleaned = stripCliOutput(output)
  try {
    const parsed = JSON.parse(cleaned) as { result?: string; output?: string; text?: string }
    return (parsed.result ?? parsed.output ?? parsed.text ?? '').trim()
  } catch {
    return stripAnsi(cleaned).trim()
  }
}
