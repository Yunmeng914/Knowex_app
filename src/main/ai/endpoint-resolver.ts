import type { AIProvider, AITransport } from '../../shared/domain/models'
import { AIError } from './ai-errors'
import { parseAndNormalizeEndpoint } from './endpoint-policy'

export type AIEndpointMode = 'base-url' | 'full-endpoint'
export type AIEndpointOperation = 'responses' | 'chat-completions' | 'messages' | 'models'

interface ResolveEndpointInput {
  baseUrl: string
  provider?: AIProvider
  transport: AITransport
  operation: AIEndpointOperation
  endpointMode?: AIEndpointMode
}

const OPERATION_SUFFIX: Record<Exclude<AIEndpointOperation, 'models'>, string> = {
  responses: '/responses',
  'chat-completions': '/chat/completions',
  messages: '/messages'
}

const TRANSPORT_OPERATION: Partial<Record<AITransport, Exclude<AIEndpointOperation, 'models'>>> = {
  'openai-responses': 'responses',
  'openai-chat-completions': 'chat-completions',
  'anthropic-messages': 'messages'
}

export function resolveAIEndpoint(input: ResolveEndpointInput): string {
  const url = parseEndpointUrl(input.baseUrl)
  const operation = input.operation === 'models'
    ? 'models'
    : assertTransportOperation(input.transport, input.operation)
  const path = trimTrailingSlash(url.pathname)
  url.search = ''
  url.hash = ''

  if (input.endpointMode === 'full-endpoint' && operation !== 'models') {
    return resolveFullEndpoint(url, path, operation)
  }

  if (operation === 'models') {
    url.pathname = resolveModelsPath(path, input.transport, input.endpointMode, input.provider)
    return url.toString()
  }

  url.pathname = resolveOperationPath(path, operation, input.provider)
  return url.toString()
}

function resolveFullEndpoint(url: URL, path: string, operation: Exclude<AIEndpointOperation, 'models'>): string {
  const expected = operation === 'messages' ? '/v1/messages' : OPERATION_SUFFIX[operation]
  if (!path.endsWith(expected)) {
    throw new AIError('INVALID_BASE_URL', `The configured endpoint must end with ${expected}.`, {
      retryable: false,
      suggestedAction: 'Choose Base URL mode if this is an API root, or enter the complete endpoint URL.'
    })
  }
  url.pathname = path
  return url.toString()
}

function resolveModelsPath(path: string, transport: AITransport, endpointMode?: AIEndpointMode, provider?: AIProvider): string {
  if (path.endsWith('/models')) return path

  const requestOperation = TRANSPORT_OPERATION[transport]
  const stripped = requestOperation ? stripKnownEndpoint(path, requestOperation) : path
  if (endpointMode === 'full-endpoint') {
    throw new AIError('INVALID_BASE_URL', 'A full endpoint cannot be used for model discovery.', {
      retryable: false,
      suggestedAction: 'Switch to Base URL mode, configure a Model List Endpoint, or enter the model manually.'
    })
  }

  if (hasApiVersionSuffix(stripped)) return joinPath(stripped, 'models')
  if (provider === 'deepseek') return joinPath(stripped, 'models')
  return joinPath(stripped, 'v1', 'models')
}

function resolveOperationPath(path: string, operation: Exclude<AIEndpointOperation, 'models'>, provider?: AIProvider): string {
  const stripped = stripKnownEndpoint(path, operation)
  if (stripped !== path) return path

  const suffix = OPERATION_SUFFIX[operation]
  if (provider === 'deepseek' && operation === 'chat-completions') return joinPath(path, suffix.slice(1))
  if (operation === 'messages') {
    if (path.endsWith('/v1')) return joinPath(path, 'messages')
    if (path === '') return '/v1/messages'
    return joinPath(path, 'v1', 'messages')
  }

  if (hasApiVersionSuffix(path)) return joinPath(path, suffix.slice(1))
  return joinPath(path, 'v1', suffix.slice(1))
}

function stripKnownEndpoint(path: string, operation: Exclude<AIEndpointOperation, 'models'>): string {
  const suffix = OPERATION_SUFFIX[operation]
  if (path.endsWith(suffix)) return trimTrailingSlash(path.slice(0, -suffix.length))
  if (operation === 'messages' && path.endsWith('/v1/messages')) return trimTrailingSlash(path.slice(0, -'/messages'.length))
  return path
}

function assertTransportOperation(transport: AITransport, operation: AIEndpointOperation): Exclude<AIEndpointOperation, 'models'> {
  const expected = TRANSPORT_OPERATION[transport]
  if (!expected || operation !== expected) {
    throw new AIError('INVALID_CONFIG', `The ${operation} endpoint does not match transport ${transport}.`, {
      retryable: false,
      suggestedAction: 'Choose the provider protocol that matches this endpoint.'
    })
  }
  return operation
}

function parseEndpointUrl(value: string): URL {
  try {
    const url = parseAndNormalizeEndpoint(value)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported protocol')
    return url
  } catch (error) {
    if (error instanceof AIError) throw error
    throw new AIError('INVALID_BASE_URL', 'Enter a valid HTTP or HTTPS Base URL.', {
      cause: error,
      retryable: false,
      suggestedAction: 'Use a complete URL such as https://example.com/v1.'
    })
  }
}

function hasApiVersionSuffix(path: string): boolean {
  return /\/v\d+(?:\/)?$/i.test(path)
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .filter((part) => part.length > 0)
    .map((part, index) => index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, ''))
    .join('/')
    .replace(/\/{2,}/g, '/')
  return joined.startsWith('/') ? joined : `/${joined}`
}
