import type { DocumentRecord } from './document'
import type { RegionRecord, TrashedRegionRecord } from './annotation'

export interface WorkspaceIndex {
  version: 1
  documents: DocumentRecord[]
  regions: RegionRecord[]
  trash?: TrashedRegionRecord[]
  updatedAt: string
}

export interface WorkspaceStatus {
  path: string | null
  ready: boolean
}

export interface WorkspacePaths {
  workspacePath: string | null
  notesDirectory: string | null
  temporaryDirectory: string | null
  recycleBinIndexPath: string | null
  documentNotePath: string | null
}
