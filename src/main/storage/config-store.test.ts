/** Exercises configuration migrations, encrypted credential metadata, and renderer-safe projections. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretCodec } from './secret-vault'

const codecMock = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => `encrypted:${value}`),
  decryptString: vi.fn((value: string) => value.replace(/^encrypted:/, ''))
} satisfies SecretCodec

const { ConfigStore } = await import('./config-store')
const { CredentialStore } = await import('./credential-store')
const { AIConnectionService } = await import('../ai/ai-connection-service')

const tempDirs: string[] = []

async function makeStore(): Promise<{ dir: string; store: InstanceType<typeof ConfigStore>; configPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'knowex-config-'))
  tempDirs.push(dir)
  return { dir, store: new ConfigStore({ dataDir: dir, secretCodec: codecMock }), configPath: join(dir, 'config.json') }
}

beforeEach(() => {
  codecMock.isEncryptionAvailable.mockReturnValue(true)
  codecMock.encryptString.mockClear()
  codecMock.decryptString.mockClear()
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ConfigStore AI migration', () => {
  it('migrates legacy AI config once and moves the encrypted key without decrypting it', async () => {
    const { store, configPath } = await makeStore()
    await writeFile(configPath, JSON.stringify({
      language: 'en-US',
      ai: {
        baseUrl: 'https://api.openai.com/v1/responses/',
        model: 'gpt-test',
        encryptedApiKey: 'legacy-cipher'
      },
      zotero: { userId: '' }
    }), 'utf8')

    const migrated = await store.getAIConfig()

    expect(migrated.version).toBe(2)
    expect(migrated.activeConnectionId).toBe('legacy-openai')
    expect(migrated.connections).toHaveLength(1)
    expect(migrated.connections[0]).toMatchObject({
      id: 'legacy-openai',
      name: 'OpenAI',
      provider: 'openai',
      transport: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1/responses/',
      model: 'gpt-test'
    })
    expect(migrated.encryptedSecrets).toEqual({ 'legacy-openai': 'legacy-cipher' })
    expect(codecMock.decryptString).not.toHaveBeenCalled()

    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    expect(persisted.ai.version).toBe(2)
    expect(persisted.ai.encryptedApiKey).toBeUndefined()
    expect(persisted.ai.encryptedSecrets).toEqual({ 'legacy-openai': 'legacy-cipher' })
  })

  it('keeps V2 config from being migrated repeatedly', async () => {
    const { store, configPath } = await makeStore()
    const v2 = {
      version: 2,
      activeConnectionId: 'conn-1',
      connections: [{
        id: 'conn-1',
        name: 'OpenAI',
        provider: 'openai',
        transport: 'openai-responses',
        baseUrl: 'https://api.openai.com/v1/responses',
        model: 'gpt-test',
        capabilities: { text: true, vision: true, streaming: false },
        timeoutMs: 90_000,
        createdAt: '2026-07-24T00:00:00.000Z',
        updatedAt: '2026-07-24T00:00:00.000Z'
      }],
      encryptedSecrets: { 'conn-1': 'cipher' }
    }
    await writeFile(configPath, JSON.stringify({ ai: v2, zotero: { userId: '' } }), 'utf8')

    expect((await store.getAIConfig()).connections).toHaveLength(1)
    expect((await store.getAIConfig()).connections).toHaveLength(1)
    const persisted = JSON.parse(await readFile(configPath, 'utf8'))
    expect(persisted.ai.connections.map((connection: { id: string }) => connection.id)).toEqual(['conn-1'])
  })

  it('migrates legacy config without an API key as an unconfigured public connection', async () => {
    const { store, configPath } = await makeStore()
    await writeFile(configPath, JSON.stringify({
      ai: {
        baseUrl: 'https://api.openai.com/v1/responses',
        model: 'gpt-no-key'
      },
      zotero: { userId: '' }
    }), 'utf8')

    const settings = await store.getAISettings()

    expect(settings.connections[0]).toMatchObject({ model: 'gpt-no-key', configured: false, active: true })
    expect(JSON.stringify(settings)).not.toContain('encrypted')
    expect(JSON.stringify(settings)).not.toContain('encryptedSecrets')
  })

  it('preserves an existing key when the compatibility save input leaves apiKey blank', async () => {
    const { store, configPath } = await makeStore()
    await writeFile(configPath, JSON.stringify({
      ai: {
        version: 2,
        activeConnectionId: 'conn-1',
        connections: [{
          id: 'conn-1',
          name: 'OpenAI',
          provider: 'openai',
          transport: 'openai-responses',
          baseUrl: 'https://api.openai.com/v1/responses',
          model: 'gpt-old',
          capabilities: { text: true, vision: true, streaming: false },
          timeoutMs: 90_000,
          createdAt: '2026-07-24T00:00:00.000Z',
          updatedAt: '2026-07-24T00:00:00.000Z'
        }],
        encryptedSecrets: { 'conn-1': 'old-cipher' }
      },
      zotero: { userId: '' }
    }), 'utf8')

    const credentials = new CredentialStore(store, codecMock)
    const connections = new AIConnectionService(store, credentials)

    await connections.saveLegacyOpenAISettings({ baseUrl: 'https://api.openai.com/v1/responses', model: 'gpt-new', apiKey: '' })

    const ai = await store.getAIConfig()
    expect(ai.connections[0].model).toBe('gpt-new')
    expect(ai.encryptedSecrets).toEqual({ 'conn-1': 'old-cipher' })
  })

  it('does not overwrite damaged config data', async () => {
    const { store, configPath } = await makeStore()
    await writeFile(configPath, '{', 'utf8')

    await expect(store.getAIConfig()).rejects.toThrow('Knowex settings could not be read.')
    expect(await readFile(configPath, 'utf8')).toBe('{')
  })
})

describe('ConfigStore Zotero audit metadata', () => {
  it('persists an update timestamp while keeping the Web API key out of public settings', async () => {
    const { store } = await makeStore()

    const settings = await store.saveZoteroSettings({ userId: '1234567', apiKey: 'test-zotero-key-not-real' })

    expect(settings).toMatchObject({ configured: true, userId: '1234567' })
    expect(settings.updatedAt).toBeTruthy()
    expect(JSON.stringify(settings)).not.toContain('test-zotero-key-not-real')
    expect((await store.getZoteroSettings()).updatedAt).toBe(settings.updatedAt)
  })
})
