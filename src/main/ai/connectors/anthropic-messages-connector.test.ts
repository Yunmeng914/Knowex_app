import { describe, expect, it, vi } from 'vitest'
import type { StoredAIConnection } from '../../storage/config-store'
import { AnthropicMessagesConnector } from './anthropic-messages-connector'

const connection: StoredAIConnection = {
  id: 'anthropic-1',
  name: 'Anthropic',
  provider: 'anthropic',
  transport: 'anthropic-messages',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  model: 'claude-test',
  capabilities: { text: true, vision: true, streaming: false },
  timeoutMs: 90_000,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
}

const request = {
  systemPrompt: 'system',
  evidenceText: 'legacy evidence',
  messages: [{ role: 'user' as const, content: 'old question' }, { role: 'assistant' as const, content: 'old answer' }, { role: 'user' as const, content: 'current evidence' }],
  images: [{ mimeType: 'image/png' as const, dataUrl: 'data:image/png;base64,AAAA' }]
}

describe('AnthropicMessagesConnector', () => {
  it('maps system prompt, history, and images to Anthropic Messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: 'text', text: ' answer ' }] }), { status: 200 }))
    const connector = new AnthropicMessagesConnector(fetchMock as typeof fetch)

    await expect(connector.ask(request, { connection, apiKey: 'test-key-not-real' })).resolves.toEqual({ text: 'answer' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('test-key-not-real')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body.system).toBe('system')
    expect(body.messages[0]).toEqual({ role: 'user', content: 'old question' })
    expect(body.messages[1]).toEqual({ role: 'assistant', content: 'old answer' })
    expect(body.messages[2].content).toEqual([
      { type: 'text', text: 'current evidence' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }
    ])
  })

  it('rejects empty content blocks with a stable empty response code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [] }), { status: 200 }))
    const connector = new AnthropicMessagesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ ...request, images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' })
  })

  it('maps timeout-like aborts to a timeout code', async () => {
    const error = new Error('timeout')
    error.name = 'AbortError'
    const fetchMock = vi.fn().mockRejectedValue(error)
    const connector = new AnthropicMessagesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ ...request, images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('maps authentication errors without exposing keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key test-key-not-real' } }), { status: 401 }))
    const connector = new AnthropicMessagesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ ...request, images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    await expect(connector.ask({ ...request, images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.not.toThrow('test-key-not-real')
  })
})
