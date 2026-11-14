/**
 * Server-side data directory resolution and AES-256-GCM secret storage adapter.
 *
 * Replaces Electron's `app.getPath('userData')` and `safeStorage` so Knowex
 * configuration, AI connections, Zotero credentials, and Exa keys remain
 * encrypted at rest when running in pure Node.js web/server mode.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface SecretCodec {
  isEncryptionAvailable(): boolean
  encryptString(plaintext: string): string
  decryptString(ciphertext: string): string
}

const CIPHER_PREFIX = 'v1:'
const MASTER_KEY_FILENAME = 'master.key'

export function resolveKnowexDataDir(): string {
  const configured = process.env.KNOWEX_DATA_DIR?.trim()
  return configured ? resolve(configured) : resolve(process.cwd(), '.knowex-data')
}

export class NodeSecretVault implements SecretCodec {
  private cachedKey?: Buffer

  constructor(private readonly dataDir: string = resolveKnowexDataDir()) {}

  isEncryptionAvailable(): boolean {
    try {
      return this.getMasterKey().length === 32
    } catch {
      return false
    }
  }

  encryptString(plaintext: string): string {
    const key = this.getMasterKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${CIPHER_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
  }

  decryptString(ciphertext: string): string {
    if (!ciphertext.startsWith(CIPHER_PREFIX)) {
      throw new Error('Saved credential uses an incompatible desktop key format. Please re-enter the API key in Settings.')
    }
    const parts = ciphertext.slice(CIPHER_PREFIX.length).split(':')
    if (parts.length !== 3) {
      throw new Error('Stored credential payload is malformed.')
    }
    const [ivB64, tagB64, dataB64] = parts
    const key = this.getMasterKey()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final()
    ])
    return decrypted.toString('utf8')
  }

  private getMasterKey(): Buffer {
    if (this.cachedKey) return this.cachedKey

    // Prefer an explicit environment key so hosted deployments can inject a stable secret.
    const envKey = process.env.KNOWEX_ENCRYPTION_KEY?.trim()
    if (envKey) {
      this.cachedKey = normalizeMasterKey(envKey)
      return this.cachedKey
    }

    const keyPath = join(this.dataDir, MASTER_KEY_FILENAME)
    try {
      const existing = readFileSync(keyPath, 'utf8').trim()
      if (existing) {
        this.cachedKey = normalizeMasterKey(existing)
        return this.cachedKey
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }

    mkdirSync(dirname(keyPath), { recursive: true })
    const generated = randomBytes(32)
    writeFileSync(keyPath, `${generated.toString('hex')}\n`, { encoding: 'utf8', mode: 0o600 })
    this.cachedKey = generated
    return this.cachedKey
  }
}

function normalizeMasterKey(raw: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length === 32) {
    return decoded
  }
  // Derive a deterministic 256-bit key if a passphrase-style secret was provided.
  return createHash('sha256').update(raw, 'utf8').digest()
}
