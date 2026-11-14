import { askAIInputSchema, cancelAIRequestInputSchema, deleteAIConnectionInputSchema, detectLocalToolsInputSchema, discoverAIModelsInputSchema, languageSchema, saveAIConnectionInputSchema, saveAISettingsInputSchema, saveAppSettingsInputSchema, setActiveAIConnectionInputSchema, testAIConnectionInputSchema, testLocalToolInputSchema, verifyAIImageCapabilityInputSchema, verifyAITextCapabilityInputSchema } from '../../shared/contracts/ipc'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppLanguage } from '../../shared/domain/models'
import type { AppSettingsPublic } from '../../shared/domain/models'
import type { AppServices } from '../app-services'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerSettingsHandlers(services: AppServices, onLanguageChanged: (language: AppLanguage) => Promise<void>, onAppSettingsChanged: (settings: AppSettingsPublic) => Promise<void>): void {
  const { ai, aiConnections, config, localTools } = services
  registerTrustedHandler(IPC_CHANNELS.aiGetSettings, () => aiConnections.getSettings())
  registerTrustedHandler(IPC_CHANNELS.aiGetProviderPresets, () => aiConnections.getProviderPresets())
  registerTrustedHandler(IPC_CHANNELS.aiSaveSettings, (_, input: unknown) => aiConnections.saveLegacyOpenAISettings(saveAISettingsInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiSaveConnection, (_, input: unknown) => aiConnections.saveConnection(saveAIConnectionInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiSetActiveConnection, (_, input: unknown) => {
    const { connectionId } = setActiveAIConnectionInputSchema.parse(input)
    return aiConnections.setActiveConnection(connectionId)
  })
  registerTrustedHandler(IPC_CHANNELS.aiDeleteConnection, (_, input: unknown) => {
    const { connectionId } = deleteAIConnectionInputSchema.parse(input)
    return aiConnections.deleteConnection(connectionId)
  })
  registerTrustedHandler(IPC_CHANNELS.aiTestConnection, (_, input: unknown) => aiConnections.testConnection(testAIConnectionInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiDiscoverModels, (_, input: unknown) => aiConnections.discoverModels(discoverAIModelsInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiVerifyTextCapability, (_, input: unknown) => aiConnections.verifyTextCapability(verifyAITextCapabilityInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiVerifyImageCapability, (_, input: unknown) => aiConnections.verifyImageCapability(verifyAIImageCapabilityInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiDetectLocalTools, (_, input: unknown) => {
    const parsed = detectLocalToolsInputSchema.parse(input)
    return localTools.detectAll(parsed?.executablePaths)
  })
  registerTrustedHandler(IPC_CHANNELS.aiTestLocalTool, async (_, input: unknown) => {
    const parsed = testLocalToolInputSchema.parse(input)
    const result = await aiConnections.testConnection({
      name: parsed.tool === 'codex' ? 'Codex CLI' : 'Claude Code CLI',
      provider: parsed.tool === 'codex' ? 'codex' : 'claude-code',
      transport: parsed.tool === 'codex' ? 'codex-cli' : 'claude-code-cli',
      executablePath: parsed.executablePath,
      model: parsed.model,
      capabilities: { text: true, vision: false, streaming: false }
    })
    return {
      success: result.success,
      tool: parsed.tool,
      executablePath: parsed.executablePath,
      message: result.message,
      errorCode: result.errorCode,
      latencyMs: result.latencyMs,
      checkedAt: result.checkedAt
    }
  })
  registerTrustedHandler(IPC_CHANNELS.aiAsk, (_, input: unknown) => ai.ask(askAIInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.aiCancel, (_, input: unknown) => {
    const { requestId } = cancelAIRequestInputSchema.parse(input)
    return ai.cancel(requestId)
  })
  registerTrustedHandler(IPC_CHANNELS.preferencesGet, () => config.getAppSettings())
  registerTrustedHandler(IPC_CHANNELS.preferencesSave, async (_, input: unknown) => {
    const settings = saveAppSettingsInputSchema.parse(input)
    await onAppSettingsChanged(settings)
    return config.saveAppSettings(settings)
  })
  registerTrustedHandler(IPC_CHANNELS.onboardingGet, () => config.getOnboardingStatus())
  registerTrustedHandler(IPC_CHANNELS.onboardingComplete, () => config.completeOnboarding())
  registerTrustedHandler(IPC_CHANNELS.languageGet, () => config.getLanguage())
  registerTrustedHandler(IPC_CHANNELS.languageSet, async (_, value: unknown) => {
    const language = languageSchema.parse(value)
    await onLanguageChanged(language)
    return language
  })
}
