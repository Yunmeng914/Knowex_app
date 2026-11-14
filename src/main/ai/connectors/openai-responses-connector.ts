import type { AIConnectorContext, AIRequest, AIResponse } from '../ai-types'
import { AIError, isAbortError, providerErrorFromStatus } from '../ai-errors'
import type { CloudAIProvider } from '../../../shared/domain/models'
import { assertResolvedEndpointPolicy, isLocalCompatibleServiceUrl } from '../endpoint-policy'
import { resolveAIEndpoint } from '../endpoint-resolver'
import type { AIConnector } from './ai-connector'

interface OpenAIResponse {
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{ type?: string; text?: string }>
  }>
  error?: { message?: string }
}

type FetchLike = typeof fetch
type ResponseMessageRole = 'user' | 'assistant' | 'system' | 'developer'
interface ResponseInputMessage {
  role: ResponseMessageRole
  content: string
}

export class OpenAIResponsesConnector implements AIConnector {
  readonly transport = 'openai-responses' as const

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse> {
    if (!context.apiKey) throw new AIError('MISSING_API_KEY', 'Configure an API key for the active AI connection before asking a question.')
    if (!context.connection.model?.trim()) throw new AIError('MISSING_MODEL', 'Choose a model before asking a question.')
    const input = buildResponsesInput(request)

    let response: Response
    try {
      const endpoint = resolveAIEndpoint({
        baseUrl: context.connection.baseUrl ?? 'https://api.openai.com/v1/responses',
        endpointMode: context.connection.endpointMode ?? 'full-endpoint',
        transport: 'openai-responses',
        operation: 'responses'
      })
      await assertResolvedEndpointPolicy({
        url: endpoint,
        provider: context.connection.provider as CloudAIProvider,
        transport: 'openai-responses',
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
          store: false,
          instructions: request.systemPrompt,
          input
        }),
        signal: context.signal ?? AbortSignal.timeout(context.connection.timeoutMs)
      })
    } catch (error) {
      if (error instanceof AIError) throw error
      if (isAbortError(error)) throw new AIError('TIMEOUT', 'The vision model request timed out.', { cause: error, retryable: true })
      throw new AIError('NETWORK_ERROR', 'The vision model request could not reach the configured endpoint.', { cause: error })
    }

    const body = await response.json().catch((error) => {
      throw new AIError('RESPONSE_PARSE_ERROR', 'The provider returned a non-JSON response.', { cause: error, httpStatus: response.status })
    }) as OpenAIResponse
    if (!response.ok) {
      throw providerErrorFromStatus(response.status, body.error?.message || `The vision model returned HTTP ${response.status}.`)
    }
    const text = body.output_text || body.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text')?.text
    if (!text?.trim()) throw new AIError('EMPTY_RESPONSE', 'The vision model returned no text answer.')
    return { text: text.trim() }
  }
}

function buildResponsesInput(request: AIRequest): Array<{ role: ResponseMessageRole; content: Array<Record<string, string>> }> {
  const messages = request.messages as ResponseInputMessage[]
  const currentMessage = messages.at(-1)
  const history = messages.slice(0, -1)
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: normalizeResponseRole(message.role),
      content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }]
    }))
  const currentText = currentMessage?.role === 'user' && currentMessage.content.trim()
    ? currentMessage.content
    : request.evidenceText
  const currentContent: Array<Record<string, string>> = [{ type: 'input_text', text: currentText }]
  for (const image of request.images) {
    currentContent.push({ type: 'input_image', image_url: image.dataUrl, detail: 'high' })
  }
  return [...history, { role: 'user', content: currentContent }]
}

function normalizeResponseRole(role: string): ResponseMessageRole {
  if (role === 'assistant' || role === 'system' || role === 'developer') return role
  return 'user'
}
