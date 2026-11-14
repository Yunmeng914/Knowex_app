/**
 * Renderer-safe Exa entities shared by the research UI and main-process adapter.
 * Raw provider payloads, provider-only query composition, and credentials never cross IPC.
 */
export type ExaSearchMode = 'academic' | 'web'
export type ExaLanguage = 'any' | 'zh' | 'en' | 'ja' | 'de' | 'fr' | 'es'

export interface ExaSettingsPublic {
  configured: boolean
  /** Non-secret audit fields let the renderer show durable save and test feedback. */
  updatedAt?: string
  lastTest?: ExaConnectionTestPublic
}

export interface ExaConnectionTestPublic {
  success: boolean
  message: string
  latencyMs?: number
  checkedAt: string
}

export interface ExaSourcePublic {
  id: string
  title: string
  url: string
  author?: string
  publishedDate?: string
  highlights: string[]
}

export interface ExaSearchPublic {
  requestId?: string
  query: string
  mode: ExaSearchMode
  results: ExaSourcePublic[]
  costDollars?: number
}

export interface ExaContentPublic {
  source: ExaSourcePublic
  text: string
  retrievedAt: string
}
