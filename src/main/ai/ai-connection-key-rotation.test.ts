import { describe, expect, it, vi } from 'vitest'
import type { StoredAIConfigV2 } from '../storage/config-store'
import type { ConfigStore } from '../storage/config-store'
import type { CredentialStore } from '../storage/credential-store'
import { AIConnectionService } from './ai-connection-service'

describe('AI connection key rotation', () => {
  it('does not allow a saved key to follow a changed request origin', async () => {
    const state: { ai: StoredAIConfigV2 } = {
      ai: { version: 2, connections: [], encryptedSecrets: {}, credentialFingerprints: {} }
    }
    const config = {
      getAIConfig: vi.fn(async () => ({
        ...state.ai,
        connections: state.ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities } })),
        encryptedSecrets: { ...state.ai.encryptedSecrets },
        credentialFingerprints: { ...state.ai.credentialFingerprints }
      })),
      saveAIConfig: vi.fn(async (ai: StoredAIConfigV2) => {
        state.ai = {
          ...ai,
          connections: ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities } })),
          encryptedSecrets: { ...ai.encryptedSecrets },
          credentialFingerprints: { ...ai.credentialFingerprints }
        }
        return state.ai
      })
    } as unknown as ConfigStore
    const credentials = {
      isEncryptionAvailable: vi.fn(() => true),
      hasAIKey: vi.fn(async (id: string) => Boolean(state.ai.encryptedSecrets[id])),
      encryptAIKey: vi.fn((key: string) => `cipher:${key}`),
      getAIKey: vi.fn(async (id: string) => state.ai.encryptedSecrets[id].replace(/^cipher:/, ''))
    } as unknown as CredentialStore
    const service = new AIConnectionService(config, credentials)

    const settings = await service.saveConnection({
      name: 'Custom',
      provider: 'custom',
      transport: 'openai-chat-completions',
      baseUrl: 'https://relay-a.example.com/v1',
      model: 'model-a',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })

    await expect(service.saveConnection({
      id: settings.connections[0].id,
      name: 'Custom',
      provider: 'custom',
      transport: 'openai-chat-completions',
      baseUrl: 'https://relay-b.example.com/v1',
      model: 'model-a',
      apiKey: '',
      capabilities: { text: true, vision: false, streaming: false }
    })).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
    expect(credentials.getAIKey).not.toHaveBeenCalled()
  })
})
