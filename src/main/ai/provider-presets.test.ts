import { describe, expect, it } from 'vitest'
import { CLOUD_PROVIDER_PRESETS } from './provider-presets'

describe('cloud provider presets', () => {
  it('contains only cloud providers for the second-step UI', () => {
    expect(CLOUD_PROVIDER_PRESETS.map((preset) => preset.provider)).toEqual(['openai', 'anthropic', 'deepseek', 'kimi', 'minimax', 'glm', 'custom'])
    expect(CLOUD_PROVIDER_PRESETS.map((preset) => preset.provider)).not.toContain('codex-cli')
    expect(CLOUD_PROVIDER_PRESETS.map((preset) => preset.provider)).not.toContain('claude-code-cli')
  })

  it('keeps provider and transport as separate fields', () => {
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'deepseek')).toMatchObject({
      provider: 'deepseek',
      defaultTransport: 'openai-chat-completions',
      defaultBaseUrl: 'https://api.deepseek.com',
      modelExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      defaultCapabilities: { text: true, vision: false, streaming: false }
    })
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'anthropic')?.defaultTransport).toBe('anthropic-messages')
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'glm')).toMatchObject({
      provider: 'glm',
      defaultTransport: 'openai-chat-completions',
      defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/'
    })
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'deepseek')?.modelPlaceholder).not.toContain('deepseek-chat')
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'deepseek')?.modelExamples).not.toContain('deepseek-chat')
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'deepseek')?.modelExamples).not.toContain('deepseek-reasoner')
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'openai')?.modelPlaceholder).toContain('Detect models first')
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'kimi')).toMatchObject({
      defaultBaseUrl: 'https://api.moonshot.cn/v1',
      regions: [
        { id: 'mainland', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
        { id: 'international', defaultBaseUrl: 'https://api.moonshot.ai/v1' }
      ]
    })
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'minimax')).toMatchObject({
      defaultBaseUrl: 'https://api.minimaxi.com/v1'
    })
    expect(CLOUD_PROVIDER_PRESETS.find((preset) => preset.provider === 'custom')).toMatchObject({
      custom: true,
      baseUrlEditable: true,
      modelDiscovery: 'unsupported'
    })
    expect(CLOUD_PROVIDER_PRESETS.filter((preset) => !preset.custom).every((preset) => preset.baseUrlEditable === false && preset.allowCustomBaseUrl === false)).toBe(true)
  })

  it('keeps provider preset metadata unique and non-secret', () => {
    const providers = CLOUD_PROVIDER_PRESETS.map((preset) => preset.provider)
    expect(new Set(providers).size).toBe(providers.length)
    for (const preset of CLOUD_PROVIDER_PRESETS) {
      expect(preset.authScheme).toBeDefined()
      expect(preset.endpointStrategy).toBeDefined()
      expect(preset.modelDiscovery).toBeDefined()
      expect(JSON.stringify(preset).toLowerCase()).not.toContain('api_key')
      expect(JSON.stringify(preset).toLowerCase()).not.toContain('authorization')
    }
  })
})
