import type { AskAIInput } from '../../shared/contracts/ipc'
import { CredentialStore } from '../storage/credential-store'
import { AIConnectionService } from './ai-connection-service'
import { AIError } from './ai-errors'
import { PromptBuilder } from './prompt-builder'
import { ProviderRegistry } from './provider-registry'
import { assertAIRequestBudget } from './request-budget'

export class AIService {
  private readonly activeRequests = new Map<string, AbortController>()

  constructor(
    private readonly connections: AIConnectionService,
    private readonly credentials: CredentialStore,
    private readonly promptBuilder: PromptBuilder,
    private readonly registry: ProviderRegistry
  ) {}

  async ask(input: AskAIInput): Promise<string> {
    const requestId = input.requestId
    const controller = new AbortController()
    let timedOut = false
    if (requestId) this.activeRequests.set(requestId, controller)
    try {
      const connection = await this.connections.getActiveConnection()
      const timeout = setTimeout(() => {
        timedOut = true
        controller.abort(new AIError('TIMEOUT', 'The AI request timed out.'))
      }, normalizeAIRequestTimeoutMs(connection.timeoutMs))
      try {
        if (!connection.model?.trim() && !isLocalTransport(connection.transport)) {
          throw new AIError('MISSING_MODEL', 'Choose a model before asking a question.')
        }
        const request = await this.promptBuilder.build(input)
        assertAIRequestBudget(request)
        if (request.images.length > 0 && !connection.capabilities.vision) {
          throw new AIError('UNSUPPORTED_CAPABILITY', 'The active AI connection does not support image annotations. Switch to a connection that supports images.')
        }
        const connector = this.registry.get(connection.transport)
        const apiKey = isLocalTransport(connection.transport) ? undefined : await this.readApiKey(connection.id)
        const response = await connector.ask(request, { connection: { ...connection, timeoutMs: normalizeAIRequestTimeoutMs(connection.timeoutMs) }, apiKey, signal: controller.signal })
        return response.text
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      if (timedOut && error instanceof AIError && error.code === 'REQUEST_CANCELLED') {
        throw new AIError('TIMEOUT', 'The AI request timed out.', { cause: error })
      }
      if (controller.signal.aborted && requestId && !timedOut && error instanceof AIError && error.code !== 'TIMEOUT') {
        throw new AIError('REQUEST_CANCELLED', 'The AI request was cancelled.', { cause: error })
      }
      throw error
    } finally {
      if (requestId) this.activeRequests.delete(requestId)
    }
  }

  cancel(requestId: string): { cancelled: boolean } {
    const controller = this.activeRequests.get(requestId)
    if (!controller) return { cancelled: false }
    controller.abort(new AIError('REQUEST_CANCELLED', 'The AI request was cancelled.'))
    this.activeRequests.delete(requestId)
    return { cancelled: true }
  }

  private async readApiKey(connectionId: string): Promise<string> {
    try {
      return await this.credentials.getAIKey(connectionId)
    } catch (error) {
      throw new AIError('MISSING_API_KEY', 'Configure an API key for the active AI connection before asking a question.', { cause: error })
    }
  }
}

export function normalizeAIRequestTimeoutMs(value: number | undefined, minimum = 10_000, maximum = 180_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 90_000
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function isLocalTransport(transport: string): boolean {
  return transport === 'codex-cli' || transport === 'claude-code-cli'
}
