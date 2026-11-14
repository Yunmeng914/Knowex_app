/** Typed, renderer-visible API exposed by the Web client adapter (and compatible with preload bridge). */
import type {
  AISettingsPublic,
  AIConnectionPublic,
  AIConnectionTestPublic,
  AIProviderPresetPublic,
  AppLanguage,
  AppSettingsPublic,
  CapabilityVerificationPublic,
  DocumentRecord,
  ExaConnectionTestPublic,
  ExaContentPublic,
  ExaSearchPublic,
  ExaSettingsPublic,
  MenuCommand,
  OnboardingStatus,
  OpenDocumentResult,
  RegionRecord,
  TrashedRegionRecord,
  WorkspacePaths,
  WorkspaceStatus,
  LocalToolDetectionPublic,
  LocalToolTestPublic,
  ModelDiscoveryResult,
  ZoteroAttachment,
  ZoteroConnectionStatus,
  ZoteroOpenOptions,
  ZoteroOpenResult,
  SaveZoteroSyncPreferenceInput,
  ZoteroSyncPreference,
  ZoteroWebSettingsPublic
} from '../domain/models'
import type { AskAIInput, CancelAIRequestInput, DeleteAIConnectionInput, DetectLocalToolsInput, DiscoverAIModelsInput, SaveAIConnectionInput, SaveAISettingsInput, SetActiveAIConnectionInput, TestAIConnectionInput, TestLocalToolInput, VerifyAIImageCapabilityInput, VerifyAITextCapabilityInput } from './schemas/ai'
import type { CreateMarkupInput, CreateRegionInput, UpdateRegionInput } from './schemas/annotation'
import type { GetExaContentInput, OpenExaSourceInput, SaveExaSettingsInput, SearchExaInput } from './schemas/exa'
import type { SaveZoteroSettingsInput } from './schemas/zotero'
import type { SaveAppSettingsInput } from './schemas/settings'

export interface WebWorkspaceSummary {
  name: string
  path: string
  active: boolean
  documentCount: number
  updatedAt?: string
}

export interface WebWorkspaceList {
  current: string | null
  workspaces: WebWorkspaceSummary[]
}

export interface WebNoteDocument {
  documentId: string
  title: string
  filename: string
  relativePath: string
  content: string
}

export interface WebWorkspaceExport {
  workspaceName: string
  exportedAt: string
  notes: Array<{ path: string; content: string }>
}

export interface KnowexApi {
  workspace: {
    get(): Promise<WorkspaceStatus>
    choose(): Promise<WorkspaceStatus>
    paths(documentId?: string): Promise<WorkspacePaths>
    open(): Promise<void>
    revealNote(documentId: string): Promise<void>
    listWorkspaces?(): Promise<WebWorkspaceList>
    selectWorkspace?(name: string): Promise<WorkspaceStatus>
    readNote?(documentId: string): Promise<WebNoteDocument>
    exportWorkspace?(): Promise<WebWorkspaceExport>
  }
  document: {
    open(): Promise<OpenDocumentResult | null>
    uploadFile?(file: File): Promise<OpenDocumentResult>
    openSample?(): Promise<OpenDocumentResult>
    openRecent(documentId: string): Promise<OpenDocumentResult>
    list(): Promise<DocumentRecord[]>
  }
  region: {
    create(input: CreateRegionInput): Promise<RegionRecord>
    createMarkup(input: CreateMarkupInput): Promise<RegionRecord>
    update(input: UpdateRegionInput): Promise<RegionRecord>
    delete(regionId: string): Promise<void>
    list(documentId: string): Promise<RegionRecord[]>
    listTrash(documentId?: string): Promise<TrashedRegionRecord[]>
    restore(regionId: string): Promise<RegionRecord>
    purge(regionId: string): Promise<void>
  }
  ai: {
    getSettings(): Promise<AISettingsPublic>
    listConnections(): Promise<AIConnectionPublic[]>
    getProviderPresets(): Promise<AIProviderPresetPublic[]>
    saveSettings(input: SaveAISettingsInput): Promise<AISettingsPublic>
    saveConnection(input: SaveAIConnectionInput): Promise<AISettingsPublic>
    setActiveConnection(connectionId: SetActiveAIConnectionInput['connectionId']): Promise<AISettingsPublic>
    deleteConnection(connectionId: DeleteAIConnectionInput['connectionId']): Promise<AISettingsPublic>
    testConnection(input: TestAIConnectionInput): Promise<AIConnectionTestPublic>
    discoverModels(input: DiscoverAIModelsInput): Promise<ModelDiscoveryResult>
    verifyTextCapability(input: VerifyAITextCapabilityInput): Promise<CapabilityVerificationPublic>
    verifyImageCapability(input: VerifyAIImageCapabilityInput): Promise<CapabilityVerificationPublic>
    detectLocalTools(input?: DetectLocalToolsInput): Promise<LocalToolDetectionPublic[]>
    testLocalTool(input: TestLocalToolInput): Promise<LocalToolTestPublic>
    ask(input: AskAIInput): Promise<string>
    cancel(requestId: CancelAIRequestInput['requestId']): Promise<{ cancelled: boolean }>
  }
  exa: {
    getSettings(): Promise<ExaSettingsPublic>
    saveSettings(input: SaveExaSettingsInput): Promise<ExaSettingsPublic>
    testConnection(): Promise<ExaConnectionTestPublic>
    search(input: SearchExaInput): Promise<ExaSearchPublic>
    getContent(input: GetExaContentInput): Promise<ExaContentPublic>
    openSource(url: OpenExaSourceInput['url']): Promise<void>
  }
  preferences: {
    get(): Promise<AppSettingsPublic>
    save(input: SaveAppSettingsInput): Promise<AppSettingsPublic>
  }
  zotero: {
    check(): Promise<ZoteroConnectionStatus>
    list(): Promise<ZoteroAttachment[]>
    open(attachmentKey: string, options: ZoteroOpenOptions): Promise<ZoteroOpenResult>
    getSyncPreference(attachmentKey: string): Promise<ZoteroSyncPreference>
    saveSyncPreference(input: SaveZoteroSyncPreferenceInput): Promise<ZoteroSyncPreference>
    getSettings(): Promise<ZoteroWebSettingsPublic>
    saveSettings(input: SaveZoteroSettingsInput): Promise<ZoteroWebSettingsPublic>
    export(documentId: string): Promise<number>
  }
  onboarding: {
    get(): Promise<OnboardingStatus>
    complete(): Promise<OnboardingStatus>
  }
  language: {
    get(): Promise<AppLanguage>
    set(language: AppLanguage): Promise<AppLanguage>
    onChanged(listener: (language: AppLanguage) => void): () => void
  }
  clipboard: {
    onImage(listener: (dataUrl: string) => void): () => void
  }
  menu: {
    onCommand(listener: (command: MenuCommand) => void): () => void
  }
}
