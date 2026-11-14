import { describe, expect, it } from 'vitest'
import { collectionPaths } from './zotero-collections'
import type { ZoteroCollection } from './zotero-types'

describe('Zotero collection hierarchy', () => {
  it('builds nested paths and avoids malformed cycles', () => {
    const collections: ZoteroCollection[] = [
      { key: 'ROOT', data: { name: 'Research', parentCollection: false } },
      { key: 'CHILD', data: { name: 'Vision', parentCollection: 'ROOT' } },
      { key: 'LOOP', data: { name: 'Loop', parentCollection: 'LOOP' } }
    ]
    expect(collectionPaths(['CHILD', 'LOOP'], collections)).toEqual([['Research', 'Vision'], ['Loop']])
  })
})
