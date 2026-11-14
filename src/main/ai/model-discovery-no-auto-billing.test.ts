import { describe, expect, it, vi } from 'vitest'
import { AIConnectionService } from './ai-connection-service'
import { ProviderRegistry } from './provider-registry'
import type { CredentialStore } from '../storage/credential-store'
import type { ConfigStore } from '../storage/config-store'
import type { ModelDiscoveryService } from './model-discovery-service'
import type { AIConnector } from './connectors/ai-connector'

describe('model discovery billing separation', () => {
  it('does not call chat completion probes while loading the model list', async () => {
    const config = {
      getAIConfig: vi.fn(async () => ({ version: 2 as const, connections: [], encryptedSecrets: {}, credentialFingerprints: {} })),
      saveAIConfig: vi.fn()
    } as unknown as ConfigStore
    const credentials = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptAIKey: vi.fn((key: string) => `cipher:${key}`),
      getAIKey: vi.fn()
    } as unknown as CredentialStore
    const connector = { transport: 'openai-chat-completions', ask: vi.fn() } satisfies AIConnector
    const registry = new ProviderRegistry()
    registry.register(connector)
    const modelDiscovery = {
      discover: vi.fn(async () => ({
        success: true,
        source: 'provider-api' as const,
        message: 'Model list loaded.',
        models: [{ id: 'model-a', provider: 'custom' as const, transport: 'openai-chat-completions' as const, recommended: true }]
      }))
    } as unknown as ModelDiscoveryService
    const service = new AIConnectionService(config, credentials, registry, modelDiscovery)

    const result = await service.discoverModels({
      name: 'Custom',
      provider: 'custom',
      transport: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1',
      model: 'model-a',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })

    expect(result.models).toHaveLength(1)
    expect(connector.ask).not.toHaveBeenCalled()
  })
})
