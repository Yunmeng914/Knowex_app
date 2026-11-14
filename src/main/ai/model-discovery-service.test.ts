import { describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { buildModelsEndpoint, ModelDiscoveryService, parseModels, recommendModel } from './model-discovery-service'

describe('ModelDiscoveryService', () => {
  it('builds model list endpoints from chat and responses endpoints', () => {
    expect(buildModelsEndpoint('minimax', 'openai-chat-completions', 'https://api.minimax.io/v1/chat/completions')).toBe('https://api.minimax.io/v1/models')
    expect(buildModelsEndpoint('minimax', 'openai-chat-completions', 'https://api.minimaxi.com/v1')).toBe('https://api.minimaxi.com/v1/models')
    expect(buildModelsEndpoint('minimax', 'openai-chat-completions', 'https://api.minimax.io/v1')).toBe('https://api.minimax.io/v1/models')
    expect(buildModelsEndpoint('deepseek', 'openai-chat-completions', 'https://api.deepseek.com')).toBe('https://api.deepseek.com/models')
    expect(buildModelsEndpoint('glm', 'openai-chat-completions', 'https://open.bigmodel.cn/api/paas/v4/')).toBe('https://open.bigmodel.cn/api/paas/v4/models')
    expect(buildModelsEndpoint('openai', 'openai-responses', 'https://api.openai.com/v1/responses')).toBe('https://api.openai.com/v1/models')
    expect(buildModelsEndpoint('custom', 'openai-chat-completions', 'https://proxy.example.com/prefix/v1', 'base-url', 'openai-models')).toBe('https://proxy.example.com/prefix/v1/models')
    expect(() => buildModelsEndpoint('custom', 'openai-chat-completions', 'https://proxy.example.com/prefix/v1/chat/completions', 'full-endpoint', 'openai-models')).toThrow()
    expect(buildModelsEndpoint('custom', 'openai-chat-completions', 'https://proxy.example.com/prefix/v1/chat/completions', 'full-endpoint', 'custom-models-endpoint', 'https://proxy.example.com/prefix/v1/models?trace=1')).toBe('https://proxy.example.com/prefix/v1/models')
    expect(() => buildModelsEndpoint('custom', 'openai-chat-completions', 'https://proxy.example.com/prefix/v1/chat/completions', 'full-endpoint', 'custom-models-endpoint', 'https://proxy.example.com/prefix/v1/models#frag')).toThrow()
    expect(() => buildModelsEndpoint('custom', 'openai-chat-completions', 'https://example.com/v1', 'base-url', 'custom-models-endpoint', 'https://example.com/v1/models?api_key=secret')).toThrow()
  })

  it('parses OpenAI-compatible model lists and filters obvious non-chat models', () => {
    const models = parseModels({
      object: 'list',
      data: [
        { id: 'MiniMax-M2.7', object: 'model' },
        { id: 'text-embedding-3-large', object: 'model' },
        { id: 'image-01', object: 'model' }
      ]
    }, 'minimax', 'openai-chat-completions')

    expect(models.map((model) => model.id)).toEqual(['MiniMax-M2.7'])
  })

  it('parses Anthropic-style model lists', () => {
    const models = parseModels({
      data: [
        { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }
      ]
    }, 'anthropic', 'anthropic-messages')

    expect(models[0]).toMatchObject({ id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5' })
  })

  it('prefers current model, then provider hints, then first candidate', () => {
    const models = parseModels({ data: [{ id: 'MiniMax-M2.5' }, { id: 'MiniMax-M2.7' }] }, 'minimax', 'openai-chat-completions')

    expect(recommendModel(models, 'minimax', 'MiniMax-M2.5')).toBe('MiniMax-M2.5')
    expect(recommendModel(models, 'minimax')).toBe('MiniMax-M2.7')
  })

  it('recommends GLM text models without marking text models as vision-capable', () => {
    const models = parseModels({ data: [{ id: 'glm-5.2' }, { id: 'glm-4v-plus' }, { id: 'glm-5' }] }, 'glm', 'openai-chat-completions')

    expect(recommendModel(models, 'glm')).toBe('glm-5.2')
    expect(models.find((model) => model.id === 'glm-5.2')?.declaredCapabilities?.image).toBeUndefined()
    expect(models.find((model) => model.id === 'glm-4v-plus')?.declaredCapabilities?.image).toBe(true)
  })

  it('recommends current DeepSeek v4 models instead of deprecated aliases', () => {
    const models = parseModels({
      data: [
        { id: 'deepseek-v4-pro' },
        { id: 'deepseek-v4-flash' }
      ]
    }, 'deepseek', 'openai-chat-completions')

    expect(recommendModel(models, 'deepseek')).toBe('deepseek-v4-flash')
  })

  it('returns MiniMax-specific guidance for region, key, and empty model list failures', async () => {
    const authFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'forbidden' } }), { status: 403 }))
    await expect(new ModelDiscoveryService(authFetch).discover({
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'test-key-not-real'
    })).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED', message: expect.stringContaining('quota plan') })

    const emptyFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    const empty = await new ModelDiscoveryService(emptyFetch).discover({
      provider: 'minimax',
      transport: 'openai-chat-completions',
      baseUrl: 'https://api.minimax.io/v1',
      apiKey: 'test-key-not-real'
    })
    expect(empty.message).toContain('quota plan')
  })

  it('returns manual fallback when custom model discovery is unsupported', async () => {
    const fetchImpl = vi.fn()
    const service = new ModelDiscoveryService(fetchImpl)

    await expect(service.discover({
      provider: 'custom',
      transport: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1/chat/completions',
      endpointMode: 'full-endpoint',
      apiKey: 'test-key-not-real'
    })).resolves.toMatchObject({ success: false, source: 'manual', models: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns manual fallback when compatible model list is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }))
    const service = new ModelDiscoveryService(fetchImpl)

    await expect(service.discover({
      provider: 'custom',
      transport: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1/chat/completions',
      modelDiscovery: 'openai-models',
      apiKey: 'test-key-not-real'
    })).rejects.toMatchObject({ code: 'MODEL_LIST_UNAVAILABLE' })
  })

  it('uses a local mock server for model list success, empty lists, and provider errors', async () => {
    const server = await mockServer((request, response) => {
      expect(request.url).toBe('/v1/models')
      expect(request.headers.authorization).toBe('Bearer test-key-not-real')
      if (request.headers['x-case'] === 'empty') return json(response, 200, { data: [] })
      if (request.headers['x-case'] === '401') return json(response, 401, { error: { message: 'bad key' } })
      if (request.headers['x-case'] === '404') return json(response, 404, { error: { message: 'missing' } })
      if (request.headers['x-case'] === '429') return json(response, 429, { error: { message: 'rate' } })
      if (request.headers['x-case'] === '500') return json(response, 500, { error: { message: 'server' } })
      return json(response, 200, { data: [{ id: 'chat-a' }, { id: 'text-embedding-3-large' }] })
    })
    try {
      const fetchImpl: typeof fetch = (url, init) => fetch(url, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), 'x-case': currentCase }
      })
      const service = new ModelDiscoveryService(fetchImpl)
      let currentCase = ''
      const input = { provider: 'custom' as const, transport: 'openai-chat-completions' as const, baseUrl: `${server.url}/v1`, modelDiscovery: 'openai-models' as const, apiKey: 'test-key-not-real' }

      await expect(service.discover(input)).resolves.toMatchObject({ success: true, recommendedModelId: 'chat-a' })
      currentCase = 'empty'
      await expect(service.discover(input)).resolves.toMatchObject({ success: false, models: [] })
      currentCase = '401'
      await expect(service.discover(input)).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
      currentCase = '404'
      await expect(service.discover(input)).rejects.toMatchObject({ code: 'MODEL_LIST_UNAVAILABLE' })
      currentCase = '429'
      await expect(service.discover(input)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
      currentCase = '500'
      await expect(service.discover(input)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    } finally {
      await server.close()
    }
  })

  it('uses a local mock server for non-JSON, invalid shape, and abort cases', async () => {
    const server = await mockServer((request, response) => {
      if (request.headers['x-case'] === 'text') {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        response.end('not json')
        return
      }
      if (request.headers['x-case'] === 'slow') return setTimeout(() => json(response, 200, { data: [{ id: 'late' }] }), 500)
      json(response, 200, { object: 'list' })
    })
    try {
      let currentCase = 'shape'
      const fetchImpl: typeof fetch = (url, init) => fetch(url, {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), 'x-case': currentCase }
      })
      const service = new ModelDiscoveryService(fetchImpl)
      const input = { provider: 'custom' as const, transport: 'openai-chat-completions' as const, baseUrl: `${server.url}/v1`, modelDiscovery: 'openai-models' as const, apiKey: 'test-key-not-real' }

      await expect(service.discover(input)).rejects.toMatchObject({ code: 'RESPONSE_PARSE_ERROR' })
      currentCase = 'text'
      await expect(service.discover(input)).rejects.toMatchObject({ code: 'RESPONSE_PARSE_ERROR' })
      currentCase = 'slow'
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10)
      await expect(service.discover({ ...input, signal: controller.signal })).rejects.toMatchObject({ code: 'TIMEOUT' })
    } finally {
      await server.close()
    }
  })

  it('fetches custom full endpoint models only from an explicit model endpoint', async () => {
    const server = await mockServer((request, response) => {
      expect(request.url).toBe('/custom/models')
      expect(request.headers.authorization).toBe('Bearer test-key-not-real')
      json(response, 200, { data: [{ id: 'custom-chat' }] })
    })
    try {
      const service = new ModelDiscoveryService()

      await expect(service.discover({
        provider: 'custom',
        transport: 'openai-chat-completions',
        baseUrl: `${server.url}/custom/chat/completions`,
        endpointMode: 'full-endpoint',
        modelDiscovery: 'custom-models-endpoint',
        modelListEndpoint: `${server.url}/custom/models`,
        apiKey: 'test-key-not-real'
      })).resolves.toMatchObject({ success: true, recommendedModelId: 'custom-chat' })
    } finally {
      await server.close()
    }
  })
})

async function mockServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a TCP port.')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
