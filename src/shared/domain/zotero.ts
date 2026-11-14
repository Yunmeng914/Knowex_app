import type { OpenDocumentResult } from './document'

export interface ZoteroAttachment {
  key: string
  parentItemKey?: string
  title: string
  attachmentTitle: string
  filename: string
  contentType: string
  creators?: string
  year?: string
  collectionPaths?: string[][]
}

export interface ZoteroOpenOptions {
  importAnnotations: boolean
  exportKnowex: boolean
}

export interface ZoteroSyncPreference {
  configured: boolean
  options: ZoteroOpenOptions
}

export interface SaveZoteroSyncPreferenceInput {
  attachmentKey: string
  options: ZoteroOpenOptions
  scope: 'default' | 'item'
}

export interface ZoteroOpenResult {
  result: OpenDocumentResult
  importedCount: number
  exportedCount: number
}

export interface ZoteroConnectionStatus {
  state: 'ready' | 'disabled' | 'offline' | 'unsupported' | 'error'
  message: string
  clientVersion?: string
  apiVersion?: string
  schemaVersion?: string
}
