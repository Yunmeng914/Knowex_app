import { describe, expect, it, vi } from 'vitest'
import type { CredentialStore } from '../storage/credential-store'
import type { AIConnectionService } from './ai-connection-service'
import type { PromptBuilder } from './prompt-builder'
import { ProviderRegistry } from './provider-registry'
import type { AIConnector } from './connectors/ai-connector'
import type { AIConnectorContext, AIRequest, AIResponse } from './ai-types'
import { AIService } from './ai-service'

const input = { regionId: 'region-1', question: 'Q', history: [], imageDataUrls: [] }
const oneByOnePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function makeService(options: { images?: boolean; vision?: boolean; key?: string; secondConnector?: boolean; local?: boolean; slow?: boolean } = {}) {
  const connection = {
    id: 'active-1',
    name: options.local ? 'Claude' : 'DeepSeek',
    provider: options.local ? 'claude-code' as const : 'deepseek' as const,
    transport: options.local ? 'claude-code-cli' as const : 'openai-chat-completions' as const,
    baseUrl: 'https://api.example.com/v1/chat/completions',
    executablePath: options.local ? 'C:\\Tools\\claude.exe' : undefined,
    model: 'chat-model',
    capabilities: { text: true, vision: options.vision ?? true, streaming: false },
    timeoutMs: 90_000,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z'
  }
  const connections = { getActiveConnection: vi.fn().mockResolvedValue(connection) } as unknown as AIConnectionService
  const credentials = { getAIKey: vi.fn(async () => {
    if (!options.key) throw new Error('missing')
    return options.key
  }) } as unknown as CredentialStore
  const promptBuilder = { build: vi.fn().mockResolvedValue({
    systemPrompt: 'system',
    evidenceText: 'evidence',
    messages: [{ role: 'user', content: 'evidence' }],
    images: options.images ? [{ mimeType: 'image/png', dataUrl: oneByOnePng }] : []
  }) } as unknown as PromptBuilder
  const registry = new ProviderRegistry()
  const ask = options.slow
    ? vi.fn((_request: AIRequest, context: AIConnectorContext): Promise<AIResponse> => new Promise((resolve, reject) => {
        if (context.signal?.aborted) {
          reject(Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' }))
          return
        }
        context.signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' })))
        setTimeout(() => resolve({ text: 'slow answer' }), 10_000)
      }))
    : vi.fn(async (): Promise<AIResponse> => ({ text: 'answer' }))
  const activeConnector = {
    transport: connection.transport,
    ask
  } satisfies AIConnector
  registry.register(activeConnector)
  if (options.secondConnector) registry.register({ transport: 'openai-responses', ask: vi.fn().mockResolvedValue({ text: 'other' }) } satisfies AIConnector)
  return { service: new AIService(connections, credentials, promptBuilder, registry), activeConnector, connections, credentials }
}

describe('AIService', () => {
  it('uses the active connection and selected connector', async () => {
    const { service, activeConnector } = makeService({ key: 'test-key-not-real' })

    await expect(service.ask(input)).resolves.toBe('answer')

    expect(activeConnector.ask).toHaveBeenCalledOnce()
  })

  it('reports a missing active connection', async () => {
    const { service, connections } = makeService({ key: 'test-key-not-real' })
    vi.mocked(connections.getActiveConnection).mockRejectedValueOnce(new Error('none'))

    await expect(service.ask(input)).rejects.toThrow('none')
  })

  it('maps missing credentials to a stable error', async () => {
    const { service } = makeService()

    await expect(service.ask(input)).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  it('blocks image requests for text-only connections before calling a provider', async () => {
    const { service, activeConnector } = makeService({ key: 'test-key-not-real', images: true, vision: false, secondConnector: true })

    await expect(service.ask(input)).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
    expect(activeConnector.ask).not.toHaveBeenCalled()
  })

  it('uses local CLI connections without reading cloud credentials', async () => {
    const { service, activeConnector, credentials } = makeService({ local: true })

    await expect(service.ask(input)).resolves.toBe('answer')

    expect(activeConnector.ask).toHaveBeenCalledOnce()
    expect(credentials.getAIKey).not.toHaveBeenCalled()
  })

  it('cancels only the matching request id', async () => {
    const { service } = makeService({ key: 'test-key-not-real', slow: true })
    const promise = service.ask({ ...input, requestId: 'request-1' })

    expect(service.cancel('missing')).toEqual({ cancelled: false })
    expect(service.cancel('request-1')).toEqual({ cancelled: true })
    await expect(promise).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
  })
})
