/**
 * Owns Exa-only encrypted configuration in `<dataDir>/exa.json`; never shares AI config.
 *
 * Uses the Node.js `SecretCodec` and configurable `dataDir` so Exa search and
 * connection testing operate identically in Web/Server mode without Electron.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ExaConnectionTestPublic, ExaSettingsPublic } from '../../shared/domain/models'
import type { SaveExaSettingsInput } from '../../shared/contracts/ipc'
import { NodeSecretVault, resolveKnowexDataDir, type SecretCodec } from '../storage/secret-vault'

interface StoredExaSettings {
  version: 1
  encryptedApiKey?: string
  updatedAt?: string
  lastTest?: ExaConnectionTestPublic
}

export interface ExaSettingsStoreOptions {
  dataDir?: string
  secretCodec?: SecretCodec
}

const EMPTY_SETTINGS: StoredExaSettings = { version: 1 }

export class ExaSettingsStore {
  private readonly dataDir: string
  private readonly secretCodec: SecretCodec

  constructor(options: ExaSettingsStoreOptions = {}) {
    this.dataDir = options.dataDir ?? resolveKnowexDataDir()
    this.secretCodec = options.secretCodec ?? new NodeSecretVault(this.dataDir)
  }

  private get settingsPath(): string {
    return join(this.dataDir, 'exa.json')
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
      if (!this.secretCodec.isEncryptionAvailable()) {
        throw new Error('The credential encryption service is unavailable.')
      }
      settings.encryptedApiKey = this.secretCodec.encryptString(input.apiKey.trim())
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
    if (!this.secretCodec.isEncryptionAvailable()) {
      throw new Error('The credential encryption service is unavailable.')
    }
    try {
      return this.secretCodec.decryptString(settings.encryptedApiKey)
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

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
