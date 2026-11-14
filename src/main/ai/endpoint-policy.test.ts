import { describe, expect, it } from 'vitest'
import { assertEndpointPolicy, assertResolvedEndpointPolicy } from './endpoint-policy'

describe('endpoint policy', () => {
  it('allows official provider origins', () => {
    expect(assertEndpointPolicy({
      url: 'https://api.openai.com/v1/responses',
      provider: 'openai',
      transport: 'openai-responses'
    }).origin).toBe('https://api.openai.com')
  })

  it('requires custom confirmation for third-party official-provider relays', () => {
    expect(() => assertEndpointPolicy({
      url: 'https://relay.example.com/v1/responses',
      provider: 'openai',
      transport: 'openai-responses'
    })).toThrow('Official providers')
  })

  it('rejects credentials, fragments, and secret query parameters', () => {
    expect(() => assertEndpointPolicy({ url: 'https://user:pass@example.com/v1', provider: 'custom', transport: 'openai-chat-completions' })).toThrow('usernames')
    expect(() => assertEndpointPolicy({ url: 'https://example.com/v1#frag', provider: 'custom', transport: 'openai-chat-completions' })).toThrow('fragments')
    expect(() => assertEndpointPolicy({ url: 'https://example.com/v1?api_key=test-key-not-real', provider: 'custom', transport: 'openai-chat-completions' })).toThrow('query')
  })

  it('rejects private remote endpoints', () => {
    for (const url of [
      'https://127.0.0.1/v1',
      'https://10.1.2.3/v1',
      'https://172.16.0.10/v1',
      'https://192.168.1.10/v1',
      'https://169.254.169.254/latest',
      'https://[::1]/v1',
      'https://[fd00::1]/v1'
    ]) {
      expect(() => assertEndpointPolicy({ url, provider: 'custom', transport: 'openai-chat-completions' })).toThrow()
    }
  })

  it('allows explicit localhost compatible service HTTP mode', () => {
    expect(assertEndpointPolicy({
      url: 'http://localhost:11434/v1',
      provider: 'custom',
      transport: 'openai-chat-completions',
      allowLocalService: true
    }).origin).toBe('http://localhost:11434')
  })

  it('rejects custom domains that resolve to private addresses', async () => {
    await expect(assertResolvedEndpointPolicy({
      url: 'https://relay.example.com/v1',
      provider: 'custom',
      transport: 'openai-chat-completions',
      resolveHost: async () => ['10.0.0.4']
    })).rejects.toMatchObject({ code: 'PRIVATE_NETWORK_ENDPOINT_BLOCKED' })
  })
})
