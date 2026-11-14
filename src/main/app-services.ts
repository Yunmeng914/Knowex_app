/** Main-process dependency composition; services are constructed once and do not register IPC here. */
import { AIConnectionService } from './ai/ai-connection-service'
import { AIService } from './ai/ai-service'
import { AnthropicMessagesConnector } from './ai/connectors/anthropic-messages-connector'
import { ClaudeCodeCliConnector } from './ai/connectors/claude-code-cli-connector'
import { CodexCliConnector } from './ai/connectors/codex-cli-connector'
import { OpenAIChatConnector } from './ai/connectors/openai-chat-connector'
import { OpenAIResponsesConnector } from './ai/connectors/openai-responses-connector'
import { LocalToolDetectionService } from './ai/local-tool-detection-service'
import { PromptBuilder } from './ai/prompt-builder'
import { ProviderRegistry } from './ai/provider-registry'
import { SecureProcessRunner } from './ai/secure-process-runner'
import { LocalAssetStore } from './assets/local-asset-store'
import { RegionService } from './assets/region-service'
import { DocumentService } from './document/document-service'
import { PresentationConverter } from './document/presentation-converter'
import { ExaClient } from './exa/exa-client'
import { ExaService } from './exa/exa-service'
import { ExaSettingsStore } from './exa/exa-settings-store'
import { MarkdownNoteService } from './notes/markdown-note-service'
import { ConfigStore } from './storage/config-store'
import { CredentialStore } from './storage/credential-store'
import { WorkspaceMaintenance } from './storage/workspace-maintenance'
import { WorkspaceRepository } from './storage/workspace-repository'
import { ZoteroLocalApi } from './zotero/zotero-local-api'
import { ZoteroWebApi } from './zotero/zotero-web-api'

export interface AppServices {
  config: ConfigStore
  repository: WorkspaceRepository
  documents: DocumentService
  assets: LocalAssetStore
  regions: RegionService
  credentials: CredentialStore
  aiConnections: AIConnectionService
  ai: AIService
  exa: ExaService
  localTools: LocalToolDetectionService
  zotero: ZoteroLocalApi
  zoteroWeb: ZoteroWebApi
  maintenance: WorkspaceMaintenance
}

export function createAppServices(config: ConfigStore): AppServices {
  const repository = new WorkspaceRepository(config)
  const documents = new DocumentService(repository, new PresentationConverter(), config)
  const assets = new LocalAssetStore(repository)
  const notes = new MarkdownNoteService(repository)
  const regions = new RegionService(repository, assets, notes)
  const credentials = new CredentialStore(config)
  const registry = new ProviderRegistry()
  const processRunner = new SecureProcessRunner()
  registry.register(new OpenAIResponsesConnector())
  registry.register(new OpenAIChatConnector())
  registry.register(new AnthropicMessagesConnector())
  registry.register(new CodexCliConnector(processRunner))
  registry.register(new ClaudeCodeCliConnector(processRunner))
  const aiConnections = new AIConnectionService(config, credentials, registry)
  const localTools = new LocalToolDetectionService(processRunner)
  const exa = new ExaService(new ExaSettingsStore(), new ExaClient())
  return {
    config,
    repository,
    documents,
    assets,
    regions,
    credentials,
    aiConnections,
    localTools,
    ai: new AIService(aiConnections, credentials, new PromptBuilder(repository, assets), registry),
    exa,
    zotero: new ZoteroLocalApi(documents),
    zoteroWeb: new ZoteroWebApi(config, repository),
    maintenance: new WorkspaceMaintenance(config, regions, assets)
  }
}
