import { describe, expect, it } from 'vitest'
import type { ZoteroAttachment } from '../../../../shared/domain/models'
import { buildZoteroCollectionTree } from './ZoteroCollectionTree'

const attachment = (key: string, title: string, collectionPaths?: string[][]): ZoteroAttachment => ({ key, title, attachmentTitle: title, filename: `${title}.pdf`, contentType: 'application/pdf', collectionPaths })

describe('Zotero collection tree', () => {
  it('preserves nested Zotero collections and keeps unfiled items separate', () => {
    const tree = buildZoteroCollectionTree([
      attachment('AAAA1111', 'Transformer', [['01-AI论文精读', '02-Transformer']]),
      attachment('BBBB2222', 'AlexNet', [['01-AI论文精读', '01-深度学习基础']]),
      attachment('CCCC3333', 'Loose paper')
    ], '未分类')
    expect(tree.map((node) => node.name)).toEqual(['01-AI论文精读', '未分类'])
    expect(tree[0].children.map((node) => node.name)).toEqual(['01-深度学习基础', '02-Transformer'])
    expect(tree[1].attachments[0].title).toBe('Loose paper')
  })
})
