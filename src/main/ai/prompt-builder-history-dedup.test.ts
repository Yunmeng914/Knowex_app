import { describe, expect, it, vi } from 'vitest'
import type { RegionRecord } from '../../shared/domain/models'
import type { LocalAssetStore } from '../assets/local-asset-store'
import type { WorkspaceRepository } from '../storage/workspace-repository'
import { PromptBuilder } from './prompt-builder'

describe('prompt builder history de-duplication', () => {
  it('keeps evidence, history, and current question in separate fields', async () => {
    const createdAt = '2026-07-31T00:00:00.000Z'
    const region: RegionRecord = {
      asset: {
        id: 'asset-1',
        kind: 'highlight',
        selectedText: 'source text',
        anchor: { documentId: 'doc-1', pageOrSlide: 3, rect: { x: 0, y: 0, width: 1, height: 1 }, zoomAtCapture: 1 },
        createdAt
      },
      note: { id: 'region-1', assetId: 'asset-1', title: '', annotation: 'note', tags: [], conversation: [], createdAt, updatedAt: createdAt }
    }
    const builder = new PromptBuilder(
      { getRegion: vi.fn().mockResolvedValue(region) } as unknown as WorkspaceRepository,
      { readDataUrl: vi.fn() } as unknown as LocalAssetStore
    )

    const request = await builder.build({
      regionId: 'region-1',
      question: 'current question',
      history: [{ role: 'user', content: 'old question' }, { role: 'assistant', content: 'old answer' }]
    })

    expect(request.evidenceText).toContain('source text')
    expect(request.evidenceText).not.toContain('old question')
    expect(request.evidenceText).not.toContain('current question')
    expect(request.messages.map((message) => message.content)).toEqual([
      'old question',
      'old answer',
      expect.stringContaining('current question')
    ])
  })
})
