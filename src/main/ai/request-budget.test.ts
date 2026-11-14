import { describe, expect, it } from 'vitest'
import { assertAIRequestBudget } from './request-budget'
import type { AIRequest } from './ai-types'

const oneByOnePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function request(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    systemPrompt: 'system',
    evidenceText: 'evidence',
    messages: [{ role: 'user', content: 'question' }],
    images: [],
    ...overrides
  }
}

describe('AI request budget', () => {
  it('allows a small text and PNG request', () => {
    expect(() => assertAIRequestBudget(request({ images: [{ mimeType: 'image/png', dataUrl: oneByOnePng }] }))).not.toThrow()
  })

  it('rejects excessive history, text, images, invalid PNG data, and large pixels locally', () => {
    expect(() => assertAIRequestBudget(request({ messages: Array.from({ length: 22 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `m${index}` })) }))).toThrow('History')
    expect(() => assertAIRequestBudget(request({ evidenceText: 'x'.repeat(130_000) }))).toThrow('safety limit')
    expect(() => assertAIRequestBudget(request({ images: [oneByOnePng, oneByOnePng, oneByOnePng, oneByOnePng].map((dataUrl) => ({ mimeType: 'image/png' as const, dataUrl })) }))).toThrow('Too many images')
    expect(() => assertAIRequestBudget(request({ images: [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }] }))).toThrow('valid PNG')
    const huge = Buffer.from(oneByOnePng.split(',')[1], 'base64')
    huge.writeUInt32BE(5000, 16)
    huge.writeUInt32BE(5000, 20)
    expect(() => assertAIRequestBudget(request({ images: [{ mimeType: 'image/png', dataUrl: `data:image/png;base64,${huge.toString('base64')}` }] }))).toThrow('too many pixels')
  })
})
