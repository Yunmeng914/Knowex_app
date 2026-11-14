import type { NormalizedRect, RegionRecord } from '../../../../shared/domain/models'
import { annotationKind } from '../../../../shared/domain/models'

const BASE_ALPHA = 0.28
const DIMMING_THRESHOLD = 0.58

export function highlightAlpha(rect: NormalizedRect, regions: RegionRecord[]): number {
  const layers = regions.filter((region) => {
    if (annotationKind(region) !== 'highlight') return false
    const rects = region.asset.rects?.length ? region.asset.rects : [region.asset.anchor.rect]
    return rects.some((candidate) => overlapRatio(rect, candidate) >= 0.12)
  }).length
  if (layers <= 1) return BASE_ALPHA
  const combined = 1 - Math.pow(1 - BASE_ALPHA, layers)
  if (combined <= DIMMING_THRESHOLD) return BASE_ALPHA
  return 1 - Math.pow(1 - DIMMING_THRESHOLD, 1 / layers)
}

export function regionsAtPoint(x: number, y: number, regions: RegionRecord[]): RegionRecord[] {
  return regions.filter((region) => {
    const kind = annotationKind(region)
    if (kind !== 'highlight' && kind !== 'underline') return false
    const rects = region.asset.rects?.length ? region.asset.rects : [region.asset.anchor.rect]
    return rects.some((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
  }).sort((a, b) => a.asset.createdAt.localeCompare(b.asset.createdAt) || a.note.id.localeCompare(b.note.id))
}

function overlapRatio(a: NormalizedRect, b: NormalizedRect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const intersection = width * height
  return intersection / Math.max(0.000001, Math.min(a.width * a.height, b.width * b.height))
}
