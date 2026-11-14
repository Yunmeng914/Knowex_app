import type { AIConnectorContext, AIImageInput, AIRequest, AIResponse } from '../ai-types'
import { AIError, isAbortError, providerErrorFromStatus } from '../ai-errors'
import type { CloudAIProvider } from '../../../shared/domain/models'
import { assertResolvedEndpointPolicy, isLocalCompatibleServiceUrl } from '../endpoint-policy'
import { resolveAIEndpoint } from '../endpoint-resolver'
import type { AIConnector } from './ai-connector'

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>
  error?: { message?: string }
}

type FetchLike = typeof fetch

export class AnthropicMessagesConnector implements AIConnector {
  readonly transport = 'anthropic-messages' as const

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse> {
    if (!context.apiKey) throw new AIError('MISSING_API_KEY', 'Configure an API key for the active AI connection before asking a question.')
    if (!context.connection.model?.trim()) throw new AIError('MISSING_MODEL', 'Choose a model before asking a question.')
    const messages = [
      ...request.messages.slice(0, -1).map((message) => ({ role: message.role, content: message.content })),
      this.buildFinalUserMessage(request)
    ]

    let response: Response
    try {
      const endpoint = resolveAIEndpoint({
        baseUrl: context.connection.baseUrl ?? 'https://api.anthropic.com/v1/messages',
        endpointMode: context.connection.endpointMode ?? 'full-endpoint',
        transport: 'anthropic-messages',
        operation: 'messages'
      })
      await assertResolvedEndpointPolicy({
        url: endpoint,
        provider: context.connection.provider as CloudAIProvider,
        transport: 'anthropic-messages',
        allowLocalService: context.connection.provider === 'custom' && isLocalCompatibleServiceUrl(endpoint)
      })
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': context.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: context.connection.model,
          system: request.systemPrompt,
          max_tokens: 1024,
          messages
        }),
        signal: context.signal ?? AbortSignal.timeout(context.connection.timeoutMs)
      })
    } catch (error) {
      if (error instanceof AIError) throw error
      if (isAbortError(error)) throw new AIError('TIMEOUT', 'The model request timed out.', { cause: error, retryable: true })
      throw new AIError('NETWORK_ERROR', 'The model request could not reach the configured endpoint.', { cause: error })
    }

    const body = await response.json().catch((error) => {
      throw new AIError('RESPONSE_PARSE_ERROR', 'The provider returned a non-JSON response.', { cause: error, httpStatus: response.status })
    }) as AnthropicResponse
    if (!response.ok) throw providerErrorFromStatus(response.status, body.error?.message || `The provider returned HTTP ${response.status}.`)
    const text = body.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
    if (!text?.trim()) throw new AIError('EMPTY_RESPONSE', 'The provider returned no text answer.')
    return { text: text.trim() }
  }

  private buildFinalUserMessage(request: AIRequest): { role: 'user'; content: string | Array<Record<string, unknown>> } {
    const finalText = request.messages.at(-1)?.content ?? request.evidenceText
    if (!request.images.length) return { role: 'user', content: finalText }
    return {
      role: 'user',
      content: [
        { type: 'text', text: finalText },
        ...request.images.map((image) => this.toImageBlock(image))
      ]
    }
  }

  private toImageBlock(image: AIImageInput): Record<string, unknown> {
    const [, data = ''] = image.dataUrl.split(',', 2)
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data
      }
    }
  }
}
