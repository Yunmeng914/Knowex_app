import { describe, expect, it } from 'vitest'
import type { NormalizedRect, RegionRecord } from '@shared/domain/models'
import { highlightAlpha, regionsAtPoint } from './highlight-overlap'

const rect: NormalizedRect = { x: 0.1, y: 0.1, width: 0.4, height: 0.04 }
const region = (id: string, offset = 0): RegionRecord => ({
  asset: { id, kind: 'highlight', anchor: { documentId: 'doc', pageOrSlide: 1, rect: { ...rect, y: rect.y + offset }, zoomAtCapture: 1 }, createdAt: `2026-01-0${id}` },
  note: { id, assetId: id, title: '', annotation: '', tags: [], conversation: [], createdAt: '', updatedAt: '' }
})

describe('highlight overlap', () => {
  it('keeps two overlapping colors at their normal intensity below the threshold', () => {
    expect(highlightAlpha(rect, [region('1'), region('2')])).toBe(0.28)
  })

  it('reduces all layers only after combined opacity crosses the threshold', () => {
    const alpha = highlightAlpha(rect, [region('1'), region('2'), region('3')])
    expect(1 - Math.pow(1 - alpha, 3)).toBeLessThanOrEqual(0.581)
    expect(alpha).toBeLessThan(0.28)
  })

  it('returns all selectable layers at a point in stable order', () => {
    expect(regionsAtPoint(0.2, 0.12, [region('2'), region('1'), region('3', 0.3)]).map((item) => item.note.id)).toEqual(['1', '2'])
  })
})
