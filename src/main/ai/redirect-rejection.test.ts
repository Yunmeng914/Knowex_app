import { describe, expect, it, vi } from 'vitest'
import { OpenAIChatConnector } from './connectors/openai-chat-connector'

describe('credentialed request redirects', () => {
  it('sets redirect error on credentialed fetches', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as unknown as typeof fetch
    const connector = new OpenAIChatConnector(fetchImpl)

    await connector.ask({
      systemPrompt: 'system',
      evidenceText: 'evidence',
      messages: [{ role: 'user', content: 'question' }],
      images: []
    }, {
      apiKey: 'test-key-not-real',
      connection: {
        id: 'conn-1',
        name: 'Custom',
        provider: 'custom',
        transport: 'openai-chat-completions',
        baseUrl: 'https://example.com/v1',
        model: 'model',
        capabilities: { text: true, vision: false, streaming: false },
        timeoutMs: 90_000,
        createdAt: '2026-07-31T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z'
      }
    })

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error' }))
  })
})
