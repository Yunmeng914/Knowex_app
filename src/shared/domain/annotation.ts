export type AnnotationKind = 'snapshot' | 'highlight' | 'underline' | 'note' | 'zotero'
export type AnnotationColor = 'yellow' | 'red' | 'green' | 'blue' | 'purple' | 'magenta' | 'orange' | 'gray'

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RegionAnchor {
  documentId: string
  pageOrSlide: number
  rect: NormalizedRect
  zoomAtCapture: number
}

export interface RegionAsset {
  id: string
  kind?: AnnotationKind
  relativePath?: string
  mimeType?: 'image/png'
  anchor: RegionAnchor
  createdAt: string
  previewDataUrl?: string
  selectedText?: string
  color?: AnnotationColor
  rects?: NormalizedRect[]
  externalSource?: 'zotero'
  externalKey?: string
  externalKind?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface RegionNote {
  id: string
  assetId: string
  title: string
  annotation: string
  tags: string[]
  conversation: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface RegionRecord {
  asset: RegionAsset
  note: RegionNote
}

export interface TrashedRegionRecord {
  region: RegionRecord
  deletedAt: string
  purgeAfter: string
}

export function annotationKind(region: RegionRecord): AnnotationKind {
  return region.asset.kind ?? 'snapshot'
}
