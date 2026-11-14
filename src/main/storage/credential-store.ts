import { safeStorage } from 'electron'
import { ConfigStore } from './config-store'

export class CredentialStore {
  constructor(private readonly config: ConfigStore) {}

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() && !usesWeakLinuxBackend()
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
      throw new Error('The operating system credential encryption service is unavailable.')
    }
    return safeStorage.encryptString(trimmed).toString('base64')
  }

  async getAIKey(connectionId: string): Promise<string> {
    const ai = await this.config.getAIConfig()
    const encryptedApiKey = ai.encryptedSecrets[connectionId]
    if (!encryptedApiKey) {
      throw new Error('Configure an AI API key in Settings before asking a question.')
    }
    if (!this.isEncryptionAvailable()) {
      throw new Error('The operating system credential encryption service is unavailable.')
    }
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'))
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

function usesWeakLinuxBackend(): boolean {
  if (process.platform !== 'linux') return false
  const selectedStorageBackend = (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.()
  return selectedStorageBackend === 'basic_text'
}
