import { describe, expect, it } from 'vitest'
import { saveAIConnectionInputSchema, testAIConnectionInputSchema } from './ai'

const valid = {
  name: 'Custom',
  provider: 'custom',
  transport: 'openai-chat-completions',
  baseUrl: 'https://example.com/v1/chat/completions',
  model: 'model',
  capabilities: { text: true, vision: false, streaming: false }
}

describe('AI connection schemas', () => {
  it('accepts cloud connection writes', () => {
    expect(saveAIConnectionInputSchema.parse(valid)).toMatchObject(valid)
    expect(testAIConnectionInputSchema.parse({ ...valid, apiKey: 'test-key-not-real' })).toMatchObject(valid)
    expect(saveAIConnectionInputSchema.parse({
      ...valid,
      name: 'GLM',
      provider: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
      model: 'glm-5.2'
    })).toMatchObject({ provider: 'glm', transport: 'openai-chat-completions' })
  })

  it('rejects extra secret-like IPC fields', () => {
    expect(() => saveAIConnectionInputSchema.parse({
      ...valid,
      encryptedApiKey: 'cipher',
      oldApiKey: 'test-key-not-real',
      secret: 'test-key-not-real'
    })).toThrow()
  })

  it('accepts local CLI connection writes without API keys', () => {
    const parsed = saveAIConnectionInputSchema.parse({
      name: 'Codex',
      provider: 'codex',
      transport: 'codex-cli',
      executablePath: 'C:\\Tools\\codex.exe',
      capabilities: { text: true, vision: false, streaming: false }
    })
    expect(parsed).toMatchObject({ provider: 'codex', transport: 'codex-cli' })
  })

  it('rejects executable paths disguised as command strings', () => {
    expect(() => saveAIConnectionInputSchema.parse({
      name: 'Codex',
      provider: 'codex',
      transport: 'codex-cli',
      executablePath: 'C:\\Tools\\codex.exe --danger',
      capabilities: { text: true, vision: false, streaming: false }
    })).toThrow()
  })

  it('rejects non-HTTPS remote endpoints', () => {
    expect(() => saveAIConnectionInputSchema.parse({ ...valid, baseUrl: 'http://example.com/v1/chat/completions' })).toThrow()
    const parsed = saveAIConnectionInputSchema.parse({ ...valid, baseUrl: 'http://localhost:11434/v1/chat/completions' })
    expect('baseUrl' in parsed ? parsed.baseUrl : '').toContain('localhost')
  })
})
