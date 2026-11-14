import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretCodec } from './secret-vault'

const codecMock = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => `cipher:${value}`),
  decryptString: vi.fn((value: string) => value.replace(/^cipher:/, ''))
} satisfies SecretCodec

const { ConfigStore } = await import('./config-store')
const { CredentialStore } = await import('./credential-store')

const tempDirs: string[] = []

async function makeCredentialStore(): Promise<{ config: InstanceType<typeof ConfigStore>; credentials: InstanceType<typeof CredentialStore> }> {
  const dir = await mkdtemp(join(tmpdir(), 'knowex-credentials-'))
  tempDirs.push(dir)
  const config = new ConfigStore({ dataDir: dir, secretCodec: codecMock })
  return { config, credentials: new CredentialStore(config, codecMock) }
}

beforeEach(() => {
  codecMock.isEncryptionAvailable.mockReturnValue(true)
  codecMock.encryptString.mockClear()
  codecMock.decryptString.mockClear()
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CredentialStore', () => {
  it('encrypts and decrypts an AI key only in the main process store', async () => {
    const { config, credentials } = await makeCredentialStore()

    await credentials.saveAIKey('legacy-openai', 'test-key-not-real')

    expect(await credentials.hasAIKey('legacy-openai')).toBe(true)
    expect(await credentials.getAIKey('legacy-openai')).toBe('test-key-not-real')
    const publicSettings = await config.getAISettings()
    expect(JSON.stringify(publicSettings)).not.toContain('test-key-not-real')
    expect(JSON.stringify(publicSettings)).not.toContain('cipher:test-key-not-real')
  })

  it('throws when encryption is unavailable for a new key', async () => {
    const { credentials } = await makeCredentialStore()
    codecMock.isEncryptionAvailable.mockReturnValue(false)

    await expect(credentials.saveAIKey('legacy-openai', 'test-key-not-real')).rejects.toThrow('credential encryption service is unavailable')
  })

  it('deletes the key for one connection', async () => {
    const { credentials } = await makeCredentialStore()
    await credentials.saveAIKey('legacy-openai', 'test-key-not-real')

    await credentials.deleteAIKey('legacy-openai')

    expect(await credentials.hasAIKey('legacy-openai')).toBe(false)
    await expect(credentials.getAIKey('legacy-openai')).rejects.toThrow('Configure an AI API key')
  })
})
