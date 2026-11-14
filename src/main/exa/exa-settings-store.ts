/** Owns Exa-only encrypted configuration in userData/exa.json; it never uses the AI config. */
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ExaConnectionTestPublic, ExaSettingsPublic } from '../../shared/domain/models'
import type { SaveExaSettingsInput } from '../../shared/contracts/ipc'

interface StoredExaSettings {
  version: 1
  encryptedApiKey?: string
  updatedAt?: string
  lastTest?: ExaConnectionTestPublic
}

const EMPTY_SETTINGS: StoredExaSettings = { version: 1 }

export class ExaSettingsStore {
  private get settingsPath(): string {
    return join(app.getPath('userData'), 'exa.json')
  }

  async getPublicSettings(): Promise<ExaSettingsPublic> {
    const settings = await this.read()
    return {
      configured: Boolean(settings.encryptedApiKey),
      updatedAt: settings.updatedAt,
      lastTest: settings.lastTest ? { ...settings.lastTest } : undefined
    }
  }

  async save(input: SaveExaSettingsInput): Promise<ExaSettingsPublic> {
    const settings = await this.read()
    if (input.clearApiKey) delete settings.encryptedApiKey
    if (input.apiKey?.trim()) {
      if (!isStrongEncryptionAvailable()) {
        throw new Error('The operating system credential encryption service is unavailable.')
      }
      settings.encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString('base64')
    }
    settings.updatedAt = new Date().toISOString()
    // A credential change invalidates the meaning of a previous connection result.
    delete settings.lastTest
    await this.write(settings)
    return this.getPublicSettings()
  }

  /** Persists sanitized test metadata only; provider responses and API keys are never recorded. */
  async saveTestResult(result: ExaConnectionTestPublic): Promise<ExaSettingsPublic> {
    const settings = await this.read()
    settings.lastTest = { ...result }
    await this.write(settings)
    return this.getPublicSettings()
  }

  async getApiKey(): Promise<string> {
    const settings = await this.read()
    if (!settings.encryptedApiKey) throw new Error('Configure an Exa API key in Settings before searching.')
    if (!isStrongEncryptionAvailable()) {
      throw new Error('The operating system credential encryption service is unavailable.')
    }
    try {
      return safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, 'base64'))
    } catch (error) {
      throw new Error('The saved Exa API key could not be decrypted. Enter it again in Settings.', { cause: error })
    }
  }

  private async read(): Promise<StoredExaSettings> {
    try {
      const raw = JSON.parse(await readFile(this.settingsPath, 'utf8')) as Partial<StoredExaSettings>
      return raw.version === 1 && (raw.encryptedApiKey === undefined || typeof raw.encryptedApiKey === 'string')
        ? {
            version: 1,
            encryptedApiKey: raw.encryptedApiKey,
            updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
            lastTest: isConnectionTest(raw.lastTest) ? raw.lastTest : undefined
          }
        : { ...EMPTY_SETTINGS }
    } catch (error) {
      if (isMissingFile(error)) return { ...EMPTY_SETTINGS }
      throw error
    }
  }

  private async write(settings: StoredExaSettings): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true })
    const temporaryPath = `${this.settingsPath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(settings, null, 2), 'utf8')
    await rename(temporaryPath, this.settingsPath)
  }
}

function isConnectionTest(value: unknown): value is ExaConnectionTestPublic {
  if (!value || typeof value !== 'object') return false
  const test = value as Partial<ExaConnectionTestPublic>
  return typeof test.success === 'boolean' && typeof test.message === 'string' && typeof test.checkedAt === 'string'
}

function isStrongEncryptionAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform !== 'linux') return true
  const backend = (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.()
  return backend !== 'basic_text'
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
