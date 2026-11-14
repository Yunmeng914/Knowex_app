/**
 * Fixed-origin Exa REST adapter; composes bounded research context and maps untrusted JSON.
 * The renderer owns conversation presentation, while this adapter owns provider terminology.
 */
import type { ExaContentPublic, ExaSearchPublic, ExaSourcePublic } from '../../shared/domain/models'
import type { SearchExaInput } from '../../shared/contracts/ipc'

const EXA_ORIGIN = 'https://api.exa.ai'
const MAX_RESPONSE_CHARACTERS = 6_000_000
const REQUEST_TIMEOUT_MS = 45_000

type FetchLike = typeof fetch

export class ExaClient {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async search(input: SearchExaInput, apiKey: string): Promise<ExaSearchPublic> {
    const providerQuery = buildExaProviderQuery(input)
    const payload: Record<string, unknown> = {
      query: providerQuery,
      type: 'auto',
      numResults: input.numResults,
      contents: {
        highlights: {
          query: providerQuery,
          maxCharacters: 1_600
        }
      }
    }
    // Academic is the product default; only an explicit full-web choice removes this provider filter.
    if (input.mode === 'academic') payload.category = 'research paper'
    if (input.startPublishedDate) payload.startPublishedDate = input.startPublishedDate
    if (input.endPublishedDate) payload.endPublishedDate = input.endPublishedDate
    if (input.includeDomains?.length) payload.includeDomains = input.includeDomains
    if (input.excludeDomains?.length) payload.excludeDomains = input.excludeDomains

    const body = await this.post('/search', payload, apiKey)
    return mapSearchResponse(body, input)
  }

  async getContent(url: string, apiKey: string): Promise<ExaContentPublic> {
    const body = await this.post('/contents', {
      ids: [url],
      text: { maxCharacters: 60_000, verbosity: 'compact' },
      maxAgeHours: 24
    }, apiKey)
    return mapContentResponse(body, url)
  }

  private async post(path: '/search' | '/contents', payload: unknown, apiKey: string): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(`${EXA_ORIGIN}${path}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error('Exa did not respond before the request timed out.', { cause: error })
      }
      throw new Error('Knowex could not reach the Exa API.', { cause: error })
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0')
    if (declaredLength > MAX_RESPONSE_CHARACTERS) throw new Error('Exa returned more content than Knowex can safely process.')
    const text = await response.text()
    if (text.length > MAX_RESPONSE_CHARACTERS) throw new Error('Exa returned more content than Knowex can safely process.')

    let body: unknown
    try { body = text ? JSON.parse(text) : {} } catch (error) {
      throw new Error('Exa returned an invalid response.', { cause: error })
    }
    if (!response.ok) throw exaHttpError(response.status, body)
    return body
  }
}

const LANGUAGE_NAMES: Record<NonNullable<SearchExaInput['language']>, string> = {
  any: '',
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  de: 'German',
  fr: 'French',
  es: 'Spanish'
}

/**
 * Builds one semantic query from a follow-up instruction and its local paper context.
 * Exa has no strict language field, so language is intentionally expressed as a preference.
 */
export function buildExaProviderQuery(input: SearchExaInput): string {
  const sections = [`Current research instruction:\n${input.query}`]
  const history = input.history?.slice(-4).filter((item) => item !== input.query)
  if (history?.length) sections.push(`Previous research instructions:\n${history.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
  if (input.context) sections.push(`Paper excerpt to search around:\n${input.context}`)
  const language = input.language ? LANGUAGE_NAMES[input.language] : ''
  if (language) sections.push(`Prefer sources written primarily in ${language}. Treat this as a preference, not a factual constraint.`)
  return sections.join('\n\n')
}

export function mapSearchResponse(body: unknown, input: SearchExaInput): ExaSearchPublic {
  const record = asRecord(body)
  const rawResults = Array.isArray(record.results) ? record.results : []
  const results = rawResults.map(mapSource).filter((source): source is ExaSourcePublic => Boolean(source))
  return {
    requestId: stringValue(record.requestId),
    query: input.query,
    mode: input.mode,
    results,
    costDollars: costValue(record.costDollars)
  }
}

export function mapContentResponse(body: unknown, requestedUrl: string): ExaContentPublic {
  const record = asRecord(body)
  const first = Array.isArray(record.results) ? record.results[0] : undefined
  const result = asRecord(first)
  // Some Contents responses expose only an opaque id; the validated requested URL remains the source fallback.
  const source = mapSource({ ...result, url: stringValue(result.url) ?? requestedUrl })
  if (!source) throw new Error('Exa could not extract content from this source.')
  const text = stringValue(result.text)?.trim()
  if (!text) throw new Error('Exa did not return readable text for this source.')
  return { source, text, retrievedAt: new Date().toISOString() }
}

function mapSource(value: unknown): ExaSourcePublic | undefined {
  const record = asRecord(value)
  const url = safeHttpUrl(stringValue(record.url) ?? stringValue(record.id))
  if (!url) return undefined
  const highlights = Array.isArray(record.highlights)
    ? record.highlights.map(stringValue).filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim())
    : []
  return {
    id: stringValue(record.id) ?? url,
    title: stringValue(record.title)?.trim() || new URL(url).hostname,
    url,
    author: stringValue(record.author)?.trim() || undefined,
    publishedDate: stringValue(record.publishedDate) ?? undefined,
    highlights
  }
}

function exaHttpError(status: number, body: unknown): Error {
  const message = providerMessage(body)
  if (status === 401 || status === 403) return new Error('Exa rejected the API key. Check the key in Settings.')
  if (status === 402) return new Error('The Exa account has no available credit.')
  if (status === 429) return new Error('Exa rate-limited this request. Wait a moment and try again.')
  if (status >= 500) return new Error('Exa is temporarily unavailable. Try again later.')
  return new Error(message ? `Exa request failed: ${message}` : `Exa request failed with HTTP ${status}.`)
}

function providerMessage(value: unknown): string | undefined {
  const record = asRecord(value)
  const direct = stringValue(record.message) ?? stringValue(record.error)
  if (direct) return direct.slice(0, 300)
  const error = asRecord(record.error)
  return stringValue(error.message)?.slice(0, 300)
}

function costValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const record = asRecord(value)
  const total = record.total
  return typeof total === 'number' && Number.isFinite(total) ? total : undefined
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}
