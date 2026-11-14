import { describe, expect, it } from 'vitest'
import type { StoredAIConnection } from '../storage/config-store'
import { buildCredentialDestinationFingerprint, destinationsMatch, fingerprintKey } from './credential-destination'

const connection: StoredAIConnection = {
  id: 'conn-1',
  name: 'OpenAI',
  provider: 'openai',
  transport: 'openai-responses',
  baseUrl: 'https://API.OPENAI.com:443/v1/',
  modelListEndpoint: 'https://api.openai.com:443/v1/models',
  model: 'gpt-test',
  capabilities: { text: true, vision: true, streaming: false },
  timeoutMs: 90_000,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z'
}

describe('credential destination fingerprint', () => {
  it('binds credentials to provider, transport, auth scheme, request origin, and model-list origin', () => {
    expect(buildCredentialDestinationFingerprint(connection)).toEqual({
      provider: 'openai',
      transport: 'openai-responses',
      authScheme: 'bearer',
      requestOrigin: 'https://api.openai.com',
      modelListOrigin: 'https://api.openai.com'
    })
  })

  it('does not include API keys, paths, queries, or model names in the fingerprint', () => {
    const fingerprint = fingerprintKey(buildCredentialDestinationFingerprint({ ...connection, model: 'other-model' }))
    expect(fingerprint).not.toContain('gpt-test')
    expect(fingerprint).not.toContain('/v1')
    expect(fingerprint).not.toContain('key')
  })

  it('detects destination changes while allowing model-only changes', () => {
    const original = buildCredentialDestinationFingerprint(connection)
    expect(destinationsMatch(original, buildCredentialDestinationFingerprint({ ...connection, model: 'other-model' }))).toBe(true)
    expect(destinationsMatch(original, buildCredentialDestinationFingerprint({ ...connection, baseUrl: 'https://relay.example.com/v1' }))).toBe(false)
  })
})
