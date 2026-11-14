import type { AnnotationColor } from '../../shared/domain/models'
import type { ZoteroCreator } from './zotero-types'

export function fileStem(filename: string): string { return filename.replace(/\.pdf$/i, '') }

export function creatorSummary(creators?: ZoteroCreator[]): string | undefined {
  if (!creators?.length) return undefined
  const names = creators.map((creator) => creator.lastName || creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(' ')).filter(Boolean)
  if (!names.length) return undefined
  return names.length > 2 ? `${names[0]} 等` : names.join('、')
}

export function stripHtml(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()
}

export function annotationPage(position?: string, label?: string): number {
  try {
    const parsed = JSON.parse(position || '{}') as { pageIndex?: number }
    if (Number.isInteger(parsed.pageIndex) && Number(parsed.pageIndex) >= 0) return Number(parsed.pageIndex) + 1
  } catch { /* fall back to the visible page label */ }
  const page = Number.parseInt(label || '', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function annotationTypeName(value: string): string {
  if (value === 'highlight') return '高亮'
  if (value === 'underline') return '下划线'
  if (value === 'image') return '区域批注'
  if (value === 'ink') return '墨迹批注'
  return '批注'
}

export function zoteroColor(value?: string): AnnotationColor {
  const color = value?.toLowerCase() || ''
  if (color.startsWith('#ff66')) return 'red'
  if (color.startsWith('#5fb')) return 'green'
  if (color.startsWith('#2ea')) return 'blue'
  if (color.startsWith('#a28')) return 'purple'
  if (color.startsWith('#e56')) return 'magenta'
  if (color.startsWith('#f19')) return 'orange'
  if (color.startsWith('#aaa')) return 'gray'
  return 'yellow'
}
