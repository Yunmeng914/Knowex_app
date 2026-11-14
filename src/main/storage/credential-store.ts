/**
 * Server-side AI API key encryption and lookup store.
 *
 * Delegates encryption/decryption to the injected or ConfigStore-owned
 * `SecretCodec` so secrets never reach the browser or plain JSON exports.
 */
import { ConfigStore } from './config-store'
import type { SecretCodec } from './secret-vault'

export class CredentialStore {
  private readonly secretCodec: SecretCodec

  constructor(
    private readonly config: ConfigStore,
    secretCodec?: SecretCodec
  ) {
    this.secretCodec = secretCodec ?? config.secretCodec
  }

  isEncryptionAvailable(): boolean {
    return this.secretCodec.isEncryptionAvailable()
  }

  async hasAIKey(connectionId: string): Promise<boolean> {
    const ai = await this.config.getAIConfig()
    return Boolean(ai.encryptedSecrets[connectionId])
  }

  async saveAIKey(connectionId: string, apiKey: string): Promise<void> {
    const trimmed = apiKey.trim()
    if (!trimmed) return

    const ai = await this.config.getAIConfig()
    ai.encryptedSecrets[connectionId] = this.encryptAIKey(trimmed)
    await this.config.saveAIConfig(ai)
  }

  encryptAIKey(apiKey: string): string {
    const trimmed = apiKey.trim()
    if (!trimmed) throw new Error('API key is empty.')
    if (!this.isEncryptionAvailable()) {
      throw new Error('The credential encryption service is unavailable.')
    }
    return this.secretCodec.encryptString(trimmed)
  }

  async getAIKey(connectionId: string): Promise<string> {
    const ai = await this.config.getAIConfig()
    const encryptedApiKey = ai.encryptedSecrets[connectionId]
    if (!encryptedApiKey) {
      throw new Error('Configure an AI API key in Settings before asking a question.')
    }
    if (!this.isEncryptionAvailable()) {
      throw new Error('The credential encryption service is unavailable.')
    }
    return this.secretCodec.decryptString(encryptedApiKey)
  }

  async deleteAIKey(connectionId: string): Promise<void> {
    const ai = await this.config.getAIConfig()
    if (!(connectionId in ai.encryptedSecrets)) return
    delete ai.encryptedSecrets[connectionId]
    const fingerprints = { ...ai.credentialFingerprints }
    delete fingerprints[connectionId]
    ai.credentialFingerprints = fingerprints
    await this.config.saveAIConfig(ai)
  }
}
