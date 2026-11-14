/** Registers one trusted handler group per domain against the long-lived app services. */
import type { AppLanguage, AppSettingsPublic } from '../../shared/domain/models'
import { createAppServices } from '../app-services'
import type { ConfigStore } from '../storage/config-store'
import { registerDocumentHandlers } from './register-document-handlers'
import { registerExaHandlers } from './register-exa-handlers'
import { registerRegionHandlers } from './register-region-handlers'
import { registerSettingsHandlers } from './register-settings-handlers'
import { registerWorkspaceHandlers } from './register-workspace-handlers'
import { registerZoteroHandlers } from './register-zotero-handlers'

interface HandlerOptions {
  config: ConfigStore
  onLanguageChanged(language: AppLanguage): Promise<void>
  onAppSettingsChanged(settings: AppSettingsPublic): Promise<void>
}

export function registerIpcHandlers({ config, onLanguageChanged, onAppSettingsChanged }: HandlerOptions): ReturnType<typeof createAppServices> {
  const services = createAppServices(config)
  registerWorkspaceHandlers(services)
  registerDocumentHandlers(services)
  registerExaHandlers(services)
  registerRegionHandlers(services)
  registerSettingsHandlers(services, onLanguageChanged, onAppSettingsChanged)
  registerZoteroHandlers(services)
  return services
}
