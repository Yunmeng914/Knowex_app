import { describe, expect, it, vi } from 'vitest'
import type { RegionRecord } from '../../shared/domain/models'
import type { LocalAssetStore } from '../assets/local-asset-store'
import type { WorkspaceRepository } from '../storage/workspace-repository'
import { PromptBuilder } from './prompt-builder'

const png = 'data:image/png;base64,AAAA'

function region(kind: RegionRecord['asset']['kind']): RegionRecord {
  const createdAt = '2026-07-24T00:00:00.000Z'
  return {
    asset: {
      id: 'asset-1',
      kind,
      selectedText: 'selected evidence',
      anchor: {
        documentId: 'doc-1',
        pageOrSlide: 7,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        zoomAtCapture: 1
      },
      createdAt
    },
    note: {
      id: 'region-1',
      assetId: 'asset-1',
      title: '',
      annotation: 'saved note',
      tags: [],
      conversation: [],
      createdAt,
      updatedAt: createdAt
    }
  }
}

function makeBuilder(record: RegionRecord): PromptBuilder {
  return new PromptBuilder(
    { getRegion: vi.fn().mockResolvedValue(record) } as unknown as WorkspaceRepository,
    { readDataUrl: vi.fn().mockResolvedValue(png) } as unknown as LocalAssetStore
  )
}

describe('PromptBuilder', () => {
  it('builds text annotation evidence without duplicating history', async () => {
    const request = await makeBuilder(region('highlight')).build({
      regionId: 'region-1',
      question: 'What does this mean?',
      annotationContext: 'draft note',
      includeRegionImage: false,
      imageDataUrls: [],
      history: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }]
    })

    expect(request.systemPrompt).toContain('research reading assistant')
    expect(request.evidenceText).not.toContain('Earlier conversation:')
    expect(request.evidenceText).not.toContain('Earlier question')
    expect(request.messages.slice(0, -1).map((message) => message.content)).toEqual(['Earlier question', 'Earlier answer'])
    expect(request.evidenceText).toContain('Selected text: selected evidence')
    expect(request.evidenceText).toContain('Reader note: draft note')
    expect(request.evidenceText).toContain('Page: 7')
    expect(request.evidenceText).not.toContain('Current question:')
    expect(request.messages.at(-1)?.content).toContain('Current question: What does this mean?')
    expect(request.images).toEqual([])
  })

  it('keeps the current snapshot image and transient image attachments', async () => {
    const extra = 'data:image/png;base64,BBBB'
    const request = await makeBuilder(region('snapshot')).build({
      regionId: 'region-1',
      question: 'Read the image',
      annotationContext: '',
      includeRegionImage: true,
      imageDataUrls: [extra],
      history: []
    })

    expect(request.evidenceText).toContain('Reader note: saved note')
    expect(request.images.map((image) => image.dataUrl)).toEqual([png, extra])
  })

  it('can detach the current snapshot image without dropping transient attachments', async () => {
    const extra = 'data:image/png;base64,CCCC'
    const request = await makeBuilder(region('snapshot')).build({
      regionId: 'region-1',
      question: 'Use only the extra image',
      annotationContext: '',
      includeRegionImage: false,
      imageDataUrls: [extra],
      history: []
    })

    expect(request.images.map((image) => image.dataUrl)).toEqual([extra])
  })
})
