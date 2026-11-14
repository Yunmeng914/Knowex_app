import { randomUUID } from 'node:crypto'
import type { CreateMarkupInput, CreateRegionInput, UpdateRegionInput } from '../../shared/contracts/ipc'
import type { RegionRecord, TrashedRegionRecord } from '../../shared/domain/models'
import { MarkdownNoteService } from '../notes/markdown-note-service'
import { WorkspaceRepository } from '../storage/workspace-repository'
import { LocalAssetStore } from './local-asset-store'
import type { ZoteroImportedRecord } from '../zotero/zotero-local-api'

export class RegionService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly assets: LocalAssetStore,
    private readonly notes: MarkdownNoteService
  ) {}

  async create(input: CreateRegionInput): Promise<RegionRecord> {
    const now = new Date().toISOString()
    const assetWithPreview = await this.assets.save(input.pngDataUrl, {
      documentId: input.documentId,
      pageOrSlide: input.pageOrSlide,
      rect: input.rect,
      zoomAtCapture: input.zoomAtCapture
    })
    const persisted: RegionRecord = {
      asset: { ...assetWithPreview, previewDataUrl: undefined },
      note: {
        id: `note-${randomUUID()}`,
        assetId: assetWithPreview.id,
        title: '',
        annotation: '',
        tags: [],
        conversation: [],
        createdAt: now,
        updatedAt: now
      }
    }

    let indexed = false
    try {
      await this.repository.addRegion(persisted)
      indexed = true
      await this.syncDocument(input.documentId)
      return { ...persisted, asset: assetWithPreview }
    } catch (error) {
      if (indexed) await this.repository.deleteRegion(persisted.note.id).catch(() => undefined)
      await this.assets.delete(assetWithPreview).catch(() => undefined)
      throw error
    }
  }

  async createMarkup(input: CreateMarkupInput): Promise<RegionRecord> {
    const now = new Date().toISOString()
    const prefix = input.kind === 'highlight' ? 'H' : input.kind === 'underline' ? 'U' : 'N'
    const assetId = `${prefix}-${now.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`
    const record: RegionRecord = {
      asset: {
        id: assetId,
        kind: input.kind,
        anchor: {
          documentId: input.documentId,
          pageOrSlide: input.pageOrSlide,
          rect: input.rect,
          zoomAtCapture: input.zoomAtCapture
        },
        rects: input.rects,
        selectedText: input.selectedText?.trim(),
        color: input.color,
        createdAt: now
      },
      note: {
        id: `note-${randomUUID()}`,
        assetId,
        title: '',
        annotation: '',
        tags: [],
        conversation: [],
        createdAt: now,
        updatedAt: now
      }
    }

    let indexed = false
    try {
      await this.repository.addRegion(record)
      indexed = true
      await this.syncDocument(input.documentId)
      return record
    } catch (error) {
      if (indexed) await this.repository.deleteRegion(record.note.id).catch(() => undefined)
      throw error
    }
  }

  async update(input: UpdateRegionInput): Promise<RegionRecord> {
    const region = await this.repository.getRegion(input.regionId)
    const updated: RegionRecord = {
      ...region,
      asset: { ...region.asset, color: input.color ?? region.asset.color },
      note: {
        ...region.note,
        title: input.title.trim(),
        annotation: input.annotation.trim(),
        tags: [...new Set(input.tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))],
        conversation: input.conversation,
        updatedAt: new Date().toISOString()
      }
    }
    await this.repository.updateRegion(updated)
    await this.syncDocument(region.asset.anchor.documentId)
    return this.withPreview(updated)
  }

  async delete(regionId: string): Promise<void> {
    const entry = await this.repository.trashRegion(regionId)
    await this.syncDocument(entry.region.asset.anchor.documentId)
  }

  async listTrash(documentId?: string): Promise<TrashedRegionRecord[]> {
    await this.purgeExpired()
    return Promise.all((await this.repository.listTrash(documentId)).map(async (entry) => ({ ...entry, region: await this.withPreview(entry.region) })))
  }

  async restore(regionId: string): Promise<RegionRecord> {
    const region = await this.repository.restoreRegion(regionId)
    await this.syncDocument(region.asset.anchor.documentId)
    return this.withPreview(region)
  }

  async purge(regionId: string): Promise<void> {
    const region = await this.repository.purgeRegion(regionId)
    await this.assets.delete(region.asset)
  }

  async purgeExpired(): Promise<number> {
    const regions = await this.repository.purgeExpiredTrash()
    await Promise.all(regions.map((region) => this.assets.delete(region.asset)))
    return regions.length
  }

  async list(documentId: string): Promise<RegionRecord[]> {
    return Promise.all((await this.repository.listRegions(documentId)).map((region) => this.withPreview(region)))
  }

  async importZotero(documentId: string, items: ZoteroImportedRecord[]): Promise<number> {
    const existing = await this.repository.listRegions(documentId)
    const existingKeys = new Set(existing.map((region) => region.asset.externalKey).filter(Boolean))
    const now = new Date().toISOString()
    const records: RegionRecord[] = items.filter((item) => !existingKeys.has(item.key)).map((item, index) => {
      const assetId = `Z-${item.key}`
      return {
        asset: {
          id: assetId,
          kind: 'zotero',
          anchor: {
            documentId,
            pageOrSlide: Math.max(1, item.page),
            rect: { x: 0, y: Math.min(0.95, index * 0.015), width: 0.001, height: 0.001 },
            zoomAtCapture: 1
          },
          selectedText: item.selectedText,
          color: item.color,
          externalSource: 'zotero',
          externalKey: item.key,
          externalKind: item.externalKind,
          createdAt: now
        },
        note: {
          id: `note-${randomUUID()}`,
          assetId,
          title: item.title,
          annotation: item.annotation,
          tags: item.tags,
          conversation: [],
          createdAt: now,
          updatedAt: now
        }
      }
    })
    await this.repository.addRegions(records)
    if (records.length) await this.syncDocument(documentId)
    return records.length
  }

  private async withPreview(region: RegionRecord): Promise<RegionRecord> {
    return { ...region, asset: await this.assets.withPreview(region.asset) }
  }

  private async syncDocument(documentId: string): Promise<void> {
    const [document, regions] = await Promise.all([
      this.repository.getDocument(documentId),
      this.repository.listRegions(documentId)
    ])
    await this.notes.sync(document, regions)
  }
}
