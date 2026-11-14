/** Verifies Exa research-query composition, wire filters, response safety, and safe failures. */
import { describe, expect, it, vi } from 'vitest'
import { buildExaProviderQuery, ExaClient, mapContentResponse, mapSearchResponse } from './exa-client'

describe('ExaClient', () => {
  it('uses research-paper search, local context, and provider-supported filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestId: 'req-1',
      results: [{ id: 'paper-1', title: 'Paper', url: 'https://arxiv.org/abs/1234', highlights: ['Relevant evidence'] }]
    }), { status: 200 }))
    const client = new ExaClient(fetchMock as typeof fetch)

    const result = await client.search({
      query: 'Find replication studies',
      mode: 'academic',
      numResults: 8,
      context: 'The paper claims its metric correlates with human judgment.',
      history: ['Find the original metric paper'],
      language: 'en',
      includeDomains: ['arxiv.org'],
      excludeDomains: ['example.com'],
      startPublishedDate: '2020-01-01T00:00:00.000Z',
      endPublishedDate: '2025-12-31T23:59:59.999Z'
    }, 'exa-test-key')

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(url).toBe('https://api.exa.ai/search')
    expect(init.redirect).toBe('error')
    expect(init.headers['x-api-key']).toBe('exa-test-key')
    expect(body).toMatchObject({
      category: 'research paper',
      type: 'auto',
      numResults: 8,
      includeDomains: ['arxiv.org'],
      excludeDomains: ['example.com'],
      startPublishedDate: '2020-01-01T00:00:00.000Z',
      endPublishedDate: '2025-12-31T23:59:59.999Z'
    })
    expect(body.query).toContain('Find replication studies')
    expect(body.query).toContain('Find the original metric paper')
    expect(body.query).toContain('The paper claims')
    expect(body.query).toContain('Prefer sources written primarily in English')
    expect(body.contents.highlights).toEqual({ query: body.query, maxCharacters: 1600 })
    expect(result.results[0]).toMatchObject({ title: 'Paper', highlights: ['Relevant evidence'] })
  })

  it('omits the research-paper category only when full-web mode is explicit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    const client = new ExaClient(fetchMock as typeof fetch)

    await client.search({ query: 'official release notes', mode: 'web', numResults: 5 }, 'exa-test-key')

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('category')
  })

  it('keeps only the latest research instructions in a bounded provider query', () => {
    const query = buildExaProviderQuery({
      query: 'Current', mode: 'academic', numResults: 8,
      history: ['one', 'two', 'three', 'four', 'five']
    })
    expect(query).not.toContain('1. one')
    expect(query).toContain('1. two')
    expect(query).toContain('4. five')
  })

  it('maps readable contents and rejects missing text', () => {
    expect(mapContentResponse({ results: [{ id: 'https://example.com/paper', url: 'https://example.com/paper', title: 'Paper', text: ' full text ' }] }, 'https://example.com/paper')).toMatchObject({
      source: { title: 'Paper', url: 'https://example.com/paper' },
      text: 'full text'
    })
    expect(() => mapContentResponse({ results: [{ url: 'https://example.com/paper' }] }, 'https://example.com/paper')).toThrow('readable text')
    expect(mapContentResponse({ results: [{ id: 'opaque-exa-id', title: 'Paper', text: 'content' }] }, 'https://example.com/paper').source).toMatchObject({
      id: 'opaque-exa-id',
      url: 'https://example.com/paper'
    })
  })

  it('drops unsafe source URLs from provider responses', () => {
    const result = mapSearchResponse({ results: [
      { title: 'Safe', url: 'https://example.com/paper' },
      { title: 'Unsafe', url: 'file:///etc/passwd' },
      { title: 'Credential URL', url: 'https://user:password@example.com/private' }
    ] }, { query: 'paper', mode: 'academic', numResults: 8 })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].title).toBe('Safe')
  })

  it('maps authentication failures without exposing the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid exa-test-key' } }), { status: 401 }))
    const client = new ExaClient(fetchMock as typeof fetch)
    const request = client.search({ query: 'research paper', mode: 'academic', numResults: 1 }, 'exa-test-key')
    await expect(request).rejects.toThrow('rejected the API key')
    await expect(request).rejects.not.toThrow('exa-test-key')
  })
})
