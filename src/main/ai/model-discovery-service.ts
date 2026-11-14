import type { AIModelDiscovery, AIModelPublic, AIProvider, AITransport, CloudAIProvider, CloudAITransport, ModelDiscoveryResult } from '../../shared/domain/models'
import { AIError, isAbortError, providerErrorFromStatus } from './ai-errors'
import { assertResolvedEndpointPolicy, isLocalCompatibleServiceUrl } from './endpoint-policy'
import { resolveAIEndpoint } from './endpoint-resolver'

type FetchLike = typeof fetch

interface DiscoverInput {
  provider: CloudAIProvider
  transport: CloudAITransport
  baseUrl: string
  endpointMode?: 'base-url' | 'full-endpoint'
  modelDiscovery?: AIModelDiscovery
  modelListEndpoint?: string
  apiKey: string
  currentModel?: string
  signal?: AbortSignal
}

interface RawModel {
  id?: unknown
  name?: unknown
  display_name?: unknown
  displayName?: unknown
  object?: unknown
  owned_by?: unknown
  type?: unknown
  capabilities?: unknown
  supported_apis?: unknown
  input_modalities?: unknown
  modalities?: unknown
}

export class ModelDiscoveryService {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async discover(input: DiscoverInput): Promise<ModelDiscoveryResult> {
    const discovery = input.modelDiscovery ?? defaultDiscoveryFor(input.provider)
    if (discovery === 'unsupported') {
      return {
        success: false,
        models: [],
        source: input.provider === 'custom' ? 'manual' : 'provider-api',
        message: 'This connection does not expose a model list. Enter the model ID manually.'
      }
    }
    const modelsUrl = buildModelsEndpoint(input.provider, input.transport, input.baseUrl, input.endpointMode, discovery, input.modelListEndpoint)
    await assertResolvedEndpointPolicy({
      url: modelsUrl,
      provider: input.provider,
      transport: input.transport,
      allowLocalService: input.provider === 'custom' && isLocalCompatibleServiceUrl(modelsUrl)
    })
    let response: Response
    try {
      response = await this.fetchImpl(modelsUrl, {
        method: 'GET',
        redirect: 'error',
        headers: headersForProvider(input.provider, input.apiKey),
        signal: input.signal ?? AbortSignal.timeout(30_000)
      })
    } catch (error) {
      if (error instanceof AIError) throw error
      if (isAbortError(error)) throw new AIError('TIMEOUT', 'The model list request timed out.', { cause: error, retryable: true })
      throw new AIError('NETWORK_ERROR', 'The model list request could not reach the configured endpoint.', { cause: error })
    }

    const body = await response.json().catch((error) => {
      throw new AIError('RESPONSE_PARSE_ERROR', 'The model list response was not valid JSON.', { cause: error, httpStatus: response.status })
    }) as unknown
    if (!response.ok) {
      const message = readProviderErrorMessage(body)
      if (input.provider === 'minimax') throw minimaxDiscoveryError(response.status, message)
      if (response.status === 404) throw new AIError('MODEL_LIST_UNAVAILABLE', 'This endpoint does not expose a model list. Enter the model name manually.')
      throw providerErrorFromStatus(response.status, message || `The provider returned HTTP ${response.status}.`)
    }

    if (!hasModelListShape(body)) {
      throw new AIError('RESPONSE_PARSE_ERROR', 'The model list response did not contain a valid model array.', { httpStatus: response.status })
    }
    const models = parseModels(body, input.provider, input.transport)
    if (!models.length) {
      return {
        success: false,
        models: [],
        source: input.provider === 'custom' ? 'compatible-api' : 'provider-api',
        message: input.provider === 'minimax'
          ? 'The current MiniMax key returned no available text models. Check account permission, quota plan, or service region.'
          : 'No chat-capable models were found. Enter the model name manually.'
      }
    }
    const recommendedModelId = recommendModel(models, input.provider, input.currentModel)
    return {
      success: true,
      models: models.map((model) => ({ ...model, recommended: model.id === recommendedModelId })),
      recommendedModelId,
      source: input.provider === 'custom' ? 'compatible-api' : 'provider-api',
      message: 'Model list loaded.'
    }
  }
}

export function buildModelsEndpoint(
  provider: AIProvider,
  transport: AITransport,
  baseUrl: string,
  endpointMode: 'base-url' | 'full-endpoint' = 'base-url',
  modelDiscovery: AIModelDiscovery = defaultDiscoveryFor(provider),
  modelListEndpoint?: string
): string {
  if (modelDiscovery === 'unsupported') {
    throw new AIError('MODEL_LIST_UNAVAILABLE', 'This connection does not expose a model list. Enter the model ID manually.')
  }
  if (modelDiscovery === 'custom-models-endpoint') {
    if (!modelListEndpoint) throw new AIError('INVALID_BASE_URL', 'Enter a Model List Endpoint before detecting models.')
    assertNoSecretInUrl(modelListEndpoint)
    return resolveAIEndpoint({ baseUrl: modelListEndpoint, transport, operation: 'models', endpointMode: 'base-url' })
  }
  if (provider === 'custom' && endpointMode === 'full-endpoint') {
    throw new AIError('MODEL_LIST_UNAVAILABLE', 'Custom full endpoint mode does not infer a model list endpoint. Enter a model manually or configure a Model List Endpoint.')
  }
  return resolveAIEndpoint({
    baseUrl,
    provider,
    transport: modelDiscovery === 'anthropic-models' ? 'anthropic-messages' : transport,
    operation: 'models',
    endpointMode: undefined
  })
}

export function parseModels(body: unknown, provider: CloudAIProvider, transport: CloudAITransport): AIModelPublic[] {
  const rawItems = extractModelItems(body)
  const seen = new Set<string>()
  const models: AIModelPublic[] = []
  for (const raw of rawItems) {
    const id = typeof raw === 'string' ? raw : stringValue(raw.id) ?? stringValue(raw.name)
    if (!id || seen.has(id) || isClearlyNonChatModel(id, raw)) continue
    seen.add(id)
    models.push({
      id,
      displayName: typeof raw === 'string' ? undefined : stringValue(raw.displayName) ?? stringValue(raw.display_name),
      provider,
      transport,
      recommended: false,
      declaredCapabilities: declaredCapabilities(raw, provider, id)
    })
  }
  return models
}

export function recommendModel(models: AIModelPublic[], provider: CloudAIProvider, currentModel?: string): string | undefined {
  if (!models.length) return undefined
  if (currentModel && models.some((model) => model.id === currentModel)) return currentModel
  const providerHints: Partial<Record<CloudAIProvider, string[]>> = {
    minimax: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.1'],
    glm: ['glm-5.2', 'glm-5.1', 'glm-5', 'glm-4.7'],
    deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4'],
    kimi: ['moonshot-v1-8k'],
    openai: ['gpt-4.1', 'gpt-4o', 'gpt-5'],
    anthropic: ['claude-sonnet', 'claude-3-5-sonnet']
  }
  for (const hint of providerHints[provider] ?? []) {
    const exact = models.find((model) => model.id.toLowerCase() === hint.toLowerCase())
    if (exact) return exact.id
    const partial = models.find((model) => model.id.toLowerCase().includes(hint.toLowerCase()))
    if (partial) return partial.id
  }
  return models[0]?.id
}

function headersForProvider(provider: CloudAIProvider, apiKey: string): HeadersInit {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json'
    }
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json'
  }
}

function extractModelItems(body: unknown): Array<RawModel | string> {
  if (Array.isArray(body)) return body as Array<RawModel | string>
  if (!body || typeof body !== 'object') return []
  const record = body as Record<string, unknown>
  if (Array.isArray(record.data)) return record.data as Array<RawModel | string>
  if (Array.isArray(record.models)) return record.models as Array<RawModel | string>
  return []
}

function hasModelListShape(body: unknown): boolean {
  if (Array.isArray(body)) return true
  if (!body || typeof body !== 'object') return false
  const record = body as Record<string, unknown>
  return Array.isArray(record.data) || Array.isArray(record.models)
}

function isClearlyNonChatModel(id: string, raw: RawModel | string): boolean {
  const lower = id.toLowerCase()
  const blocked = ['embedding', 'embed', 'whisper', 'tts', 'audio', 'speech', 'moderation', 'rerank', 'image-', 'dall-e', 'music', 'video', 'stable-diffusion']
  if (blocked.some((token) => lower.includes(token))) return true
  if (typeof raw !== 'string') {
    const object = stringValue(raw.object)?.toLowerCase()
    const type = stringValue(raw.type)?.toLowerCase()
    if (object === 'embedding' || type === 'embedding' || type === 'image' || type === 'audio' || type === 'video') return true
  }
  return false
}

function declaredCapabilities(raw: RawModel | string, provider: CloudAIProvider, id: string): AIModelPublic['declaredCapabilities'] {
  const inferredImage = provider === 'glm' && /\b(v|vl|vision)\b|glm-\d+v|glm-.*vision/i.test(id)
  if (typeof raw === 'string') return { text: true, image: inferredImage ? true : undefined }
  const values = [
    ...arrayValues(raw.supported_apis),
    ...arrayValues(raw.input_modalities),
    ...arrayValues(raw.modalities),
    ...arrayValues(raw.capabilities)
  ].map((value) => value.toLowerCase())
  return {
    text: true,
    image: values.some((value) => value === 'image' || value === 'vision' || value === 'images')
      ? true
      : inferredImage ? true : undefined
  }
}

function minimaxDiscoveryError(status: number, message?: string): AIError {
  const text = message ?? ''
  if (status === 401 || status === 403) {
    return new AIError('AUTHENTICATION_FAILED', 'Authentication or account permission failed. Check the API key, MiniMax Mainland China/international region, and whether the key belongs to the correct quota plan.')
  }
  if (status === 404) {
    return new AIError('MODEL_LIST_UNAVAILABLE', 'MiniMax model list endpoint is not reachable. Check the service region and API root URL. You can still enter the model manually if this endpoint is unavailable.')
  }
  if (/unknown model/i.test(text)) {
    return new AIError('MODEL_NOT_FOUND', 'The current MiniMax model name is unavailable. Detect available models again; do not use the provider name as the model name.')
  }
  if (status === 429) return new AIError('RATE_LIMITED', 'MiniMax rate limit or quota was reached. Check balance, package quota, and request frequency.')
  return providerErrorFromStatus(status, text || `MiniMax returned HTTP ${status}.`)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function arrayValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
  }
  return []
}

function readProviderErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const error = record.error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  const message = record.message
  return typeof message === 'string' ? message : undefined
}

function defaultDiscoveryFor(provider: AIProvider): AIModelDiscovery {
  if (provider === 'custom') return 'unsupported'
  if (provider === 'anthropic') return 'anthropic-models'
  return 'openai-models'
}

function assertNoSecretInUrl(value: string): void {
  const url = new URL(value)
  for (const key of url.searchParams.keys()) {
    if (/key|token|secret|authorization|auth/i.test(key)) {
      throw new AIError('INVALID_BASE_URL', 'Model List Endpoint must not include API keys or tokens in query parameters.', {
        retryable: false,
        suggestedAction: 'Remove secrets from the URL. Knowex sends the API key through request headers.'
      })
    }
  }
}
