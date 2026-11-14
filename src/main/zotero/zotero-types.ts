import type { AnnotationColor } from '../../shared/domain/models'

export interface ZoteroCreator { firstName?: string; lastName?: string; name?: string }
export interface ZoteroTag { tag?: string }

export interface ZoteroItem {
  key?: string
  data?: {
    key?: string
    itemType?: string
    parentItem?: string
    title?: string
    filename?: string
    contentType?: string
    creators?: ZoteroCreator[]
    date?: string
    note?: string
    tags?: ZoteroTag[]
    annotationType?: string
    annotationText?: string
    annotationComment?: string
    annotationColor?: string
    annotationPageLabel?: string
    annotationPosition?: string
    collections?: string[]
  }
}

export interface ZoteroCollection {
  key?: string
  data?: {
    key?: string
    name?: string
    parentCollection?: string | false
  }
}

export interface ZoteroImportedRecord {
  key: string
  page: number
  title: string
  selectedText: string
  annotation: string
  tags: string[]
  color: AnnotationColor
  externalKind: string
}
