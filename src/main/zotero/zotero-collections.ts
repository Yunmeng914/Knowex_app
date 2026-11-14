import type { ZoteroCollection } from './zotero-types'

export function collectionPaths(keys: string[], collections: ZoteroCollection[]): string[][] {
  const entries: Array<[string, ZoteroCollection]> = collections.map((collection) => [collection.key ?? collection.data?.key ?? '', collection])
  const byKey = new Map(entries.filter(([key]) => Boolean(key)))
  return keys.map((key) => {
    const path: string[] = []
    const visited = new Set<string>()
    let current = key
    while (current && !visited.has(current)) {
      visited.add(current)
      const collection = byKey.get(current)
      if (!collection) break
      path.unshift(collection.data?.name?.trim() || current)
      current = typeof collection.data?.parentCollection === 'string' ? collection.data.parentCollection : ''
    }
    return path
  }).filter((path) => path.length > 0)
}
