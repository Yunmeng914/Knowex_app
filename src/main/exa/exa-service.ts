/** Exa use-case facade used by server routes; owns settings, retrieval, and URL validation. */
import type { ExaConnectionTestPublic, ExaContentPublic, ExaSearchPublic, ExaSettingsPublic } from '../../shared/domain/models'
import type { GetExaContentInput, SaveExaSettingsInput, SearchExaInput } from '../../shared/contracts/ipc'
import { ExaClient } from './exa-client'
import { ExaSettingsStore } from './exa-settings-store'

export class ExaService {
  constructor(
    private readonly settings: ExaSettingsStore,
    private readonly client: ExaClient
  ) {}

  getSettings(): Promise<ExaSettingsPublic> {
    return this.settings.getPublicSettings()
  }

  saveSettings(input: SaveExaSettingsInput): Promise<ExaSettingsPublic> {
    return this.settings.save(input)
  }

  async testConnection(): Promise<ExaConnectionTestPublic> {
    const startedAt = Date.now()
    let result: ExaConnectionTestPublic
    try {
      const apiKey = await this.settings.getApiKey()
      const search = await this.client.search({ query: 'recent machine learning research', mode: 'academic', numResults: 1 }, apiKey)
      result = {
        success: true,
        message: search.results.length > 0 ? 'Exa academic search is ready.' : 'Exa accepted the key, but returned no test result.',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      }
    } catch (error) {
      result = {
        success: false,
        message: error instanceof Error ? error.message : 'Exa connection test failed.',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      }
    }
    await this.settings.saveTestResult(result)
    return result
  }

  async search(input: SearchExaInput): Promise<ExaSearchPublic> {
    return this.client.search(input, await this.settings.getApiKey())
  }

  async getContent(input: GetExaContentInput): Promise<ExaContentPublic> {
    return this.client.getContent(input.url, await this.settings.getApiKey())
  }

  /** Validates that an external source URL is safe public HTTP/HTTPS before opening on the web client. */
  async openSource(url: string): Promise<{ url: string }> {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Only public HTTP and HTTPS source URLs can be opened.')
    }
    parsed.hash = ''
    return { url: parsed.toString() }
  }
}
