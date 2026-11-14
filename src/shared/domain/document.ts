import type { RegionRecord } from './annotation'

export type DocumentKind = 'pdf' | 'ppt' | 'pptx'
export type DocumentSource = 'local' | 'zotero'
export type ReadingMode = 'single' | 'continuous'

export interface DocumentRecord {
  id: string
  title: string
  kind: DocumentKind
  source: DocumentSource
  sourcePath?: string
  sourceName: string
  zoteroItemKey?: string
  zoteroParentItemKey?: string
  zoteroExportNoteKey?: string
  collectionPath?: string[]
  openedAt: string
}

export interface OpenDocumentResult {
  document: DocumentRecord
  bytes: Uint8Array
  regions: RegionRecord[]
}
