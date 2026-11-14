import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from './fuzzy-search'

describe('reader fuzzy search', () => {
  it('finds exact phrases', () => expect(fuzzyMatch('Attention is all you need', 'all you need')).toMatchObject({ matched: true, exact: true }))
  it('tolerates a small Latin typo', () => expect(fuzzyMatch('The Transformer architecture', 'tranformer')).toMatchObject({ matched: true, exact: false }))
  it('returns Chinese bigrams that can be highlighted across PDF spans', () => expect(fuzzyMatch('本文讨论注意力机制', '注意力机制').terms).toContain('注意'))
  it('rejects unrelated input', () => expect(fuzzyMatch('convolutional neural network', 'bibliography')).toMatchObject({ matched: false }))
})
