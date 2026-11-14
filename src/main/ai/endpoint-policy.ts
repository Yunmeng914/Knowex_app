import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import type { CloudAIProvider, CloudAITransport } from '../../shared/domain/models'
import { AIError } from './ai-errors'

export interface EndpointPolicyInput {
  url: string
  provider: CloudAIProvider
  transport: CloudAITransport
  allowLocalService?: boolean
  resolveHost?: (hostname: string) => Promise<string[]>
}

const SECRET_QUERY_KEYS = new Set(['key', 'api_key', 'token', 'secret', 'auth', 'authorization', 'password'])

const OFFICIAL_PROVIDER_ORIGINS: Record<Exclude<CloudAIProvider, 'custom'>, string[]> = {
  openai: ['https://api.openai.com'],
  anthropic: ['https://api.anthropic.com'],
  deepseek: ['https://api.deepseek.com'],
  kimi: ['https://api.moonshot.cn', 'https://api.moonshot.ai'],
  minimax: ['https://api.minimaxi.com', 'https://api.minimax.io'],
  glm: ['https://open.bigmodel.cn']
}

export function assertEndpointPolicy(input: EndpointPolicyInput): URL {
  const url = parseAndNormalizeEndpoint(input.url)
  const local = isLocalHostname(url.hostname)
  const testLocal = process.env.NODE_ENV === 'test' && local
  if (url.protocol === 'http:' && !(input.allowLocalService && local) && !testLocal) {
    throw new AIError('INVALID_ENDPOINT', 'Remote AI endpoints must use HTTPS.', {
      retryable: false,
      suggestedAction: 'Use an HTTPS endpoint, or configure a local compatible service explicitly.'
    })
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AIError('INVALID_ENDPOINT', 'AI endpoints must use HTTP or HTTPS.', { retryable: false })
  }
  if (input.provider !== 'custom' && !testLocal) {
    const allowed = OFFICIAL_PROVIDER_ORIGINS[input.provider]
    if (!allowed.includes(url.origin)) {
      throw new AIError('THIRD_PARTY_ENDPOINT_CONFIRMATION_REQUIRED', 'Official providers can only use their official API origin. Use a Custom connection for third-party relay endpoints.', {
        retryable: false,
        suggestedAction: 'Switch this connection to Custom and confirm that the API key and annotation content will be sent to the third-party address.'
      })
    }
  }
  if (input.provider === 'custom' && !input.allowLocalService && isPrivateOrMetadataEndpoint(url.hostname)) {
    throw new AIError('PRIVATE_NETWORK_ENDPOINT_BLOCKED', 'Remote custom AI endpoints cannot target localhost, private networks, link-local, multicast, unspecified, or cloud metadata addresses.', {
      retryable: false,
      suggestedAction: 'Use an HTTPS cloud endpoint, or configure a local compatible service mode for localhost.'
    })
  }
  return url
}

export async function assertResolvedEndpointPolicy(input: EndpointPolicyInput): Promise<URL> {
  const url = assertEndpointPolicy(input)
  if (input.provider !== 'custom' || input.allowLocalService || isIP(normalizeHostname(url.hostname))) return url
  if (process.env.NODE_ENV === 'test' && !input.resolveHost) return url
  const addresses = input.resolveHost
    ? await input.resolveHost(url.hostname)
    : (await lookup(url.hostname, { all: true })).map((item) => item.address)
  if (addresses.some(isPrivateOrMetadataEndpoint)) {
    throw new AIError('PRIVATE_NETWORK_ENDPOINT_BLOCKED', 'The custom AI endpoint resolves to a private, local, link-local, multicast, unspecified, or cloud metadata address.', {
      retryable: false,
      suggestedAction: 'Use a public HTTPS endpoint or local compatible-service mode.'
    })
  }
  return url
}

export function parseAndNormalizeEndpoint(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new AIError('INVALID_ENDPOINT', 'Enter a valid AI endpoint URL.', { cause: error, retryable: false })
  }
  url.hostname = url.hostname.toLowerCase()
  if (url.username || url.password) {
    throw new AIError('INVALID_ENDPOINT', 'AI endpoint URLs must not contain usernames or passwords.', { retryable: false })
  }
  if (url.hash) {
    throw new AIError('INVALID_ENDPOINT', 'AI endpoint URLs must not contain fragments.', { retryable: false })
  }
  for (const key of url.searchParams.keys()) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
      throw new AIError('INVALID_ENDPOINT', 'AI endpoint URLs must not contain API keys, tokens, or passwords in query parameters.', {
        retryable: false,
        suggestedAction: 'Remove secrets from the URL. Knowex sends credentials through headers.'
      })
    }
  }
  return url
}

export function endpointOrigin(value: string): string {
  return parseAndNormalizeEndpoint(value).origin
}

export function isLocalCompatibleServiceUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = parseAndNormalizeEndpoint(value)
    return url.protocol === 'http:' && isLocalHostname(url.hostname)
  } catch {
    return false
  }
}

export function isPrivateOrMetadataEndpoint(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (isLocalHostname(host)) return true
  if (host === '169.254.169.254') return true
  if (isIPv4Private(host)) return true
  if (isIPv6Private(host)) return true
  return false
}

function normalizeHostname(value: string): string {
  return value.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
}

function isLocalHostname(value: string): boolean {
  const host = normalizeHostname(value)
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1'
}

function isIPv4Private(host: string): boolean {
  if (isIP(host) !== 4) return false
  const parts = host.split('.').map(Number)
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a >= 224 && a <= 239)
}

function isIPv6Private(host: string): boolean {
  if (isIP(host) !== 6) return false
  const lower = host.toLowerCase()
  return lower === '::'
    || lower === '::1'
    || lower.startsWith('fc')
    || lower.startsWith('fd')
    || lower.startsWith('fe8')
    || lower.startsWith('fe9')
    || lower.startsWith('fea')
    || lower.startsWith('feb')
    || lower.startsWith('ff')
}
