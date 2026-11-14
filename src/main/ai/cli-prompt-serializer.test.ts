import { describe, expect, it } from 'vitest'
import { serializeCliPrompt } from './cli-prompt-serializer'

describe('CLI prompt serializer', () => {
  it('serializes history and current question exactly once in stable section order', () => {
    const prompt = serializeCliPrompt({
      systemPrompt: 'system',
      evidenceText: 'evidence only',
      messages: [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'current question' }
      ],
      images: []
    })

    expect(prompt.indexOf('KNOWEX_SYSTEM_INSTRUCTION')).toBeLessThan(prompt.indexOf('KNOWEX_ANNOTATION_EVIDENCE'))
    expect(prompt.indexOf('KNOWEX_ANNOTATION_EVIDENCE')).toBeLessThan(prompt.indexOf('KNOWEX_CHAT_HISTORY'))
    expect(prompt.indexOf('KNOWEX_CHAT_HISTORY')).toBeLessThan(prompt.indexOf('KNOWEX_CURRENT_USER_QUESTION'))
    expect(prompt.match(/old question/g)).toHaveLength(1)
    expect(prompt.match(/current question/g)).toHaveLength(1)
    expect(prompt).toContain('evidence only')
  })
})
