import { describe, expect, it } from 'vitest'
import { annotationPage, creatorSummary, stripHtml, zoteroColor } from './zotero-mappers'

describe('Zotero field mapping', () => {
  it('uses the PDF page index when Zotero provides a position', () => {
    expect(annotationPage('{"pageIndex":3}', '9')).toBe(4)
  })

  it('falls back to the visible page label', () => {
    expect(annotationPage('invalid', '7')).toBe(7)
  })

  it('normalizes creator, note, and color values', () => {
    expect(creatorSummary([{ lastName: 'Vaswani' }, { lastName: 'Shazeer' }, { lastName: 'Parmar' }])).toBe('Vaswani 等')
    expect(stripHtml('<p>first<br>second</p>')).toBe('first\nsecond')
    expect(zoteroColor('#2ea8e5')).toBe('blue')
  })
})
