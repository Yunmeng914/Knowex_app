/** Verifies that Exa save/test receipts persist while plaintext credentials never enter public DTOs. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  userData: '',
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')),
    getSelectedStorageBackend: vi.fn(() => 'dpapi')
  }
}))

vi.mock('electron', () => ({
  app: { getPath: () => electronMock.userData },
  safeStorage: electronMock.safeStorage
}))

const { ExaSettingsStore } = await import('./exa-settings-store')
const tempDirs: string[] = []

async function makeStore(): Promise<{ store: InstanceType<typeof ExaSettingsStore>; settingsPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'knowex-exa-settings-'))
  tempDirs.push(dir)
  electronMock.userData = dir
  return { store: new ExaSettingsStore(), settingsPath: join(dir, 'exa.json') }
}

beforeEach(() => {
  electronMock.safeStorage.encryptString.mockClear()
  electronMock.safeStorage.decryptString.mockClear()
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('ExaSettingsStore audit metadata', () => {
  it('returns a durable save timestamp without exposing the plaintext key', async () => {
    const { store, settingsPath } = await makeStore()

    const settings = await store.save({ apiKey: 'test-key-not-real' })

    expect(settings).toMatchObject({ configured: true })
    expect(settings.updatedAt).toBeTruthy()
    expect(JSON.stringify(settings)).not.toContain('test-key-not-real')
    expect(await readFile(settingsPath, 'utf8')).not.toContain('test-key-not-real')
  })

  it('persists the latest sanitized test result and clears it after key replacement', async () => {
    const { store } = await makeStore()
    await store.save({ apiKey: 'first-test-key' })
    await store.saveTestResult({ success: true, message: 'Exa is ready.', latencyMs: 42, checkedAt: '2026-08-18T09:00:00.000Z' })

    expect((await store.getPublicSettings()).lastTest).toMatchObject({ success: true, latencyMs: 42 })

    const replaced = await store.save({ apiKey: 'second-test-key' })
    expect(replaced.lastTest).toBeUndefined()
  })
})
