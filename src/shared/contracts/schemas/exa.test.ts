/** Contract regression tests keep Exa academic-first and bound research context and filters. */
import { describe, expect, it } from 'vitest'
import { getExaContentInputSchema, saveExaSettingsInputSchema, searchExaInputSchema } from './exa'

describe('Exa IPC schemas', () => {
  it('defaults searches to academic mode with a bounded result count', () => {
    expect(searchExaInputSchema.parse({ query: 'graph neural networks' })).toEqual({
      query: 'graph neural networks',
      mode: 'academic',
      numResults: 8
    })
    expect(() => searchExaInputSchema.parse({ query: 'x', numResults: 100 })).toThrow()
  })

  it('rejects unexpected secret fields and unsafe source schemes', () => {
    expect(() => saveExaSettingsInputSchema.parse({ apiKey: 'key', encryptedApiKey: 'cipher' })).toThrow()
    expect(() => getExaContentInputSchema.parse({ url: 'file:///etc/passwd' })).toThrow()
    expect(() => getExaContentInputSchema.parse({ url: 'https://user:password@example.com/private' })).toThrow()
  })

  it('accepts bounded follow-up context and rejects URL-shaped domain filters', () => {
    expect(searchExaInputSchema.parse({
      query: 'Find replications',
      context: 'A selected paragraph from the current paper.',
      history: ['Find the original study'],
      language: 'en',
      includeDomains: ['arxiv.org', 'nature.com/articles'],
      excludeDomains: ['example.com'],
      endPublishedDate: '2025-12-31T23:59:59.999Z'
    })).toMatchObject({ language: 'en', includeDomains: ['arxiv.org', 'nature.com/articles'] })
    expect(() => searchExaInputSchema.parse({ query: 'Find papers', includeDomains: ['https://arxiv.org'] })).toThrow()
  })
})
