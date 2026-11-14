/** Context-isolated bridge; exposes typed IPC calls but no credentials or business logic. */
import { contextBridge, ipcRenderer } from 'electron'
import type { KnowexApi } from '../shared/contracts/ipc'
import { IPC_CHANNELS } from '../shared/contracts/channels'

const api: KnowexApi = {
  workspace: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGet),
    choose: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceChoose),
    paths: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.workspacePaths, documentId),
    open: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpen),
    revealNote: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRevealNote, documentId)
  },
  document: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.documentOpen),
    openRecent: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.documentOpenRecent, documentId),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.documentList)
  },
  region: {
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.regionCreate, input),
    createMarkup: (input) => ipcRenderer.invoke(IPC_CHANNELS.regionCreateMarkup, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.regionUpdate, input),
    delete: (regionId) => ipcRenderer.invoke(IPC_CHANNELS.regionDelete, regionId),
    list: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.regionList, documentId),
    listTrash: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.regionTrashList, documentId),
    restore: (regionId) => ipcRenderer.invoke(IPC_CHANNELS.regionRestore, regionId),
    purge: (regionId) => ipcRenderer.invoke(IPC_CHANNELS.regionPurge, regionId)
  },
  ai: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetSettings),
    listConnections: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetSettings).then((settings) => settings.connections),
    getProviderPresets: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetProviderPresets),
    saveSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiSaveSettings, input),
    saveConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiSaveConnection, input),
    setActiveConnection: (connectionId) => ipcRenderer.invoke(IPC_CHANNELS.aiSetActiveConnection, { connectionId }),
    deleteConnection: (connectionId) => ipcRenderer.invoke(IPC_CHANNELS.aiDeleteConnection, { connectionId }),
    testConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiTestConnection, input),
    discoverModels: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiDiscoverModels, input),
    verifyTextCapability: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiVerifyTextCapability, input),
    verifyImageCapability: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiVerifyImageCapability, input),
    detectLocalTools: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiDetectLocalTools, input),
    testLocalTool: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiTestLocalTool, input),
    ask: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiAsk, input),
    cancel: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.aiCancel, { requestId })
  },
  exa: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.exaGetSettings),
    saveSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.exaSaveSettings, input),
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.exaTestConnection),
    search: (input) => ipcRenderer.invoke(IPC_CHANNELS.exaSearch, input),
    getContent: (input) => ipcRenderer.invoke(IPC_CHANNELS.exaGetContent, input),
    openSource: (url) => ipcRenderer.invoke(IPC_CHANNELS.exaOpenSource, { url })
  },
  preferences: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.preferencesGet),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.preferencesSave, input)
  },
  zotero: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.zoteroCheck),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.zoteroList),
    open: (attachmentKey, options) => ipcRenderer.invoke(IPC_CHANNELS.zoteroOpen, attachmentKey, options),
    getSyncPreference: (attachmentKey) => ipcRenderer.invoke(IPC_CHANNELS.zoteroSyncPreferenceGet, attachmentKey),
    saveSyncPreference: (input) => ipcRenderer.invoke(IPC_CHANNELS.zoteroSyncPreferenceSave, input),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.zoteroGetSettings),
    saveSettings: (input) => ipcRenderer.invoke(IPC_CHANNELS.zoteroSaveSettings, input),
    export: (documentId) => ipcRenderer.invoke(IPC_CHANNELS.zoteroExport, documentId)
  },
  onboarding: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.onboardingGet),
    complete: () => ipcRenderer.invoke(IPC_CHANNELS.onboardingComplete)
  },
  language: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.languageGet),
    set: (language) => ipcRenderer.invoke(IPC_CHANNELS.languageSet, language),
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, language: Parameters<typeof listener>[0]): void => listener(language)
      ipcRenderer.on(IPC_CHANNELS.languageChanged, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.languageChanged, handler)
    }
  },
  clipboard: {
    onImage: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, dataUrl: string): void => listener(dataUrl)
      ipcRenderer.on(IPC_CHANNELS.clipboardImage, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.clipboardImage, handler)
    }
  },
  menu: {
    onCommand: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, command: Parameters<typeof listener>[0]): void => listener(command)
      ipcRenderer.on(IPC_CHANNELS.menuCommand, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.menuCommand, handler)
    }
  }
}

contextBridge.exposeInMainWorld('knowex', api)
