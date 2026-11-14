import { describe, expect, it, vi } from 'vitest'
import type { StoredAIConnection } from '../../storage/config-store'
import { buildChatCompletionsEndpoint, OpenAIChatConnector } from './openai-chat-connector'

const connection: StoredAIConnection = {
  id: 'chat-1',
  name: 'Custom',
  provider: 'custom',
  transport: 'openai-chat-completions',
  baseUrl: 'https://api.example.com/v1/chat/completions',
  model: 'chat-model',
  capabilities: { text: true, vision: true, streaming: false },
  timeoutMs: 90_000,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
}

const request = {
  systemPrompt: 'system',
  evidenceText: 'legacy evidence',
  messages: [{ role: 'user' as const, content: 'old question' }, { role: 'assistant' as const, content: 'old answer' }, { role: 'user' as const, content: 'current evidence' }],
  images: []
}

describe('OpenAIChatConnector', () => {
  it('builds chat endpoints from API root URLs while keeping legacy full endpoints compatible', () => {
    expect(buildChatCompletionsEndpoint('https://api.minimaxi.com/v1')).toBe('https://api.minimaxi.com/v1/chat/completions')
    expect(buildChatCompletionsEndpoint('https://open.bigmodel.cn/api/paas/v4/')).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    expect(buildChatCompletionsEndpoint('https://api.deepseek.com', 'base-url', 'deepseek')).toBe('https://api.deepseek.com/chat/completions')
    expect(buildChatCompletionsEndpoint('https://api.minimax.io/v1/chat/completions')).toBe('https://api.minimax.io/v1/chat/completions')
  })

  it('maps text requests to Chat Completions messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: ' answer ' } }] }), { status: 200 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).resolves.toEqual({ text: 'answer' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('chat-model')
    expect(body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'current evidence' }
    ])
  })

  it('maps images to Chat Completions image_url blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await connector.ask({ ...request, images: [{ mimeType: 'image/png' as const, dataUrl: 'data:image/png;base64,AAAA' }] }, { connection, apiKey: 'test-key-not-real' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages.at(-1).content).toEqual([
      { type: 'text', text: 'current evidence' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA', detail: 'high' } }
    ])
  })

  it('rejects empty responses with a stable empty response code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' })
  })

  it('maps network failures without exposing credentials', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom test-key-not-real'))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).rejects.toThrow('could not reach')
    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).rejects.not.toThrow('test-key-not-real')
  })

  it('maps authentication failures to a stable code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
  })

  it('maps MiniMax unknown model errors to actionable model guidance without exposing keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "unknown model 'minimax'" } }), { status: 400 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection: { ...connection, provider: 'minimax', baseUrl: 'https://api.minimaxi.com/v1', model: 'minimax' }, apiKey: 'test-key-not-real' })).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
      message: expect.stringContaining('Detect available models')
    })
  })

  it('maps MiniMax authentication failures to region and quota-plan guidance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'forbidden' } }), { status: 403 }))
    const connector = new OpenAIChatConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection: { ...connection, provider: 'minimax', baseUrl: 'https://api.minimax.io/v1', model: 'MiniMax-M3' }, apiKey: 'test-key-not-real' })).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
      message: expect.stringContaining('quota plan')
    })
  })
})
