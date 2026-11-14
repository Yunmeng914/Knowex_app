import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SaveAIConnectionInput } from '../../shared/contracts/ipc'
import type { StoredAIConfigV2 } from '../storage/config-store'
import type { CredentialStore } from '../storage/credential-store'
import type { ConfigStore } from '../storage/config-store'
import { AIConnectionService } from './ai-connection-service'
import { ProviderRegistry } from './provider-registry'
import type { AIConnector } from './connectors/ai-connector'
import type { ModelDiscoveryService } from './model-discovery-service'

function makeConfig(initial?: Partial<StoredAIConfigV2>): { ai: StoredAIConfigV2; config: ConfigStore; credentials: CredentialStore } {
  const state = {
    ai: {
      version: 2 as const,
      activeConnectionId: initial?.activeConnectionId,
      connections: initial?.connections ?? [],
      encryptedSecrets: initial?.encryptedSecrets ?? {},
      credentialFingerprints: initial?.credentialFingerprints ?? {}
    }
  }
  const config = {
    getAIConfig: vi.fn(async () => ({
      version: 2 as const,
      activeConnectionId: state.ai.activeConnectionId,
      connections: state.ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities }, lastTest: connection.lastTest ? { ...connection.lastTest } : undefined })),
      encryptedSecrets: { ...state.ai.encryptedSecrets },
      credentialFingerprints: { ...state.ai.credentialFingerprints }
    })),
    saveAIConfig: vi.fn(async (ai: StoredAIConfigV2) => {
      state.ai = {
        version: 2,
        activeConnectionId: ai.activeConnectionId,
        connections: ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities }, lastTest: connection.lastTest ? { ...connection.lastTest } : undefined })),
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
    saveAIKey: vi.fn(async (id: string, key: string) => { state.ai.encryptedSecrets[id] = `cipher:${key}` }),
    deleteAIKey: vi.fn(async (id: string) => { delete state.ai.encryptedSecrets[id] }),
    getAIKey: vi.fn(async (id: string) => {
      if (!state.ai.encryptedSecrets[id]) throw new Error('missing')
      return state.ai.encryptedSecrets[id].replace(/^cipher:/, '')
    })
  } as unknown as CredentialStore
  return { ai: state.ai, config, credentials }
}

const baseInput = {
  name: 'DeepSeek',
  provider: 'deepseek',
  transport: 'openai-chat-completions',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKey: 'test-key-not-real',
  capabilities: { text: true, vision: false, streaming: false }
} satisfies SaveAIConnectionInput

type DeepSeekInput = Omit<typeof baseInput, 'capabilities'> & {
  id?: string
  endpointMode?: 'base-url' | 'full-endpoint'
  clearApiKey?: boolean
  capabilities?: { text: boolean; vision: boolean; streaming: boolean }
}

describe('AIConnectionService', () => {
  it('adds a cloud connection and returns a public DTO without secrets', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)

    const settings = await service.saveConnection(baseInput)

    expect(settings.connections).toHaveLength(1)
    expect(settings.connections[0]).toMatchObject({ name: 'DeepSeek', configured: true, active: true })
    expect(JSON.stringify(settings)).not.toContain('test-key-not-real')
    expect(JSON.stringify(settings)).not.toContain('cipher')
    expect(JSON.stringify(settings)).not.toContain('secretRevision')
  })

  it('edits a connection without clearing the existing key', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)
    await service.saveConnection(baseInput)
    const id = (await service.getSettings()).connections[0].id
    const beforeSecret = (await config.getAIConfig()).encryptedSecrets[id]

    await service.saveConnection({ ...baseInput, id, model: 'deepseek-v4-pro', apiKey: '' })

    const next = await config.getAIConfig()
    expect(next.connections[0].model).toBe('deepseek-v4-pro')
    expect(next.encryptedSecrets[id]).toBe(beforeSecret)
  })

  it('replaces the key only when a new key is supplied', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)
    await service.saveConnection(baseInput)
    const id = (await service.getSettings()).connections[0].id

    await service.saveConnection({ ...baseInput, id, apiKey: 'test-key-not-real-replaced' })

    const next = await config.getAIConfig()
    expect(next.encryptedSecrets[id]).toBe('cipher:test-key-not-real-replaced')
  })

  it('clears a cloud key only through an explicit clear flag', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)
    await service.saveConnection(baseInput)
    const id = (await service.getSettings()).connections[0].id

    const settings = await service.saveConnection({ ...baseInput, id, apiKey: '', clearApiKey: true })

    expect((await config.getAIConfig()).encryptedSecrets[id]).toBeUndefined()
    expect(settings.connections[0]).toMatchObject({ configured: false, hasSecret: false })
  })

  it('requires a fresh key when the credential destination origin changes', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: 'OK' }) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)
    await service.saveConnection(baseInput)
    const id = (await service.getSettings()).connections[0].id

    await expect(service.saveConnection({ ...baseInput, id, provider: 'custom', baseUrl: 'https://relay.example.com/v1', apiKey: '' })).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
    await expect(service.testConnection({ ...baseInput, id, provider: 'custom', baseUrl: 'https://relay.example.com/v1', apiKey: '' })).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
    expect(connector.ask).not.toHaveBeenCalled()
    expect((await config.getAIConfig()).encryptedSecrets[id]).toBe('cipher:test-key-not-real')
  })

  it('invalidates verification state only for configuration changes', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)
    const verification = {
      text: { status: 'verified' as const, model: 'deepseek-v4-flash', checkedAt: '2026-07-30T00:00:00.000Z' },
      image: { status: 'unsupported' as const, model: 'deepseek-v4-flash', checkedAt: '2026-07-30T00:00:00.000Z' }
    }
    await service.saveConnection({ ...baseInput, verification })
    const saved = (await service.getSettings()).connections[0]

    await service.saveConnection({ ...baseInput, id: saved.id, name: 'Renamed', apiKey: '' })
    expect((await service.getSettings()).connections[0].verification?.text.status).toBe('verified')
    await service.setActiveConnection(saved.id)
    expect((await service.getSettings()).connections[0].verification?.text.status).toBe('verified')

    const cases: Array<Partial<DeepSeekInput>> = [
      { model: 'deepseek-v4-pro' },
      { baseUrl: 'https://api.deepseek.com/v2' },
      { endpointMode: 'full-endpoint', baseUrl: 'https://api.deepseek.com/chat/completions' },
      { capabilities: { text: true, vision: true, streaming: false } },
      { apiKey: 'test-key-not-real-rotated' },
      { apiKey: '', clearApiKey: true }
    ]
    for (const change of cases) {
      await service.saveConnection({ ...baseInput, id: saved.id, endpointMode: 'base-url', verification })
      await service.saveConnection({ ...baseInput, id: saved.id, apiKey: '', ...change })
      expect((await service.getSettings()).connections[0].verification).toBeUndefined()
    }
  })

  it('deletes a connection, removes its secret, and falls back from active to the first remaining connection', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)
    await service.saveConnection({ ...baseInput, name: 'A', apiKey: 'test-key-not-real-a' })
    await service.saveConnection({ ...baseInput, name: 'B', apiKey: 'test-key-not-real-b' })
    const [first, second] = (await service.getSettings()).connections
    await service.setActiveConnection(second.id)

    const settings = await service.deleteConnection(second.id)

    expect(settings.activeConnectionId).toBe(first.id)
    const next = await config.getAIConfig()
    expect(next.encryptedSecrets[second.id]).toBeUndefined()
  })

  it('rejects setting an unknown active connection', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)

    await expect(service.setActiveConnection('missing')).rejects.toMatchObject({ code: 'CONNECTION_NOT_FOUND' })
  })

  it('does not silently activate an unconfigured cloud connection', async () => {
    const { config, credentials } = makeConfig({
      connections: [{
        id: 'no-key',
        name: 'Custom',
        provider: 'custom',
        transport: 'openai-chat-completions',
        baseUrl: 'https://example.com/v1',
        model: 'model',
        capabilities: { text: true, vision: false, streaming: false },
        timeoutMs: 90_000,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z'
      }]
    })
    const service = new AIConnectionService(config, credentials)

    await expect(service.setActiveConnection('no-key')).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  it('tests an existing connection without returning keys', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: 'OK' }) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)
    await service.saveConnection(baseInput)
    const saved = (await service.getSettings()).connections[0]

    const result = await service.testConnection({ ...baseInput, id: saved.id, apiKey: '' })

    expect(result).toMatchObject({ success: true, provider: 'deepseek', transport: 'openai-chat-completions', model: 'deepseek-v4-flash' })
    expect(JSON.stringify(result)).not.toContain('test-key-not-real')
    expect((await service.getSettings()).connections[0].lastTest?.success).toBe(true)
  })

  it('rejects missing cloud models without falling back to provider ids', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: 'OK' }) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)

    await expect(service.testConnection({
      name: 'MiniMax',
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })).rejects.toMatchObject({ code: 'MISSING_MODEL' })
    expect(connector.ask).not.toHaveBeenCalled()
  })

  it('tests GLM connections through the OpenAI Chat connector', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: 'OK' }) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)

    const result = await service.testConnection({
      name: 'GLM',
      provider: 'glm',
      transport: 'openai-chat-completions',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      model: 'glm-5.2',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })

    expect(result).toMatchObject({ success: true, provider: 'glm', transport: 'openai-chat-completions', model: 'glm-5.2' })
    expect(connector.ask.mock.calls[0][1].connection.provider).toBe('glm')
  })

  it('discovers models without automatically running paid text verification', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: 'OK' }) } satisfies AIConnector
    registry.register(connector)
    const modelDiscovery = {
      discover: vi.fn(async () => ({
        success: true,
        source: 'provider-api' as const,
        message: 'loaded',
        recommendedModelId: 'MiniMax-M2.7',
        models: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'].map((id) => ({
          id,
          provider: 'minimax' as const,
          transport: 'openai-chat-completions' as const,
          recommended: id === 'MiniMax-M2.7',
          declaredCapabilities: { text: true }
        }))
      }))
    } as unknown as ModelDiscoveryService
    const service = new AIConnectionService(config, credentials, registry, modelDiscovery)

    const result = await service.discoverModels({
      name: 'MiniMax',
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })

    expect(result.recommendedModelId).toBe('MiniMax-M2.7')
    expect(result.verification).toBeUndefined()
    expect(result.models.some((model) => model.textTest)).toBe(false)
    expect(connector.ask).not.toHaveBeenCalled()
  })

  it('does not test discovered candidates when text verification would fail', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockRejectedValue(new Error('model failed')) } satisfies AIConnector
    registry.register(connector)
    const modelDiscovery = {
      discover: vi.fn(async () => ({
        success: true,
        source: 'provider-api' as const,
        message: 'loaded',
        models: ['a', 'b', 'c', 'd'].map((id) => ({
          id,
          provider: 'minimax' as const,
          transport: 'openai-chat-completions' as const,
          recommended: false,
          declaredCapabilities: { text: true }
        }))
      }))
    } as unknown as ModelDiscoveryService
    const service = new AIConnectionService(config, credentials, registry, modelDiscovery)

    await service.discoverModels({
      name: 'MiniMax',
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: false, streaming: false }
    })

    expect(connector.ask).not.toHaveBeenCalled()
  })

  it('verifies image capability with the built-in black-dot asset', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockResolvedValue({ text: '{"black_dots":3,"left_side_dots":2,"center_dot":1}' }) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)

    const result = await service.verifyImageCapability({
      name: 'MiniMax',
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: true, streaming: false }
    })

    expect(result.image.status).toBe('verified')
    const request = connector.ask.mock.calls[0][0]
    expect(request.images[0].dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(request.images[0].dataUrl).not.toContain('C:\\')
  })

  it('keeps image verification separate from text verification failures', async () => {
    const { config, credentials } = makeConfig()
    const registry = new ProviderRegistry()
    const connector = { transport: 'openai-chat-completions', ask: vi.fn().mockRejectedValue(new Error('image failed')) } satisfies AIConnector
    registry.register(connector)
    const service = new AIConnectionService(config, credentials, registry)

    const result = await service.verifyImageCapability({
      name: 'MiniMax',
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key-not-real',
      capabilities: { text: true, vision: true, streaming: false }
    })

    expect(result.text.status).toBe('not-tested')
    expect(result.image.status).toBe('failed')
  })

  it('saves and activates CLI connections without API keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'knowex-cli-connection-'))
    try {
      const executablePath = join(dir, 'codex.exe')
      await writeFile(executablePath, '', 'utf8')
      const { config, credentials } = makeConfig()
      const service = new AIConnectionService(config, credentials)

      const settings = await service.saveConnection({
        name: 'Codex',
        provider: 'codex',
        transport: 'codex-cli',
        executablePath,
        capabilities: { text: true, vision: false, streaming: false }
      })

      expect(settings.connections[0]).toMatchObject({ provider: 'codex', transport: 'codex-cli', configured: true, active: true })
      expect(credentials.saveAIKey).not.toHaveBeenCalled()
      expect((await config.getAIConfig()).encryptedSecrets[settings.connections[0].id]).toBeUndefined()
      await expect(service.setActiveConnection(settings.connections[0].id)).resolves.toMatchObject({ activeConnectionId: settings.connections[0].id })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid CLI executable paths', async () => {
    const { config, credentials } = makeConfig()
    const service = new AIConnectionService(config, credentials)

    await expect(service.saveConnection({
      name: 'Claude',
      provider: 'claude-code',
      transport: 'claude-code-cli',
      executablePath: 'C:\\Tools\\claude.exe --bad',
      capabilities: { text: true, vision: false, streaming: false }
    })).rejects.toMatchObject({ code: 'LOCAL_TOOL_INVALID_PATH' })
  })
})
