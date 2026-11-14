import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentRecord, RegionRecord, TrashedRegionRecord, WorkspaceIndex } from '../../shared/domain/models'
import { ConfigStore } from './config-store'

const EMPTY_INDEX = (): WorkspaceIndex => ({
  version: 1,
  documents: [],
  regions: [],
  trash: [],
  updatedAt: new Date().toISOString()
})

export class WorkspaceRepository {
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly config: ConfigStore) {}

  async ensureWorkspace(): Promise<string> {
    const workspacePath = await this.requirePath()
    await Promise.all([
      mkdir(join(workspacePath, '.knowex', 'imports'), { recursive: true }),
      mkdir(join(workspacePath, '.knowex', 'tmp'), { recursive: true }),
      mkdir(join(workspacePath, 'assets', 'regions'), { recursive: true }),
      mkdir(join(workspacePath, 'notes'), { recursive: true })
    ])
    const indexPath = this.indexPath(workspacePath)
    try {
      await readFile(indexPath)
    } catch (error) {
      if (!isMissingFile(error)) throw error
      await this.writeIndex(workspacePath, EMPTY_INDEX())
    }
    return workspacePath
  }

  async readIndex(): Promise<WorkspaceIndex> {
    const workspacePath = await this.ensureWorkspace()
    try {
      const parsed = JSON.parse(await readFile(this.indexPath(workspacePath), 'utf8')) as WorkspaceIndex
      if (parsed.version !== 1 || !Array.isArray(parsed.documents) || !Array.isArray(parsed.regions)) {
        throw new Error('Unsupported workspace index format.')
      }
      return { ...parsed, trash: Array.isArray(parsed.trash) ? parsed.trash : [] }
    } catch (error) {
      throw new Error('The Knowex workspace index is damaged or unreadable.', { cause: error })
    }
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    const workspacePath = await this.config.getWorkspacePath()
    if (!workspacePath) return []
    return (await this.readIndex()).documents.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  }

  async upsertDocument(document: DocumentRecord): Promise<void> {
    await this.mutate((index) => {
      index.documents = [document, ...index.documents.filter((item) => item.id !== document.id)]
    })
  }

  async getDocument(documentId: string): Promise<DocumentRecord> {
    const document = (await this.readIndex()).documents.find((item) => item.id === documentId)
    if (!document) throw new Error('This document is not present in the current workspace.')
    return document
  }

  async listRegions(documentId: string): Promise<RegionRecord[]> {
    return (await this.readIndex()).regions
      .filter((region) => region.asset.anchor.documentId === documentId)
      .sort((a, b) => a.asset.createdAt.localeCompare(b.asset.createdAt))
  }

  async getRegion(regionId: string): Promise<RegionRecord> {
    const region = (await this.readIndex()).regions.find((item) => item.note.id === regionId)
    if (!region) throw new Error('The selected region no longer exists.')
    return region
  }

  async addRegion(region: RegionRecord): Promise<void> {
    await this.mutate((index) => {
      index.regions.push(region)
    })
  }

  async addRegions(regions: RegionRecord[]): Promise<void> {
    if (!regions.length) return
    await this.mutate((index) => { index.regions.push(...regions) })
  }

  async updateRegion(region: RegionRecord): Promise<void> {
    await this.mutate((index) => {
      const position = index.regions.findIndex((item) => item.note.id === region.note.id)
      if (position < 0) throw new Error('The selected region no longer exists.')
      index.regions[position] = region
    })
  }

  async deleteRegion(regionId: string): Promise<RegionRecord> {
    let deleted: RegionRecord | undefined
    await this.mutate((index) => {
      deleted = index.regions.find((item) => item.note.id === regionId)
      if (!deleted) throw new Error('The selected region no longer exists.')
      index.regions = index.regions.filter((item) => item.note.id !== regionId)
    })
    return deleted as RegionRecord
  }

  async trashRegion(regionId: string): Promise<TrashedRegionRecord> {
    let deleted: TrashedRegionRecord | undefined
    await this.mutate((index) => {
      const region = index.regions.find((item) => item.note.id === regionId)
      if (!region) throw new Error('The selected region no longer exists.')
      const deletedAt = new Date()
      deleted = { region, deletedAt: deletedAt.toISOString(), purgeAfter: new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() }
      index.regions = index.regions.filter((item) => item.note.id !== regionId)
      index.trash = [...(index.trash ?? []), deleted]
    })
    return deleted as TrashedRegionRecord
  }

  async listTrash(documentId?: string): Promise<TrashedRegionRecord[]> {
    return ((await this.readIndex()).trash ?? [])
      .filter((entry) => !documentId || entry.region.asset.anchor.documentId === documentId)
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  async restoreRegion(regionId: string): Promise<RegionRecord> {
    let restored: RegionRecord | undefined
    await this.mutate((index) => {
      const entry = (index.trash ?? []).find((item) => item.region.note.id === regionId)
      if (!entry) throw new Error('The selected annotation is no longer in the trash.')
      restored = entry.region
      index.trash = (index.trash ?? []).filter((item) => item.region.note.id !== regionId)
      if (!index.regions.some((item) => item.note.id === regionId)) index.regions.push(entry.region)
    })
    return restored as RegionRecord
  }

  async purgeRegion(regionId: string): Promise<RegionRecord> {
    let purged: RegionRecord | undefined
    await this.mutate((index) => {
      const entry = (index.trash ?? []).find((item) => item.region.note.id === regionId)
      if (!entry) throw new Error('The selected annotation is no longer in the trash.')
      purged = entry.region
      index.trash = (index.trash ?? []).filter((item) => item.region.note.id !== regionId)
    })
    return purged as RegionRecord
  }

  async purgeExpiredTrash(now = new Date()): Promise<RegionRecord[]> {
    const purged: RegionRecord[] = []
    await this.mutate((index) => {
      const keep: TrashedRegionRecord[] = []
      for (const entry of index.trash ?? []) {
        if (new Date(entry.purgeAfter).getTime() <= now.getTime()) purged.push(entry.region)
        else keep.push(entry)
      }
      index.trash = keep
    })
    return purged
  }

  private async mutate(operation: (index: WorkspaceIndex) => void): Promise<void> {
    const task = this.writeQueue.then(async () => {
      const workspacePath = await this.ensureWorkspace()
      const index = await this.readIndex()
      operation(index)
      index.updatedAt = new Date().toISOString()
      await this.writeIndex(workspacePath, index)
    })
    this.writeQueue = task.catch(() => undefined)
    await task
  }

  private async requirePath(): Promise<string> {
    const workspacePath = await this.config.getWorkspacePath()
    if (!workspacePath) throw new Error('Choose a workspace folder before opening or saving documents.')
    return workspacePath
  }

  private indexPath(workspacePath: string): string {
    return join(workspacePath, '.knowex', 'index.json')
  }

  private async writeIndex(workspacePath: string, index: WorkspaceIndex): Promise<void> {
    const indexPath = this.indexPath(workspacePath)
    const temporaryPath = `${indexPath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, indexPath)
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
