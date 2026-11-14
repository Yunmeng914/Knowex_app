import { describe, expect, it, vi } from 'vitest'
import type { AIConnector } from './connectors/ai-connector'
import { ProviderRegistry } from './provider-registry'

describe('ProviderRegistry', () => {
  it('returns connectors by explicit transport', () => {
    const responses = { transport: 'openai-responses', ask: vi.fn() } satisfies AIConnector
    const chat = { transport: 'openai-chat-completions', ask: vi.fn() } satisfies AIConnector
    const anthropic = { transport: 'anthropic-messages', ask: vi.fn() } satisfies AIConnector
    const codex = { transport: 'codex-cli', ask: vi.fn() } satisfies AIConnector
    const claude = { transport: 'claude-code-cli', ask: vi.fn() } satisfies AIConnector
    const registry = new ProviderRegistry()

    registry.register(responses)
    registry.register(chat)
    registry.register(anthropic)
    registry.register(codex)
    registry.register(claude)

    expect(registry.get('openai-responses')).toBe(responses)
    expect(registry.get('openai-chat-completions')).toBe(chat)
    expect(registry.get('anthropic-messages')).toBe(anthropic)
    expect(registry.get('codex-cli')).toBe(codex)
    expect(registry.get('claude-code-cli')).toBe(claude)
  })

  it('throws a clear error for an unknown transport', () => {
    const registry = new ProviderRegistry()

    expect(() => registry.get('codex-cli')).toThrow('No AI connector is registered for transport: codex-cli.')
  })
})
