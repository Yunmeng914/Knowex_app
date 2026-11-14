import type { AIAuthScheme, CloudAIProvider, CloudAITransport } from '../../shared/domain/models'
import type { StoredAIConnection } from '../storage/config-store'
import { resolveAIEndpoint } from './endpoint-resolver'
import { CLOUD_PROVIDER_PRESETS } from './provider-presets'

export interface CredentialDestinationFingerprint {
  provider: string
  transport: string
  authScheme: string
  requestOrigin: string
  modelListOrigin?: string
}

export function buildCredentialDestinationFingerprint(connection: StoredAIConnection): CredentialDestinationFingerprint | undefined {
  if (!connection.baseUrl || isLocalTransport(connection.transport)) return undefined
  const transport = connection.transport as CloudAITransport
  const provider = connection.provider as CloudAIProvider
  const operation = transport === 'anthropic-messages'
    ? 'messages'
    : transport === 'openai-responses' ? 'responses' : 'chat-completions'
  const requestEndpoint = resolveAIEndpoint({
    baseUrl: connection.baseUrl,
    endpointMode: connection.endpointMode ?? 'base-url',
    transport,
    operation
  })
  const modelEndpoint = connection.modelListEndpoint
    ? resolveAIEndpoint({
      baseUrl: connection.modelListEndpoint,
      endpointMode: 'base-url',
      transport,
      operation: 'models'
    })
    : undefined
  return {
    provider,
    transport,
    authScheme: authSchemeFor(provider),
    requestOrigin: originOf(requestEndpoint),
    modelListOrigin: modelEndpoint ? originOf(modelEndpoint) : undefined
  }
}

export function fingerprintKey(fingerprint: CredentialDestinationFingerprint | undefined): string | undefined {
  return fingerprint ? JSON.stringify(fingerprint) : undefined
}

export function destinationsMatch(
  left: CredentialDestinationFingerprint | undefined,
  right: CredentialDestinationFingerprint | undefined
): boolean {
  return Boolean(left && right && fingerprintKey(left) === fingerprintKey(right))
}

function authSchemeFor(provider: CloudAIProvider): AIAuthScheme {
  return CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === provider)?.authScheme ?? 'bearer'
}

function originOf(value: string): string {
  const url = new URL(value)
  url.hostname = url.hostname.toLowerCase()
  return url.origin
}

function isLocalTransport(transport: string): boolean {
  return transport === 'codex-cli' || transport === 'claude-code-cli'
}
