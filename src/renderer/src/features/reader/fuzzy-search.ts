export interface FuzzyMatch {
  matched: boolean
  exact: boolean
  score: number
  index: number
  terms: string[]
}

const words = (value: string): string[] => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

export function fuzzyMatch(text: string, query: string): FuzzyMatch {
  const source = text.toLocaleLowerCase()
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return { matched: false, exact: false, score: 0, index: -1, terms: [] }
  const exactIndex = source.indexOf(needle)
  if (exactIndex >= 0) return { matched: true, exact: true, score: 1, index: exactIndex, terms: highlightTerms(needle) }

  const sourceWords = words(source)
  const queryWords = words(needle)
  const matchedTerms: string[] = []
  let total = 0
  for (const queryWord of queryWords) {
    let best = ''
    let bestScore = 0
    for (const candidate of sourceWords) {
      if (candidate.includes(queryWord) || queryWord.includes(candidate)) {
        const score = Math.min(candidate.length, queryWord.length) / Math.max(candidate.length, queryWord.length)
        if (score > bestScore) { best = candidate; bestScore = score }
        continue
      }
      if (queryWord.length >= 4) {
        const distance = levenshtein(candidate, queryWord)
        const score = 1 - distance / Math.max(candidate.length, queryWord.length)
        if (score > bestScore) { best = candidate; bestScore = score }
      }
    }
    if (bestScore < 0.72) return fuzzyCompactMatch(source, needle)
    matchedTerms.push(best)
    total += bestScore
  }
  if (!matchedTerms.length) return fuzzyCompactMatch(source, needle)
  const index = Math.min(...matchedTerms.map((term) => source.indexOf(term)).filter((value) => value >= 0))
  return { matched: true, exact: false, score: total / matchedTerms.length, index, terms: [...new Set(matchedTerms)] }
}

function fuzzyCompactMatch(source: string, needle: string): FuzzyMatch {
  const compactSource = source.replace(/[^\p{L}\p{N}]/gu, '')
  const compactNeedle = needle.replace(/[^\p{L}\p{N}]/gu, '')
  if (compactNeedle.length < 4 || compactSource.length < compactNeedle.length) return { matched: false, exact: false, score: 0, index: -1, terms: [] }
  const allowed = Math.max(1, Math.floor(compactNeedle.length * 0.2))
  for (let index = 0; index <= compactSource.length - compactNeedle.length; index += 1) {
    const candidate = compactSource.slice(index, index + compactNeedle.length)
    const distance = levenshtein(candidate, compactNeedle)
    if (distance <= allowed) return { matched: true, exact: false, score: 1 - distance / compactNeedle.length, index: source.indexOf(candidate[0]), terms: highlightTerms(candidate) }
  }
  return { matched: false, exact: false, score: 0, index: -1, terms: [] }
}

function highlightTerms(value: string): string[] {
  const tokens = words(value)
  if (!/[\p{Script=Han}]/u.test(value)) return tokens.length ? tokens : [value]
  const compact = value.replace(/[^\p{L}\p{N}]/gu, '')
  const bigrams = Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2))
  return [...new Set([compact, ...bigrams].filter(Boolean))]
}

export function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, above, previous[rightIndex - 1]) + 1
      diagonal = above
    }
  }
  return previous[right.length]
}
