import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { VerifyAIImageCapabilityInput } from '../../shared/contracts/ipc'
import type { StoredAIConfigV2 } from '../storage/config-store'
import type { ConfigStore } from '../storage/config-store'
import type { CredentialStore } from '../storage/credential-store'
import type { PromptBuilder } from './prompt-builder'
import { AIConnectionService } from './ai-connection-service'
import { AIService } from './ai-service'
import type { AIRequest } from './ai-types'
import { AnthropicMessagesConnector } from './connectors/anthropic-messages-connector'
import { OpenAIChatConnector } from './connectors/openai-chat-connector'
import { OpenAIResponsesConnector } from './connectors/openai-responses-connector'
import { ModelDiscoveryService } from './model-discovery-service'
import { ProviderRegistry } from './provider-registry'

const testKey = 'test-key-not-real'
type SmokeConnectionInput = VerifyAIImageCapabilityInput & { apiKey: string }

describe('AI runtime smoke with local mock API', () => {
  it.each([
    ['OpenAI Responses', (url: string): SmokeConnectionInput => ({ name: 'OpenAI', provider: 'openai', transport: 'openai-responses', baseUrl: `${url}/v1`, model: 'response-model', apiKey: testKey, capabilities: { text: true, vision: true, streaming: false } })],
    ['OpenAI Chat', (url: string): SmokeConnectionInput => ({ name: 'Chat', provider: 'deepseek', transport: 'openai-chat-completions', baseUrl: `${url}/v1`, model: 'chat-model', apiKey: testKey, capabilities: { text: true, vision: true, streaming: false } })],
    ['Anthropic Messages', (url: string): SmokeConnectionInput => ({ name: 'Anthropic', provider: 'anthropic', transport: 'anthropic-messages', baseUrl: `${url}/v1`, model: 'claude-model', apiKey: testKey, capabilities: { text: true, vision: true, streaming: false } })],
    ['Custom Base URL', (url: string): SmokeConnectionInput => ({ name: 'Custom Base', provider: 'custom', transport: 'openai-chat-completions', baseUrl: `${url}/custom/v1`, endpointMode: 'base-url', modelDiscovery: 'openai-models', model: 'custom-chat', apiKey: testKey, capabilities: { text: true, vision: true, streaming: false } })],
    ['Custom Full Endpoint', (url: string): SmokeConnectionInput => ({ name: 'Custom Full', provider: 'custom', transport: 'openai-chat-completions', baseUrl: `${url}/explicit/chat/completions`, endpointMode: 'full-endpoint', modelDiscovery: 'custom-models-endpoint', modelListEndpoint: `${url}/explicit/models`, model: 'custom-full-chat', apiKey: testKey, capabilities: { text: true, vision: true, streaming: false } })]
  ])('runs save, model discovery, capability tests, activation, ask, reload, and clear key for %s', async (_name, buildInput) => {
    const server = await mockAIHTTPServer()
    try {
      const state = makeState()
      const registry = new ProviderRegistry()
      registry.register(new OpenAIResponsesConnector())
      registry.register(new OpenAIChatConnector())
      registry.register(new AnthropicMessagesConnector())
      const connections = new AIConnectionService(state.config, state.credentials, registry, new ModelDiscoveryService())
      const ai = new AIService(connections, state.credentials, makePromptBuilder(), registry)
      const input = buildInput(server.url)

      let settings = await connections.saveConnection(input)
      let saved = settings.connections[0]
      expect(saved.hasSecret).toBe(true)

      const models = await connections.discoverModels({ ...input, id: saved.id, apiKey: '' })
      expect(models.models.length).toBeGreaterThan(0)
      await expect(connections.verifyTextCapability({ ...input, id: saved.id, apiKey: '', model: input.model! })).resolves.toMatchObject({ text: { status: 'verified' } })
      await expect(connections.verifyImageCapability({ ...input, id: saved.id, apiKey: '', model: input.model! })).resolves.toMatchObject({ image: { status: 'verified' } })

      settings = await connections.setActiveConnection(saved.id)
      expect(settings.activeConnectionId).toBe(saved.id)
      await expect(ai.ask({ regionId: 'region-1', question: 'Q', history: [] })).resolves.toBe('ASK_OK')

      const reloaded = new AIConnectionService(state.config, state.credentials, registry, new ModelDiscoveryService())
      saved = (await reloaded.getSettings()).connections[0]
      expect(saved.hasSecret).toBe(true)

      settings = await reloaded.saveConnection({ ...input, id: saved.id, apiKey: '', clearApiKey: true })
      expect(settings.connections[0].hasSecret).toBe(false)
      await expect(reloaded.setActiveConnection(saved.id)).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
    } finally {
      await server.close()
    }
  })
})

function makePromptBuilder(): PromptBuilder {
  return {
    build: vi.fn(async (): Promise<AIRequest> => ({
      systemPrompt: 'system',
      evidenceText: 'Q',
      messages: [{ role: 'user', content: 'Q' }],
      images: []
    }))
  } as unknown as PromptBuilder
}

function makeState(): { config: ConfigStore; credentials: CredentialStore } {
  const state: { ai: StoredAIConfigV2 } = { ai: { version: 2, connections: [], encryptedSecrets: {}, credentialFingerprints: {} } }
  const config = {
    getAIConfig: vi.fn(async () => ({
      version: 2 as const,
      activeConnectionId: state.ai.activeConnectionId,
      connections: state.ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities }, verification: connection.verification ? { text: { ...connection.verification.text }, image: { ...connection.verification.image } } : undefined })),
      encryptedSecrets: { ...state.ai.encryptedSecrets },
      credentialFingerprints: { ...state.ai.credentialFingerprints }
    })),
    saveAIConfig: vi.fn(async (ai: StoredAIConfigV2) => {
      state.ai = {
        version: 2,
        activeConnectionId: ai.activeConnectionId,
        connections: ai.connections.map((connection) => ({ ...connection, capabilities: { ...connection.capabilities }, verification: connection.verification ? { text: { ...connection.verification.text }, image: { ...connection.verification.image } } : undefined })),
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
      const value = state.ai.encryptedSecrets[id]
      if (!value) throw new Error('missing')
      return value.replace(/^cipher:/, '')
    })
  } as unknown as CredentialStore
  return { config, credentials }
}

async function mockAIHTTPServer(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((request, response) => {
    if (!request.headers.authorization && !request.headers['x-api-key']) return json(response, 401, { error: { message: 'missing key' } })
    if (request.method === 'GET' && request.url?.endsWith('/models')) return json(response, 200, { data: [{ id: modelIdForPath(request.url) }] })
    if (request.method !== 'POST') return json(response, 404, { error: { message: 'not found' } })
    collectJson(request).then((body) => {
      const prompt = JSON.stringify(body)
      if (prompt.includes('black_dots') && prompt.includes('left_side_dots') && prompt.includes('center_dot')) return respondText(request.url ?? '', response, '{"black_dots":3,"left_side_dots":2,"center_dot":1}')
      return respondText(request.url ?? '', response, 'ASK_OK')
    }).catch((error: unknown) => json(response, 500, { error: { message: error instanceof Error ? error.message : 'server error' } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a TCP port.')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function modelIdForPath(path: string): string {
  if (path.includes('/explicit/')) return 'custom-full-chat'
  if (path.includes('/custom/')) return 'custom-chat'
  return path.includes('/v1/models') ? 'chat-model' : 'model'
}

function respondText(path: string, response: ServerResponse, text: string): void {
  if (path.endsWith('/responses')) return json(response, 200, { output_text: text })
  if (path.endsWith('/messages')) return json(response, 200, { content: [{ type: 'text', text }] })
  json(response, 200, { choices: [{ message: { content: text } }] })
}

function collectJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('error', reject)
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch (error) { reject(error) }
    })
  })
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
