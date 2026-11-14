/** Versioned app configuration store; secrets remain encrypted and writes use atomic replacement. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AICapabilities, AIConnectionTestPublic, AIProvider, AISettingsPublic, AITransport, AppLanguage, AppSettingsPublic, CapabilityVerificationPublic, LocalToolStatus, SaveZoteroSyncPreferenceInput, ZoteroOpenOptions, ZoteroSyncPreference, ZoteroWebSettingsPublic } from '../../shared/domain/models'
import type { SaveAppSettingsInput, SaveZoteroSettingsInput } from '../../shared/contracts/ipc'
import type { CredentialDestinationFingerprint } from '../ai/credential-destination'
import { NodeSecretVault, resolveKnowexDataDir, type SecretCodec } from './secret-vault'

interface AppConfig {
  workspacePath?: string
  language?: AppLanguage
  onboardingCompleted?: boolean
  onboardingVersion?: number
  app?: AppSettingsPublic
  ai: StoredAIConfigV2
  zotero: {
    userId: string
    encryptedApiKey?: string
    updatedAt?: string
    syncDefault?: ZoteroOpenOptions
    syncItems?: Record<string, ZoteroOpenOptions>
  }
}

export interface StoredAIConnection {
  id: string
  name: string
  provider: AIProvider
  transport: AITransport
  baseUrl?: string
  endpointMode?: 'base-url' | 'full-endpoint'
  providerRegion?: string
  modelDiscovery?: 'openai-models' | 'anthropic-models' | 'custom-models-endpoint' | 'unsupported'
  modelListEndpoint?: string
  model?: string
  secretRevision?: number
  executablePath?: string
  localToolVersion?: string
  localToolStatus?: LocalToolStatus
  capabilities: AICapabilities
  lastTest?: AIConnectionTestPublic
  verification?: CapabilityVerificationPublic
  verificationFingerprint?: string
  timeoutMs: number
  createdAt: string
  updatedAt: string
}

export interface StoredAIConfigV2 {
  version: 2
  activeConnectionId?: string
  connections: StoredAIConnection[]
  encryptedSecrets: Record<string, string>
  credentialFingerprints?: Record<string, CredentialDestinationFingerprint>
}

export interface ConfigStoreOptions {
  dataDir?: string
  secretCodec?: SecretCodec
}

const LEGACY_OPENAI_CONNECTION_ID = 'legacy-openai'

const DEFAULT_AI_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1/responses',
  model: 'gpt-5.4-mini'
}

const OPENAI_RESPONSES_CAPABILITIES: AICapabilities = {
  text: true,
  vision: true,
  streaming: false
}

const DEFAULT_APP: AppSettingsPublic = {
  captureShortcut: 'CommandOrControl+Alt+K',
  cleanupTempOnExit: true,
  zoteroAutoSync: true,
  confirmAnnotationDelete: true
}

const CURRENT_ONBOARDING_VERSION = 2

export class ConfigStore {
  readonly dataDir: string
  readonly secretCodec: SecretCodec

  constructor(options: ConfigStoreOptions = {}) {
    this.dataDir = options.dataDir ?? resolveKnowexDataDir()
    this.secretCodec = options.secretCodec ?? new NodeSecretVault(this.dataDir)
  }

  private get configPath(): string {
    return join(this.dataDir, 'config.json')
  }

  async getWorkspacePath(): Promise<string | null> {
    return (await this.read()).workspacePath ?? null
  }

  async setWorkspacePath(workspacePath: string): Promise<void> {
    const config = await this.read()
    config.workspacePath = workspacePath
    await this.write(config)
  }

  async getLanguage(): Promise<AppLanguage> {
    return (await this.read()).language ?? 'zh-CN'
  }

  async setLanguage(language: AppLanguage): Promise<void> {
    const config = await this.read()
    config.language = language
    await this.write(config)
  }

  async getOnboardingStatus(): Promise<{ completed: boolean; version: number; isUpdate: boolean }> {
    const config = await this.read()
    const version = config.onboardingVersion ?? (config.onboardingCompleted ? 1 : 0)
    return { completed: version >= CURRENT_ONBOARDING_VERSION, version, isUpdate: version > 0 && version < CURRENT_ONBOARDING_VERSION }
  }

  async completeOnboarding(): Promise<{ completed: true; version: number; isUpdate: false }> {
    const config = await this.read()
    config.onboardingCompleted = true
    config.onboardingVersion = CURRENT_ONBOARDING_VERSION
    await this.write(config)
    return { completed: true, version: CURRENT_ONBOARDING_VERSION, isUpdate: false }
  }

  async getAppSettings(): Promise<AppSettingsPublic> {
    return { ...DEFAULT_APP, ...(await this.read()).app }
  }

  async saveAppSettings(input: SaveAppSettingsInput): Promise<AppSettingsPublic> {
    const config = await this.read()
    config.app = { ...input, captureShortcut: input.captureShortcut.trim() }
    await this.write(config)
    return this.getAppSettings()
  }

  async getAISettings(): Promise<AISettingsPublic> {
    return aiConfigToPublic(await this.getAIConfig())
  }

  async getAIConfig(): Promise<StoredAIConfigV2> {
    return cloneAIConfig((await this.read()).ai)
  }

  async saveAIConfig(ai: StoredAIConfigV2): Promise<StoredAIConfigV2> {
    const config = await this.read()
    config.ai = cloneAIConfig(ai)
    await this.write(config)
    return this.getAIConfig()
  }

  async getZoteroSettings(): Promise<ZoteroWebSettingsPublic> {
    const config = await this.read()
    return {
      configured: Boolean(config.zotero.userId && config.zotero.encryptedApiKey),
      userId: config.zotero.userId,
      updatedAt: config.zotero.updatedAt
    }
  }

  async getZoteroSyncPreference(attachmentKey: string): Promise<ZoteroSyncPreference> {
    const zotero = (await this.read()).zotero
    const options = zotero.syncItems?.[attachmentKey] ?? zotero.syncDefault
    return { configured: Boolean(options), options: options ?? { importAnnotations: true, exportKnowex: false } }
  }

  async saveZoteroSyncPreference(input: SaveZoteroSyncPreferenceInput): Promise<ZoteroSyncPreference> {
    const config = await this.read()
    if (input.scope === 'default') config.zotero.syncDefault = input.options
    else config.zotero.syncItems = { ...config.zotero.syncItems, [input.attachmentKey]: input.options }
    await this.write(config)
    return this.getZoteroSyncPreference(input.attachmentKey)
  }

  async saveZoteroSettings(input: SaveZoteroSettingsInput): Promise<ZoteroWebSettingsPublic> {
    const config = await this.read()
    config.zotero.userId = input.userId.trim()
    if (input.apiKey?.trim()) {
      if (!this.secretCodec.isEncryptionAvailable()) throw new Error('The credential encryption service is unavailable.')
      config.zotero.encryptedApiKey = this.secretCodec.encryptString(input.apiKey.trim())
    }
    config.zotero.updatedAt = new Date().toISOString()
    await this.write(config)
    return this.getZoteroSettings()
  }

  async getZoteroCredentials(): Promise<{ userId: string; apiKey: string }> {
    const config = await this.read()
    if (!config.zotero.userId || !config.zotero.encryptedApiKey) throw new Error('请先在设置中配置具有写权限的 Zotero Web API Key 和用户 ID。')
    if (!this.secretCodec.isEncryptionAvailable()) throw new Error('The credential encryption service is unavailable.')
    return {
      userId: config.zotero.userId,
      apiKey: this.secretCodec.decryptString(config.zotero.encryptedApiKey)
    }
  }

  private async read(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.configPath, 'utf8')
      const value = JSON.parse(raw) as Partial<AppConfig>
      const ai = normalizeAIConfig(value.ai)
      const config: AppConfig = {
        workspacePath: value.workspacePath,
        language: value.language === 'en-US' ? 'en-US' : 'zh-CN',
        onboardingCompleted: Boolean(value.onboardingCompleted),
        onboardingVersion: typeof value.onboardingVersion === 'number' ? value.onboardingVersion : undefined,
        app: { ...DEFAULT_APP, ...value.app },
        ai: ai.config,
        zotero: {
          userId: value.zotero?.userId ?? '',
          encryptedApiKey: value.zotero?.encryptedApiKey,
          updatedAt: typeof value.zotero?.updatedAt === 'string' ? value.zotero.updatedAt : undefined,
          syncDefault: value.zotero?.syncDefault,
          syncItems: value.zotero?.syncItems
        }
      }
      if (ai.migrated) await this.write(config)
      return config
    } catch (error) {
      if (isMissingFile(error)) {
        return { language: 'zh-CN', app: { ...DEFAULT_APP }, ai: createDefaultAIConfig(), zotero: { userId: '' } }
      }
      throw new Error('Knowex settings could not be read.', { cause: error })
    }
  }

  private async write(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.configPath), { recursive: true })
    const temporaryPath = `${this.configPath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.configPath)
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function createDefaultAIConfig(): StoredAIConfigV2 {
  const now = new Date().toISOString()
  return {
    version: 2,
    activeConnectionId: LEGACY_OPENAI_CONNECTION_ID,
    connections: [{
      id: LEGACY_OPENAI_CONNECTION_ID,
      name: 'OpenAI',
      provider: 'openai',
      transport: 'openai-responses',
      baseUrl: DEFAULT_AI_SETTINGS.baseUrl,
      model: DEFAULT_AI_SETTINGS.model,
      capabilities: { ...OPENAI_RESPONSES_CAPABILITIES },
      timeoutMs: 90_000,
      createdAt: now,
      updatedAt: now
    }],
    encryptedSecrets: {},
    credentialFingerprints: {}
  }
}

function normalizeAIConfig(value: unknown): { config: StoredAIConfigV2; migrated: boolean } {
  if (isStoredAIConfigV2(value)) {
    const normalizedAt = new Date().toISOString()
    const connections = value.connections.map((connection) => {
      // Early V2 builds did not expose these fields, so tolerate missing audit metadata in local files.
      const createdAt = typeof connection.createdAt === 'string' ? connection.createdAt : normalizedAt
      return {
        ...connection,
        capabilities: { ...connection.capabilities },
        lastTest: connection.lastTest ? { ...connection.lastTest } : undefined,
        verification: connection.verification ? cloneVerification(connection.verification) : undefined,
        createdAt,
        updatedAt: typeof connection.updatedAt === 'string' ? connection.updatedAt : createdAt
      }
    })
    const activeConnectionId = connections.some((connection) => connection.id === value.activeConnectionId)
      ? value.activeConnectionId
      : connections[0]?.id
    return {
      config: {
        version: 2,
        activeConnectionId,
        connections,
        encryptedSecrets: { ...value.encryptedSecrets },
        credentialFingerprints: cloneCredentialFingerprints(value.credentialFingerprints)
      },
      migrated: false
    }
  }

  const legacy: { baseUrl: string; model: string; encryptedApiKey?: string } = isLegacyAIConfig(value) ? value : DEFAULT_AI_SETTINGS
  const now = new Date().toISOString()
  return {
    config: {
      version: 2,
      activeConnectionId: LEGACY_OPENAI_CONNECTION_ID,
      connections: [{
        id: LEGACY_OPENAI_CONNECTION_ID,
        name: 'OpenAI',
        provider: 'openai',
        transport: 'openai-responses',
        baseUrl: legacy.baseUrl || DEFAULT_AI_SETTINGS.baseUrl,
        model: legacy.model || DEFAULT_AI_SETTINGS.model,
        capabilities: { ...OPENAI_RESPONSES_CAPABILITIES },
        timeoutMs: 90_000,
        createdAt: now,
        updatedAt: now
      }],
      encryptedSecrets: legacy.encryptedApiKey ? { [LEGACY_OPENAI_CONNECTION_ID]: legacy.encryptedApiKey } : {},
      credentialFingerprints: {}
    },
    migrated: true
  }
}

function isLegacyAIConfig(value: unknown): value is { baseUrl: string; model: string; encryptedApiKey?: string } {
  return Boolean(value && typeof value === 'object' && 'baseUrl' in value && 'model' in value)
}

function isStoredAIConfigV2(value: unknown): value is StoredAIConfigV2 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredAIConfigV2>
  return candidate.version === 2 && Array.isArray(candidate.connections) && isRecordOfStrings(candidate.encryptedSecrets)
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string'))
}

function cloneAIConfig(ai: StoredAIConfigV2): StoredAIConfigV2 {
  return {
    version: 2,
    activeConnectionId: ai.activeConnectionId,
    connections: ai.connections.map((connection) => ({
      ...connection,
      capabilities: { ...connection.capabilities },
      lastTest: connection.lastTest ? { ...connection.lastTest } : undefined,
      verification: connection.verification ? cloneVerification(connection.verification) : undefined
    })),
    encryptedSecrets: { ...ai.encryptedSecrets },
    credentialFingerprints: cloneCredentialFingerprints(ai.credentialFingerprints)
  }
}

function aiConfigToPublic(ai: StoredAIConfigV2): AISettingsPublic {
  return {
    activeConnectionId: ai.activeConnectionId,
    connections: ai.connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      transport: connection.transport,
      baseUrl: connection.baseUrl,
      endpointMode: connection.endpointMode,
      providerRegion: connection.providerRegion,
      modelDiscovery: connection.modelDiscovery,
      modelListEndpoint: connection.modelListEndpoint,
      model: connection.model,
      executablePath: connection.executablePath,
      localToolVersion: connection.localToolVersion,
      localToolStatus: connection.localToolStatus,
      configured: isLocalTransport(connection.transport) ? Boolean(connection.executablePath) : Boolean(ai.encryptedSecrets[connection.id]),
      hasSecret: isLocalTransport(connection.transport) ? false : Boolean(ai.encryptedSecrets[connection.id]),
      active: connection.id === ai.activeConnectionId,
      capabilities: { ...connection.capabilities },
      lastTest: connection.lastTest ? { ...connection.lastTest } : undefined,
      verification: connection.verification ? cloneVerification(connection.verification) : undefined,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    }))
  }
}

function cloneVerification(verification: CapabilityVerificationPublic): CapabilityVerificationPublic {
  return {
    text: { ...verification.text },
    image: { ...verification.image }
  }
}

function isLocalTransport(transport: AITransport): boolean {
  return transport === 'codex-cli' || transport === 'claude-code-cli'
}

function cloneCredentialFingerprints(value: StoredAIConfigV2['credentialFingerprints']): Record<string, CredentialDestinationFingerprint> {
  const result: Record<string, CredentialDestinationFingerprint> = {}
  for (const [id, fingerprint] of Object.entries(value ?? {})) {
    result[id] = { ...fingerprint }
  }
  return result
}
