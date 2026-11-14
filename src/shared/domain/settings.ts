/** Renderer-safe settings entities; credentials never cross this domain boundary. */
export type AppLanguage = 'zh-CN' | 'en-US'

export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'kimi' | 'minimax' | 'glm' | 'custom' | 'codex' | 'claude-code'

export type AITransport = 'openai-responses' | 'openai-chat-completions' | 'anthropic-messages' | 'codex-cli' | 'claude-code-cli'
export type AIEndpointMode = 'base-url' | 'full-endpoint'
export type AIAuthScheme = 'bearer' | 'x-api-key'
export type AIEndpointStrategy = 'openai-responses' | 'openai-chat' | 'anthropic-messages' | 'custom-explicit'
export type AIModelDiscovery = 'openai-models' | 'anthropic-models' | 'custom-models-endpoint' | 'unsupported'

export type CloudAIProvider = Exclude<AIProvider, 'codex' | 'claude-code'>

export type CloudAITransport = Exclude<AITransport, 'codex-cli' | 'claude-code-cli'>

export type LocalAIProvider = Exclude<AIProvider, CloudAIProvider>

export type LocalAITransport = Exclude<AITransport, CloudAITransport>

export type LocalToolKind = 'codex' | 'claude-code'

export type LocalToolStatus =
  | 'available'
  | 'native-cli-available'
  | 'winget-cli-available'
  | 'npm-native-binary-available'
  | 'npm-shim-detected'
  | 'desktop-app-detected-cli-not-available'
  | 'executable-found-validation-failed'
  | 'not-installed'
  | 'invalid-path'
  | 'launch-failed'
  | 'version-unsupported'
  | 'not-authenticated'
  | 'unavailable'
  | 'unknown'

export type CapabilityVerificationStatus = 'verified' | 'unsupported' | 'failed' | 'wrong-answer' | 'response-parse-error' | 'timeout' | 'not-tested'

export interface AICapabilities {
  text: boolean
  vision: boolean
  streaming: boolean
}

export interface AIConnectionPublic {
  id: string
  name: string
  provider: AIProvider
  transport: AITransport
  baseUrl?: string
  endpointMode?: AIEndpointMode
  providerRegion?: string
  modelDiscovery?: AIModelDiscovery
  modelListEndpoint?: string
  model?: string
  executablePath?: string
  localToolVersion?: string
  localToolStatus?: LocalToolStatus
  configured: boolean
  hasSecret?: boolean
  active: boolean
  capabilities: AICapabilities
  lastTest?: AIConnectionTestPublic
  verification?: CapabilityVerificationPublic
  /** Audit metadata records configuration changes without exposing the secret. */
  createdAt: string
  updatedAt: string
}

export interface AISettingsPublic {
  activeConnectionId?: string
  connections: AIConnectionPublic[]
}

export interface AIConnectionInput {
  id?: string
  name: string
  provider: AIProvider
  transport: AITransport
  baseUrl?: string
  endpointMode?: AIEndpointMode
  providerRegion?: string
  modelDiscovery?: AIModelDiscovery
  modelListEndpoint?: string
  model?: string
  executablePath?: string
  apiKey?: string
  clearApiKey?: boolean
  capabilities?: AICapabilities
  verification?: CapabilityVerificationPublic
}

export interface AIConnectionTestPublic {
  success: boolean
  provider: AIProvider
  transport: AITransport
  model?: string
  message: string
  errorCode?: string
  endpointOrigin?: string
  latencyMs?: number
  checkedAt: string
}

export interface CapabilityVerificationPublic {
  text: {
    status: 'verified' | 'failed' | 'not-tested'
    checkedAt?: string
    model?: string
    message?: string
  }
  image: {
    status: CapabilityVerificationStatus
    checkedAt?: string
    model?: string
    message?: string
  }
}

export interface AIModelPublic {
  id: string
  displayName?: string
  provider: AIProvider
  transport: AITransport
  recommended: boolean
  declaredCapabilities?: {
    text: boolean
    image?: boolean
  }
  textTest?: {
    status: 'verified' | 'failed' | 'not-tested'
    message?: string
    checkedAt?: string
  }
}

export interface ModelDiscoveryResult {
  success: boolean
  models: AIModelPublic[]
  recommendedModelId?: string
  source: 'provider-api' | 'compatible-api' | 'preset-fallback' | 'manual'
  message: string
  verification?: CapabilityVerificationPublic
}

export interface AIProviderPresetPublic {
  provider: AIProvider
  label: {
    zhCN: string
    enUS: string
  }
  defaultName: string
  defaultTransport: AITransport
  defaultBaseUrl?: string
  regions?: Array<{
    id: string
    label: {
      zhCN: string
      enUS: string
    }
    defaultBaseUrl: string
  }>
  allowCustomBaseUrl?: boolean
  authScheme?: AIAuthScheme
  endpointStrategy?: AIEndpointStrategy
  modelDiscovery?: AIModelDiscovery
  capabilities?: {
    text: boolean
    image: 'supported' | 'unsupported' | 'unknown'
    streaming: 'supported' | 'unsupported' | 'not-enabled'
  }
  modelExamples?: string[]
  baseUrlEditable: boolean
  apiKeyRequired: boolean
  defaultCapabilities: AICapabilities
  modelPlaceholder: string
  helpText: {
    zhCN: string
    enUS: string
  }
  custom: boolean
  localTool?: LocalToolKind
}

export interface LocalToolDetectionPublic {
  tool: LocalToolKind
  installed: boolean
  executablePath?: string
  version?: string
  status: LocalToolStatus
  message: string
  checkedAt: string
}

export interface LocalToolTestPublic {
  success: boolean
  tool: LocalToolKind
  executablePath?: string
  version?: string
  message: string
  errorCode?: string
  latencyMs?: number
  checkedAt: string
}

export interface ZoteroWebSettingsPublic {
  configured: boolean
  userId: string
  /** Time of the latest credential/settings write, retained across app restarts. */
  updatedAt?: string
}

export interface OnboardingStatus {
  completed: boolean
  version: number
  isUpdate: boolean
}

export interface AppSettingsPublic {
  captureShortcut: string
  cleanupTempOnExit: boolean
  zoteroAutoSync: boolean
  confirmAnnotationDelete: boolean
}
