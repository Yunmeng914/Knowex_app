import type { AIConnectorContext, AIRequest, AIResponse } from '../ai-types'
import { AIError, isAbortError, providerErrorFromStatus } from '../ai-errors'
import type { AIProvider, CloudAIProvider } from '../../../shared/domain/models'
import { assertResolvedEndpointPolicy, isLocalCompatibleServiceUrl } from '../endpoint-policy'
import { resolveAIEndpoint } from '../endpoint-resolver'
import type { AIConnector } from './ai-connector'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  error?: { message?: string }
}

type FetchLike = typeof fetch

export class OpenAIChatConnector implements AIConnector {
  readonly transport = 'openai-chat-completions' as const

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse> {
    if (!context.apiKey) throw new AIError('MISSING_API_KEY', 'Configure an API key for the active AI connection before asking a question.')
    if (!context.connection.model?.trim()) throw new AIError('MISSING_MODEL', 'Choose a model before asking a question.')
    const messages = [
      { role: 'system', content: request.systemPrompt },
      ...request.messages.slice(0, -1).map((message) => ({ role: message.role, content: message.content })),
      this.buildFinalUserMessage(request)
    ]

    let response: Response
    try {
      const endpoint = buildChatCompletionsEndpoint(context.connection.baseUrl ?? 'https://api.openai.com/v1', context.connection.endpointMode, context.connection.provider)
      await assertResolvedEndpointPolicy({
        url: endpoint,
        provider: context.connection.provider as CloudAIProvider,
        transport: 'openai-chat-completions',
        allowLocalService: context.connection.provider === 'custom' && isLocalCompatibleServiceUrl(endpoint)
      })
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${context.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: context.connection.model,
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
    }) as ChatCompletionResponse
    if (!response.ok) {
      const providerMessage = providerSpecificErrorMessage(context.connection.provider, response.status, body.error?.message || `The provider returned HTTP ${response.status}.`)
      if (context.connection.provider === 'minimax' && (response.status === 401 || response.status === 403)) throw new AIError('AUTHENTICATION_FAILED', providerMessage)
      if (context.connection.provider === 'minimax' && response.status === 404) throw new AIError('PROVIDER_UNAVAILABLE', providerMessage)
      if (context.connection.provider === 'minimax' && /unknown model/i.test(body.error?.message ?? '')) throw new AIError('MODEL_NOT_FOUND', providerMessage)
      throw providerErrorFromStatus(response.status, providerMessage)
    }
    const content = body.choices?.[0]?.message?.content
    const text = typeof content === 'string'
      ? content
      : content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
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
        ...request.images.map((image) => ({
          type: 'image_url',
          image_url: { url: image.dataUrl, detail: 'high' }
        }))
      ]
    }
  }
}

export function buildChatCompletionsEndpoint(baseUrl: string, endpointMode: 'base-url' | 'full-endpoint' = 'base-url', provider?: AIProvider): string {
  return resolveAIEndpoint({
    baseUrl,
    provider,
    endpointMode,
    transport: 'openai-chat-completions',
    operation: 'chat-completions'
  })
}

function providerSpecificErrorMessage(provider: string, status: number, message: string): string {
  if (provider === 'minimax') {
    if (status === 401 || status === 403) return 'Authentication or account permission failed. Check the API key, MiniMax Mainland China/international region, and whether the key belongs to the correct quota plan.'
    if (status === 404) return 'MiniMax endpoint is not reachable. Check the service region and API root URL.'
    if (/unknown model/i.test(message)) return 'The current MiniMax model name is unavailable. Detect available models again; do not use the provider name as the model name.'
  }
  return message
}
