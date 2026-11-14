/** Owns AI connection lifecycle, credential binding, capability checks, and renderer-safe projections. */
import { randomUUID } from 'node:crypto'
import type { AIConnectionPublic, AIConnectionTestPublic, AIProvider, AIProviderPresetPublic, AISettingsPublic, AITransport, CapabilityVerificationPublic, CloudAIProvider, CloudAITransport, LocalToolStatus, ModelDiscoveryResult } from '../../shared/domain/models'
import type { DiscoverAIModelsInput, SaveAIConnectionInput, SaveAISettingsInput, TestAIConnectionInput, VerifyAIImageCapabilityInput, VerifyAITextCapabilityInput } from '../../shared/contracts/ipc'
import { ConfigStore, type StoredAIConfigV2, type StoredAIConnection } from '../storage/config-store'
import { CredentialStore } from '../storage/credential-store'
import { AIError } from './ai-errors'
import { AI_PROVIDER_PRESETS, CLOUD_PROVIDER_PRESETS } from './provider-presets'
import { ProviderRegistry } from './provider-registry'
import type { AIRequest } from './ai-types'
import { validateExecutablePath } from './local-tool-detection-service'
import { ModelDiscoveryService } from './model-discovery-service'
import { buildCredentialDestinationFingerprint, destinationsMatch } from './credential-destination'
import { assertEndpointPolicy, endpointOrigin, isLocalCompatibleServiceUrl } from './endpoint-policy'
import { assertAIRequestBudget, TEST_AI_REQUEST_BUDGET } from './request-budget'
import { createVisionTestImage, parseVisionTestAnswer, VISION_TEST_PROMPT } from './vision-capability-test'

const OPENAI_RESPONSES_CAPABILITIES = {
  text: true,
  vision: true,
  streaming: false
}

export class AIConnectionService {
  constructor(
    private readonly config: ConfigStore,
    private readonly credentials: CredentialStore,
    private readonly registry?: ProviderRegistry,
    private readonly modelDiscovery = new ModelDiscoveryService()
  ) {}

  async getSettings(): Promise<AISettingsPublic> {
    return this.toPublic(await this.config.getAIConfig())
  }

  async listConnections(): Promise<AIConnectionPublic[]> {
    return (await this.getSettings()).connections
  }

  getProviderPresets(): AIProviderPresetPublic[] {
    return AI_PROVIDER_PRESETS.map((preset) => ({
      ...preset,
      label: { ...preset.label },
      regions: preset.regions?.map((region) => ({ ...region, label: { ...region.label } })),
      defaultCapabilities: { ...preset.defaultCapabilities },
      capabilities: preset.capabilities ? { ...preset.capabilities } : undefined,
      modelExamples: preset.modelExamples ? [...preset.modelExamples] : undefined,
      helpText: { ...preset.helpText }
    }))
  }

  async saveLegacyOpenAISettings(input: SaveAISettingsInput): Promise<AISettingsPublic> {
    const ai = await this.config.getAIConfig()
    const now = new Date().toISOString()
    const active = this.selectActiveConnection(ai)
    const connection: StoredAIConnection = {
      id: active?.id ?? 'legacy-openai',
      name: active?.name ?? 'OpenAI',
      provider: 'openai',
      transport: 'openai-responses',
      baseUrl: input.baseUrl.replace(/\/$/, ''),
      endpointMode: 'full-endpoint',
      model: input.model.trim(),
      capabilities: active?.capabilities ?? OPENAI_RESPONSES_CAPABILITIES,
      lastTest: active?.lastTest,
      timeoutMs: active?.timeoutMs ?? 90_000,
      createdAt: active?.createdAt ?? now,
      updatedAt: now
    }

    if (input.apiKey?.trim() && !this.credentials.isEncryptionAvailable()) {
      throw new Error('The operating system credential encryption service is unavailable.')
    }
    assertCloudEndpointPolicy(connection)
    const fingerprint = buildCredentialDestinationFingerprint(connection)
    const encryptedKey = input.apiKey?.trim() ? this.credentials.encryptAIKey(input.apiKey) : undefined

    ai.connections = upsertConnection(ai.connections, connection)
    ai.activeConnectionId = connection.id
    if (encryptedKey) {
      ai.encryptedSecrets[connection.id] = encryptedKey
      ai.credentialFingerprints = { ...ai.credentialFingerprints, [connection.id]: fingerprint! }
    } else if (ai.encryptedSecrets[connection.id]) {
      ai.credentialFingerprints = { ...ai.credentialFingerprints, [connection.id]: fingerprint! }
    }
    await this.config.saveAIConfig(ai)
    return this.getSettings()
  }

  async saveConnection(input: SaveAIConnectionInput): Promise<AISettingsPublic> {
    if (isLocalConnectionInput(input)) return this.saveLocalConnection(input)
    this.assertCloudConnection(input.provider, input.transport)
    const ai = await this.config.getAIConfig()
    const existing = input.id ? ai.connections.find((connection) => connection.id === input.id) : undefined
    const now = new Date().toISOString()
    const id = existing?.id ?? input.id ?? randomUUID()
    const baseUrl = input.baseUrl ?? existing?.baseUrl
    const model = input.model ?? existing?.model
    if (!baseUrl) throw new AIError('INVALID_RESPONSE', 'Cloud AI connections require a Base URL.')
    if (!model?.trim()) throw new AIError('MISSING_MODEL', 'Choose a model before saving this connection.')
    const trimmedApiKey = input.apiKey?.trim()
    if (trimmedApiKey && !this.credentials.isEncryptionAvailable()) throw new Error('The operating system credential encryption service is unavailable.')

    const preset = CLOUD_PROVIDER_PRESETS.find((item) => item.provider === input.provider)
    const secretRevision = input.apiKey?.trim() || input.clearApiKey ? (existing?.secretRevision ?? 0) + 1 : existing?.secretRevision
    const candidate: StoredAIConnection = {
      id,
      name: input.name,
      provider: input.provider,
      transport: input.transport,
      baseUrl: baseUrl.replace(/\/$/, ''),
      endpointMode: input.endpointMode ?? existing?.endpointMode ?? 'base-url',
      providerRegion: input.providerRegion ?? existing?.providerRegion,
      modelDiscovery: input.modelDiscovery ?? existing?.modelDiscovery ?? (input.provider === 'custom' ? 'unsupported' : undefined),
      modelListEndpoint: input.modelListEndpoint ?? existing?.modelListEndpoint,
      model: model.trim(),
      secretRevision,
      capabilities: input.capabilities ?? existing?.capabilities ?? preset?.defaultCapabilities ?? { text: true, vision: false, streaming: false },
      timeoutMs: normalizeConnectionTimeoutMs(existing?.timeoutMs ?? 90_000),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    assertCloudEndpointPolicy(candidate)
    const nextCredentialFingerprint = buildCredentialDestinationFingerprint(candidate)
    const savedCredentialFingerprint = existing ? ai.credentialFingerprints?.[existing.id] ?? buildCredentialDestinationFingerprint(existing) : undefined
    const canKeepSecret = Boolean(existing && destinationsMatch(nextCredentialFingerprint, savedCredentialFingerprint))
    if (!existing && !trimmedApiKey) {
      throw new AIError('MISSING_API_KEY', 'Enter an API key before saving a new cloud AI connection.', { retryable: false })
    }
    if (existing && !trimmedApiKey && !input.clearApiKey && !canKeepSecret) {
      throw new AIError('MISSING_API_KEY', 'The API service address or protocol changed. Re-enter the API key to avoid sending an old key to the wrong service.', {
        retryable: false,
        suggestedAction: 'Enter the API key again, then save the connection.'
      })
    }
    const nextFingerprint = connectionConfigurationFingerprint(candidate)
    const existingFingerprint = existing ? connectionConfigurationFingerprint(existing) : undefined
    const canKeepPreviousState = Boolean(existing && nextFingerprint === existingFingerprint)
    const connection: StoredAIConnection = {
      ...candidate,
      lastTest: canKeepPreviousState ? existing?.lastTest : undefined,
      verification: input.verification ?? (canKeepPreviousState ? existing?.verification : undefined),
      verificationFingerprint: input.verification ? nextFingerprint : (canKeepPreviousState ? existing?.verificationFingerprint : undefined)
    }
    const encryptedKey = trimmedApiKey ? this.credentials.encryptAIKey(trimmedApiKey) : undefined
    ai.connections = upsertConnection(ai.connections, connection)
    ai.activeConnectionId = ai.activeConnectionId ?? connection.id
    if (encryptedKey) {
      ai.encryptedSecrets[connection.id] = encryptedKey
      ai.credentialFingerprints = { ...ai.credentialFingerprints, [connection.id]: nextCredentialFingerprint! }
    } else if (input.clearApiKey) {
      delete ai.encryptedSecrets[connection.id]
      const fingerprints = { ...ai.credentialFingerprints }
      delete fingerprints[connection.id]
      ai.credentialFingerprints = fingerprints
    } else if (canKeepSecret && nextCredentialFingerprint) {
      ai.credentialFingerprints = { ...ai.credentialFingerprints, [connection.id]: nextCredentialFingerprint }
    }
    await this.config.saveAIConfig(ai)
    return this.getSettings()
  }

  async setActiveConnection(connectionId: string): Promise<AISettingsPublic> {
    const ai = await this.config.getAIConfig()
    const connection = ai.connections.find((item) => item.id === connectionId)
    if (!connection) {
      throw new AIError('CONNECTION_NOT_FOUND', 'The selected AI connection does not exist.')
    }
    if (!isLocalTransport(connection.transport) && !(await this.credentials.hasAIKey(connection.id))) {
      throw new AIError('MISSING_API_KEY', 'This cloud AI connection has no saved API key. Fill the key before setting it as current.', {
        retryable: false,
        suggestedAction: 'Edit the connection, enter an API key, then test it.'
      })
    }
    ai.activeConnectionId = connectionId
    await this.config.saveAIConfig(ai)
    return this.getSettings()
  }

  async deleteConnection(connectionId: string): Promise<AISettingsPublic> {
    const ai = await this.config.getAIConfig()
    ai.connections = ai.connections.filter((connection) => connection.id !== connectionId)
    delete ai.encryptedSecrets[connectionId]
    const fingerprints = { ...ai.credentialFingerprints }
    delete fingerprints[connectionId]
    ai.credentialFingerprints = fingerprints
    if (ai.activeConnectionId === connectionId) ai.activeConnectionId = ai.connections[0]?.id
    await this.config.saveAIConfig(ai)
    return this.getSettings()
  }

  async testConnection(input: TestAIConnectionInput): Promise<AIConnectionTestPublic> {
    if (!this.registry) throw new AIError('UNSUPPORTED_TRANSPORT', 'AI connector registry is unavailable.')
    if (isLocalConnectionInput(input)) return this.testLocalConnection(input)
    this.assertCloudConnection(input.provider, input.transport)
    const ai = await this.config.getAIConfig()
    const existing = input.id ? ai.connections.find((connection) => connection.id === input.id) : undefined
    const connection = this.connectionFromInput(input, existing)
    assertCloudEndpointPolicy(connection)
    const apiKey = await this.readCloudApiKey(input.apiKey, existing, connection)
    if (!apiKey) throw new AIError('MISSING_API_KEY', 'Enter an API key before testing this connection.')
    const connector = this.registry.get(connection.transport)
    const started = Date.now()
    const request: AIRequest = {
      systemPrompt: 'You are testing an AI connection. Reply briefly.',
      evidenceText: 'Reply with OK.',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      images: []
    }

    let result: AIConnectionTestPublic
    try {
      assertAIRequestBudget(request, TEST_AI_REQUEST_BUDGET)
      const response = await connector.ask(request, { connection: { ...connection, timeoutMs: normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000) }, apiKey, signal: AbortSignal.timeout(normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000)) })
      result = sanitizeTestResult({
        success: true,
        provider: connection.provider,
        transport: connection.transport,
        model: connection.model,
        message: response.text || 'Connection test succeeded.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }, connection)
    } catch (error) {
      result = sanitizeTestResult({
        success: false,
        provider: connection.provider,
        transport: connection.transport,
        model: connection.model,
        message: error instanceof Error ? error.message : 'Connection test failed.',
        errorCode: error instanceof AIError ? error.code : 'UNKNOWN_PROVIDER_ERROR',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }, connection)
    }

    if (existing) {
      const latest = await this.config.getAIConfig()
      latest.connections = latest.connections.map((item) => item.id === existing.id ? { ...item, lastTest: result, updatedAt: new Date().toISOString() } : item)
      await this.config.saveAIConfig(latest)
    }
    return result
  }

  async discoverModels(input: DiscoverAIModelsInput): Promise<ModelDiscoveryResult> {
    if (!this.registry) throw new AIError('UNSUPPORTED_TRANSPORT', 'AI connector registry is unavailable.')
    this.assertCloudConnection(input.provider, input.transport)
    const existing = await this.findExisting(input.id)
    const baseUrl = input.baseUrl ?? existing?.baseUrl
    if (!baseUrl) throw new AIError('INVALID_BASE_URL', 'Enter a Base URL before detecting models.')
    const draftConnection = this.connectionFromInput({ ...input, baseUrl, model: input.model ?? existing?.model ?? 'model-list-only' }, existing, input.model ?? existing?.model ?? 'model-list-only')
    assertCloudEndpointPolicy(draftConnection)
    const apiKey = await this.readCloudApiKey(input.apiKey, existing, draftConnection)
    const discovered = await this.modelDiscovery.discover({
      provider: input.provider,
      transport: input.transport,
      baseUrl,
      endpointMode: input.endpointMode ?? existing?.endpointMode ?? 'base-url',
      modelDiscovery: input.modelDiscovery ?? existing?.modelDiscovery,
      modelListEndpoint: input.modelListEndpoint ?? existing?.modelListEndpoint,
      apiKey,
      currentModel: input.model || existing?.model
    })
    return discovered
  }

  async verifyTextCapability(input: VerifyAITextCapabilityInput): Promise<CapabilityVerificationPublic> {
    if (!this.registry) throw new AIError('UNSUPPORTED_TRANSPORT', 'AI connector registry is unavailable.')
    this.assertCloudConnection(input.provider, input.transport)
    const existing = await this.findExisting(input.id)
    const connection = this.connectionFromInput(input, existing, input.model)
    assertCloudEndpointPolicy(connection)
    const apiKey = await this.readCloudApiKey(input.apiKey, existing, connection)
    const started = Date.now()
    try {
      const request = minimalTextRequest()
      assertAIRequestBudget(request, TEST_AI_REQUEST_BUDGET)
      const response = await this.registry.get(connection.transport).ask(request, { connection: { ...connection, timeoutMs: normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000) }, apiKey, signal: AbortSignal.timeout(normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000)) })
      const ok = response.text.trim().length > 0
      return verificationResult(ok ? 'verified' : 'failed', 'not-tested', connection.model, ok ? 'Text capability verified.' : 'The provider returned no text.', Date.now() - started)
    } catch (error) {
      return verificationResult('failed', 'not-tested', connection.model, error instanceof Error ? error.message : 'Text capability verification failed.', Date.now() - started)
    }
  }

  async verifyImageCapability(input: VerifyAIImageCapabilityInput): Promise<CapabilityVerificationPublic> {
    if (!this.registry) throw new AIError('UNSUPPORTED_TRANSPORT', 'AI connector registry is unavailable.')
    this.assertCloudConnection(input.provider, input.transport)
    if (input.capabilities && !input.capabilities.vision) {
      return verificationResult('not-tested', 'unsupported', input.model, 'This connection is declared as text-only.')
    }
    const existing = await this.findExisting(input.id)
    const connection = this.connectionFromInput(input, existing, input.model)
    if (!connection.capabilities.vision) {
      return verificationResult('not-tested', 'unsupported', connection.model, 'This connection is declared as text-only.')
    }
    assertCloudEndpointPolicy(connection)
    const apiKey = await this.readCloudApiKey(input.apiKey, existing, connection)
    const started = Date.now()
    try {
      const request = minimalImageRequest()
      assertAIRequestBudget(request, TEST_AI_REQUEST_BUDGET)
      const response = await this.registry.get(connection.transport).ask(request, { connection: { ...connection, timeoutMs: normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000) }, apiKey, signal: AbortSignal.timeout(normalizeConnectionTimeoutMs(connection.timeoutMs, 10_000, 45_000)) })
      const parsed = parseVisionTestAnswer(response.text)
      return verificationResult('not-tested', parsed.status, connection.model, parsed.message, Date.now() - started)
    } catch (error) {
      const code = error instanceof AIError ? error.code : undefined
      const status = code === 'UNSUPPORTED_CAPABILITY' ? 'unsupported' : code === 'TIMEOUT' ? 'timeout' : 'failed'
      return verificationResult('not-tested', status, connection.model, error instanceof Error ? error.message : 'Image capability verification failed.', Date.now() - started)
    }
  }

  async getActiveConnection(): Promise<StoredAIConnection> {
    const ai = await this.config.getAIConfig()
    const connection = this.selectActiveConnection(ai)
    if (!connection) throw new AIError('NO_ACTIVE_CONNECTION', 'No active AI connection is configured.')
    return connection
  }

  private connectionFromInput(input: Extract<SaveAIConnectionInput, { provider: CloudAIProvider }>, existing?: StoredAIConnection, modelOverride?: string): StoredAIConnection {
    const now = new Date().toISOString()
    const baseUrl = input.baseUrl ?? existing?.baseUrl
    const model = modelOverride ?? input.model ?? existing?.model
    if (!baseUrl) throw new AIError('INVALID_BASE_URL', 'Cloud AI connections require a Base URL.')
    if (!model?.trim()) throw new AIError('MISSING_MODEL', 'Choose a model before testing this connection.')
    return {
      id: existing?.id ?? input.id ?? 'draft-connection',
      name: input.name,
      provider: input.provider,
      transport: input.transport,
      baseUrl: baseUrl.replace(/\/$/, ''),
      endpointMode: input.endpointMode ?? existing?.endpointMode ?? 'base-url',
      providerRegion: input.providerRegion ?? existing?.providerRegion,
      modelDiscovery: input.modelDiscovery ?? existing?.modelDiscovery,
      modelListEndpoint: input.modelListEndpoint ?? existing?.modelListEndpoint,
      model: model.trim(),
      capabilities: input.capabilities ?? existing?.capabilities ?? { text: true, vision: false, streaming: false },
      verification: input.verification ?? existing?.verification,
      timeoutMs: normalizeConnectionTimeoutMs(existing?.timeoutMs ?? 30_000),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
  }

  private async saveLocalConnection(input: Extract<SaveAIConnectionInput, { provider: 'codex' | 'claude-code' }>): Promise<AISettingsPublic> {
    this.assertLocalConnection(input.provider, input.transport)
    const invalidStatus = await validateExecutablePath(input.executablePath)
    if (invalidStatus) throw new AIError(invalidStatus === 'invalid-path' ? 'LOCAL_TOOL_INVALID_PATH' : 'UNSAFE_EXECUTABLE_PATH', 'Choose a valid local AI tool executable.')
    const ai = await this.config.getAIConfig()
    const existing = input.id ? ai.connections.find((connection) => connection.id === input.id) : undefined
    const now = new Date().toISOString()
    const preset = AI_PROVIDER_PRESETS.find((item) => item.provider === input.provider)
    const connection: StoredAIConnection = {
      id: existing?.id ?? input.id ?? randomUUID(),
      name: input.name.trim(),
      provider: input.provider,
      transport: input.transport,
      executablePath: input.executablePath.trim(),
      model: input.model?.trim() || undefined,
      capabilities: input.capabilities ?? existing?.capabilities ?? preset?.defaultCapabilities ?? { text: true, vision: false, streaming: false },
      localToolStatus: 'unknown',
      localToolVersion: existing?.localToolVersion,
      lastTest: existing?.lastTest,
      verification: input.verification ?? existing?.verification,
      timeoutMs: normalizeConnectionTimeoutMs(existing?.timeoutMs ?? 90_000),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    ai.connections = upsertConnection(ai.connections, connection)
    ai.activeConnectionId = ai.activeConnectionId ?? connection.id
    delete ai.encryptedSecrets[connection.id]
    const fingerprints = { ...ai.credentialFingerprints }
    delete fingerprints[connection.id]
    ai.credentialFingerprints = fingerprints
    await this.config.saveAIConfig(ai)
    return this.getSettings()
  }

  private async testLocalConnection(input: Extract<TestAIConnectionInput, { provider: 'codex' | 'claude-code' }>): Promise<AIConnectionTestPublic> {
    if (!this.registry) throw new AIError('UNSUPPORTED_TRANSPORT', 'AI connector registry is unavailable.')
    this.assertLocalConnection(input.provider, input.transport)
    const invalidStatus = await validateExecutablePath(input.executablePath)
    if (invalidStatus) throw new AIError('LOCAL_TOOL_INVALID_PATH', 'Choose a valid local AI tool executable.')
    const ai = await this.config.getAIConfig()
    const existing = input.id ? ai.connections.find((connection) => connection.id === input.id) : undefined
    const now = new Date().toISOString()
    const connection: StoredAIConnection = {
      id: existing?.id ?? input.id ?? 'draft-local-connection',
      name: input.name.trim(),
      provider: input.provider,
      transport: input.transport,
      executablePath: input.executablePath.trim(),
      model: input.model?.trim() || undefined,
      capabilities: input.capabilities ?? existing?.capabilities ?? { text: true, vision: false, streaming: false },
      timeoutMs: normalizeConnectionTimeoutMs(existing?.timeoutMs ?? 30_000),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const connector = this.registry.get(connection.transport)
    const started = Date.now()
    const request: AIRequest = {
      systemPrompt: 'You are testing a local AI CLI connection. Reply briefly.',
      evidenceText: 'Reply with Knowex CLI connection test passed.',
      messages: [{ role: 'user', content: 'Please only answer: Knowex CLI connection test passed.' }],
      images: []
    }
    let result: AIConnectionTestPublic
    try {
      const response = await connector.ask(request, { connection })
      result = sanitizeTestResult({
        success: true,
        provider: connection.provider,
        transport: connection.transport,
        model: connection.model,
        message: response.text || 'Local tool test succeeded.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }, connection)
    } catch (error) {
      result = sanitizeTestResult({
        success: false,
        provider: connection.provider,
        transport: connection.transport,
        model: connection.model,
        message: error instanceof Error ? error.message : 'Local tool test failed.',
        errorCode: error instanceof AIError ? error.code : 'UNKNOWN_PROVIDER_ERROR',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString()
      }, connection)
    }
    if (existing) {
      const latest = await this.config.getAIConfig()
      latest.connections = latest.connections.map((item) => item.id === existing.id ? {
        ...item,
        localToolStatus: result.success ? 'available' : localStatusFromErrorCode(result.errorCode),
        lastTest: result,
        updatedAt: new Date().toISOString()
      } : item)
      await this.config.saveAIConfig(latest)
    }
    return result
  }

  private assertCloudConnection(provider: string, transport: string): asserts provider is CloudAIProvider {
    const allowedProviders = new Set(CLOUD_PROVIDER_PRESETS.map((preset) => preset.provider))
    const allowedTransports = new Set<CloudAITransport>(['openai-responses', 'openai-chat-completions', 'anthropic-messages'])
    if (!allowedProviders.has(provider as CloudAIProvider) || !allowedTransports.has(transport as CloudAITransport)) {
      throw new AIError('UNSUPPORTED_TRANSPORT', 'Only cloud AI API connections are supported here.')
    }
  }

  private assertLocalConnection(provider: AIProvider, transport: AITransport): void {
    if ((provider === 'codex' && transport === 'codex-cli') || (provider === 'claude-code' && transport === 'claude-code-cli')) return
    throw new AIError('UNSUPPORTED_TRANSPORT', 'The local AI tool provider and transport do not match.')
  }

  private async findExisting(connectionId?: string): Promise<StoredAIConnection | undefined> {
    if (!connectionId) return undefined
    const ai = await this.config.getAIConfig()
    return ai.connections.find((connection) => connection.id === connectionId)
  }

  private async readCloudApiKey(inputApiKey: string | undefined, existing: StoredAIConnection | undefined, next: StoredAIConnection): Promise<string> {
    const apiKey = inputApiKey?.trim()
    if (apiKey) return apiKey
    if (existing) {
      const ai = await this.config.getAIConfig()
      const saved = ai.credentialFingerprints?.[existing.id] ?? buildCredentialDestinationFingerprint(existing)
      if (!destinationsMatch(saved, buildCredentialDestinationFingerprint(next))) {
        throw new AIError('MISSING_API_KEY', 'The API service address or protocol changed. Re-enter the API key to avoid sending an old key to the wrong service.', {
          retryable: false,
          suggestedAction: 'Enter the API key again, then test the connection.'
        })
      }
      return this.credentials.getAIKey(existing.id)
    }
    throw new AIError('MISSING_API_KEY', 'Enter an API key before detecting or testing models.')
  }

  private selectActiveConnection(ai: StoredAIConfigV2): StoredAIConnection | undefined {
    return ai.connections.find((connection) => connection.id === ai.activeConnectionId) ?? ai.connections[0]
  }

  private async toPublic(ai: StoredAIConfigV2): Promise<AISettingsPublic> {
    const connections: AIConnectionPublic[] = []
    for (const connection of ai.connections) {
      connections.push({
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
        configured: isLocalTransport(connection.transport) ? Boolean(connection.executablePath) : await this.credentials.hasAIKey(connection.id),
        hasSecret: isLocalTransport(connection.transport) ? false : await this.credentials.hasAIKey(connection.id),
        active: connection.id === ai.activeConnectionId,
        capabilities: { ...connection.capabilities },
        lastTest: connection.lastTest ? { ...connection.lastTest } : undefined,
        verification: connection.verification ? cloneVerification(connection.verification) : undefined,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt
      })
    }
    return {
      activeConnectionId: ai.activeConnectionId,
      connections
    }
  }
}

function minimalTextRequest(): AIRequest {
  return {
    systemPrompt: 'You are testing an AI connection. Reply with OK only.',
    evidenceText: 'Reply only: OK',
    messages: [{ role: 'user', content: 'Reply only: OK' }],
    images: []
  }
}

function minimalImageRequest(): AIRequest {
  return {
    systemPrompt: 'You are testing image input. Return only the requested JSON.',
    evidenceText: VISION_TEST_PROMPT,
    messages: [{ role: 'user', content: VISION_TEST_PROMPT }],
    images: [createVisionTestImage()]
  }
}

function verificationResult(
  textStatus: CapabilityVerificationPublic['text']['status'],
  imageStatus: CapabilityVerificationPublic['image']['status'],
  model: string | undefined,
  message: string,
  latencyMs?: number
): CapabilityVerificationPublic {
  const checkedAt = new Date().toISOString()
  const suffix = typeof latencyMs === 'number' ? ` (${latencyMs} ms)` : ''
  return {
    text: {
      status: textStatus,
      checkedAt: textStatus === 'not-tested' ? undefined : checkedAt,
      model: textStatus === 'not-tested' ? undefined : model,
      message: textStatus === 'not-tested' ? undefined : `${message}${suffix}`
    },
    image: {
      status: imageStatus,
      checkedAt: imageStatus === 'not-tested' ? undefined : checkedAt,
      model: imageStatus === 'not-tested' ? undefined : model,
      message: imageStatus === 'not-tested' ? undefined : `${message}${suffix}`
    }
  }
}

function cloneVerification(verification: CapabilityVerificationPublic): CapabilityVerificationPublic {
  return {
    text: { ...verification.text },
    image: { ...verification.image }
  }
}

function upsertConnection(connections: StoredAIConnection[], next: StoredAIConnection): StoredAIConnection[] {
  const index = connections.findIndex((connection) => connection.id === next.id)
  if (index === -1) return [...connections, next]
  return connections.map((connection, currentIndex) => currentIndex === index ? next : connection)
}

function connectionConfigurationFingerprint(connection: StoredAIConnection): string {
  return JSON.stringify({
    provider: connection.provider,
    transport: connection.transport,
    providerRegion: connection.providerRegion,
    baseUrl: connection.baseUrl,
    endpointMode: connection.endpointMode,
    modelDiscovery: connection.modelDiscovery,
    modelListEndpoint: connection.modelListEndpoint,
    model: connection.model,
    executablePath: connection.executablePath,
    capabilities: connection.capabilities,
    secretRevision: connection.secretRevision ?? 0
  })
}

function isLocalConnectionInput(input: SaveAIConnectionInput | TestAIConnectionInput): input is Extract<SaveAIConnectionInput, { provider: 'codex' | 'claude-code' }> {
  return input.provider === 'codex' || input.provider === 'claude-code'
}

function assertCloudEndpointPolicy(connection: StoredAIConnection): void {
  if (!connection.baseUrl || isLocalTransport(connection.transport)) return
  assertEndpointPolicy({
    url: connection.baseUrl,
    provider: connection.provider as CloudAIProvider,
    transport: connection.transport as CloudAITransport,
    allowLocalService: connection.provider === 'custom' && isLocalCompatibleServiceUrl(connection.baseUrl)
  })
  if (connection.modelListEndpoint) {
    assertEndpointPolicy({
      url: connection.modelListEndpoint,
      provider: connection.provider as CloudAIProvider,
      transport: connection.transport as CloudAITransport,
      allowLocalService: connection.provider === 'custom' && isLocalCompatibleServiceUrl(connection.modelListEndpoint)
    })
  }
}

function normalizeConnectionTimeoutMs(value: number | undefined, minimum = 10_000, maximum = 180_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 90_000
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function sanitizeTestResult(result: AIConnectionTestPublic, connection: StoredAIConnection): AIConnectionTestPublic {
  const endpoint = connection.baseUrl ? endpointOrigin(connection.baseUrl) : undefined
  return {
    ...result,
    message: sanitizeDiagnosticMessage(result.message),
    errorCode: result.errorCode,
    endpointOrigin: endpoint
  }
}

function sanitizeDiagnosticMessage(value: string): string {
  return value
    .replace(/authorization\s*:\s*bearer\s+\S+/gi, 'Authorization header hidden')
    .replace(/x-api-key\s*:\s*\S+/gi, 'x-api-key header hidden')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[hidden key]')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, '[user-profile]')
    .slice(0, 300)
}

function isLocalTransport(transport: AITransport): boolean {
  return transport === 'codex-cli' || transport === 'claude-code-cli'
}

function localStatusFromErrorCode(errorCode?: string): LocalToolStatus {
  if (errorCode === 'LOCAL_TOOL_NOT_INSTALLED') return 'not-installed'
  if (errorCode === 'LOCAL_TOOL_DESKTOP_APP_DETECTED') return 'not-installed'
  if (errorCode === 'LOCAL_TOOL_SHIM_DETECTED') return 'npm-shim-detected'
  if (errorCode === 'LOCAL_TOOL_NATIVE_BINARY_NOT_FOUND') return 'executable-found-validation-failed'
  if (errorCode === 'LOCAL_TOOL_INVALID_PATH' || errorCode === 'UNSAFE_EXECUTABLE_PATH') return 'invalid-path'
  if (errorCode === 'LOCAL_TOOL_NOT_AUTHENTICATED') return 'not-authenticated'
  if (errorCode === 'LOCAL_TOOL_VERSION_UNSUPPORTED') return 'version-unsupported'
  if (errorCode === 'LOCAL_TOOL_TIMEOUT' || errorCode === 'REQUEST_TIMEOUT') return 'unavailable'
  if (errorCode?.startsWith('LOCAL_TOOL_')) return 'launch-failed'
  return 'unknown'
}
