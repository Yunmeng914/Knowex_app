import { describe, expect, it } from 'vitest'
import { sep } from 'node:path'
import { documentNotePath, renderManagedRegions } from './markdown-note-service'

describe('Markdown note renderer', () => {
  it('keeps portable relative image links and anchors', () => {
    const markdown = renderManagedRegions([{
      asset: {
        id: 'R-1',
        relativePath: 'assets/regions/2026-07-16/R-1.png',
        mimeType: 'image/png',
        anchor: { documentId: 'doc-1', pageOrSlide: 8, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, zoomAtCapture: 1 },
        createdAt: '2026-07-16T00:00:00.000Z'
      },
      note: {
        id: 'note-1', assetId: 'R-1', title: '实验图', annotation: '核对数据集。', tags: ['experiment'], conversation: [],
        createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z'
      }
    }])
    expect(markdown).toContain('![实验图](../assets/regions/2026-07-16/R-1.png)')
    expect(markdown).toContain('第 8 页')
    expect(markdown).toContain('x=0.1000')
  })

  it('writes text highlights without inventing an image asset', () => {
    const markdown = renderManagedRegions([{
      asset: {
        id: 'H-1', kind: 'highlight', selectedText: 'saturating nonlinearities are much slower', color: 'yellow',
        rects: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.03 }],
        anchor: { documentId: 'doc-1', pageOrSlide: 3, rect: { x: 0.2, y: 0.3, width: 0.4, height: 0.03 }, zoomAtCapture: 1 },
        createdAt: '2026-07-19T00:00:00.000Z'
      },
      note: {
        id: 'note-2', assetId: 'H-1', title: '', annotation: '关键结论', tags: ['result'], conversation: [],
        createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z'
      }
    }])
    expect(markdown).toContain('类型：文字高亮')
    expect(markdown).toContain('> saturating nonlinearities are much slower')
    expect(markdown).not.toContain('![')
  })

  it('keeps underlines as text evidence', () => {
    const markdown = renderManagedRegions([{
      asset: {
        id: 'U-1', kind: 'underline', selectedText: 'No regularization of any kind was employed.', color: 'orange',
        rects: [{ x: 0.2, y: 0.3, width: 0.5, height: 0.03 }],
        anchor: { documentId: 'doc-1', pageOrSlide: 4, rect: { x: 0.2, y: 0.3, width: 0.5, height: 0.03 }, zoomAtCapture: 1 },
        createdAt: '2026-07-19T00:00:00.000Z'
      },
      note: {
        id: 'note-3', assetId: 'U-1', title: '', annotation: '', tags: [], conversation: [],
        createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z'
      }
    }])
    expect(markdown).toContain('类型：文字下划线')
    expect(markdown).toContain('> No regularization of any kind was employed.')
    expect(markdown).toContain('颜色：orange')
  })

  it('places Zotero notes under their collection hierarchy', () => {
    expect(documentNotePath('C:\\Workspace', {
      id: 'doc-1', title: 'Paper', kind: 'pdf', source: 'zotero', sourceName: 'paper.pdf', collectionPath: ['Research', 'Vision:2026'], openedAt: ''
    })).toContain(`notes${sep}Zotero${sep}Research${sep}Vision_2026${sep}doc-1.md`)
  })
})
