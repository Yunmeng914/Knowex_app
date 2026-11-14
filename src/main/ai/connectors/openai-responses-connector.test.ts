import { describe, expect, it, vi } from 'vitest'
import type { StoredAIConnection } from '../../storage/config-store'
import { OpenAIResponsesConnector } from './openai-responses-connector'

const connection: StoredAIConnection = {
  id: 'conn-1',
  name: 'OpenAI',
  provider: 'openai',
  transport: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1/responses',
  model: 'gpt-test',
  capabilities: { text: true, vision: true, streaming: false },
  timeoutMs: 90_000,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z'
}

describe('OpenAIResponsesConnector', () => {
  it('maps a single-turn text request to the existing Responses API body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: ' answer ' }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({
      systemPrompt: 'system',
      evidenceText: 'evidence',
      messages: [{ role: 'user', content: 'evidence' }],
      images: []
    }, { connection, apiKey: 'test-key-not-real' })).resolves.toEqual({ text: 'answer' })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      model: 'gpt-test',
      store: false,
      instructions: 'system'
    })
    expect(body.input).toEqual([{
      role: 'user',
      content: [{ type: 'input_text', text: 'evidence' }]
    }])
  })

  it('maps user and assistant history before the current user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'answer' }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await connector.ask({
      systemPrompt: 'system',
      evidenceText: 'Earlier conversation should not be sent as the current message',
      messages: [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'current evidence' }
      ],
      images: []
    }, { connection, apiKey: 'test-key-not-real' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'old question' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'old answer' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'current evidence' }] }
    ])
  })

  it('preserves system and developer history order while keeping instructions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'answer' }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await connector.ask({
      systemPrompt: 'primary system prompt',
      evidenceText: 'current',
      messages: [
        { role: 'system', content: 'older system note' },
        { role: 'developer', content: 'developer instruction' },
        { role: 'user', content: 'current' }
      ],
      images: []
    } as Parameters<typeof connector.ask>[0], { connection, apiKey: 'test-key-not-real' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.instructions).toBe('primary system prompt')
    expect(body.input).toEqual([
      { role: 'system', content: [{ type: 'input_text', text: 'older system note' }] },
      { role: 'developer', content: [{ type: 'input_text', text: 'developer instruction' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'current' }] }
    ])
  })

  it('adds current images only to the current user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'answer' }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await connector.ask({
      systemPrompt: 'system',
      evidenceText: 'evidence with duplicate current question',
      messages: [{ role: 'user', content: 'current question once' }],
      images: [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }]
    }, { connection, apiKey: 'test-key-not-real' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-key-not-real')
    expect(init.signal).toBeDefined()
    const body = JSON.parse(init.body)
    expect(body.input[0].content).toEqual([
      { type: 'input_text', text: 'current question once' },
      { type: 'input_image', image_url: 'data:image/png;base64,AAAA', detail: 'high' }
    ])
    expect(JSON.stringify(body.input)).not.toContain('evidence with duplicate current question')
  })

  it('falls back to evidence text when history is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'answer' }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await connector.ask({ systemPrompt: 'system', evidenceText: 'evidence fallback', messages: [], images: [] }, { connection, apiKey: 'test-key-not-real' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.input).toEqual([{
      role: 'user',
      content: [{ type: 'input_text', text: 'evidence fallback' }]
    }])
  })

  it('parses nested Responses output text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: 'nested answer' }] }]
    }), { status: 200 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ systemPrompt: 'system', evidenceText: 'evidence', messages: [{ role: 'user', content: 'evidence' }], images: [] }, { connection, apiKey: 'test-key-not-real' })).resolves.toEqual({ text: 'nested answer' })
  })

  it('maps provider errors without exposing the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad model' } }), { status: 404 }))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ systemPrompt: 'system', evidenceText: 'evidence', messages: [{ role: 'user', content: 'evidence' }], images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' })
    await expect(connector.ask({ systemPrompt: 'system', evidenceText: 'evidence', messages: [{ role: 'user', content: 'evidence' }], images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.not.toThrow('test-key-not-real')
  })

  it('keeps the existing timeout/network error wording', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'))
    const connector = new OpenAIResponsesConnector(fetchMock as typeof fetch)

    await expect(connector.ask({ systemPrompt: 'system', evidenceText: 'evidence', messages: [{ role: 'user', content: 'evidence' }], images: [] }, { connection, apiKey: 'test-key-not-real' })).rejects.toThrow('could not reach the configured endpoint')
  })
})
