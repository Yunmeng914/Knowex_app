import { dialog } from 'electron'
import { createHash } from 'node:crypto'
import { copyFile, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { DocumentKind, DocumentRecord, OpenDocumentResult } from '../../shared/domain/models'
import { WorkspaceRepository } from '../storage/workspace-repository'
import { PresentationConverter } from './presentation-converter'
import { ConfigStore } from '../storage/config-store'

export class DocumentService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly converter: PresentationConverter,
    private readonly config: ConfigStore
  ) {}

  async openFromDialog(): Promise<OpenDocumentResult | null> {
    const language = await this.config.getLanguage()
    const selection = await dialog.showOpenDialog({
      title: language === 'zh-CN' ? '打开科研文献' : 'Open a Research Document',
      properties: ['openFile'],
      filters: [
        { name: language === 'zh-CN' ? '科研文献' : 'Research Documents', extensions: ['pdf', 'ppt', 'pptx'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'PowerPoint', extensions: ['ppt', 'pptx'] }
      ]
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    return this.openLocal(selection.filePaths[0])
  }

  async openLocal(sourcePath: string): Promise<OpenDocumentResult> {
    const workspacePath = await this.repository.ensureWorkspace()
    const extension = extname(sourcePath).toLowerCase().slice(1)
    if (!['pdf', 'ppt', 'pptx'].includes(extension)) throw new Error('Knowex supports PDF, PPT, and PPTX files.')

    const kind = extension as DocumentKind
    const readablePath = kind === 'pdf'
      ? sourcePath
      : await this.converter.convert(sourcePath, join(workspacePath, '.knowex', 'imports'))

    const document: DocumentRecord = {
      id: stableDocumentId(`local:${resolve(sourcePath).toLowerCase()}`),
      title: basename(sourcePath, extname(sourcePath)),
      kind,
      source: 'local',
      sourcePath: readablePath,
      sourceName: basename(sourcePath),
      openedAt: new Date().toISOString()
    }
    await this.repository.upsertDocument(document)
    return this.result(document, await readFile(readablePath))
  }

  async openRecent(documentId: string): Promise<OpenDocumentResult> {
    const document = await this.repository.getDocument(documentId)
    if (!document.sourcePath) throw new Error('The local copy for this document is unavailable. Open it from its source again.')
    const reopened = { ...document, openedAt: new Date().toISOString() }
    await this.repository.upsertDocument(reopened)
    return this.result(reopened, await readFile(document.sourcePath))
  }

  async importBytes(options: {
    identity: string
    title: string
    filename: string
    bytes: Uint8Array
    zoteroItemKey: string
    zoteroParentItemKey?: string
    collectionPath?: string[]
  }): Promise<OpenDocumentResult> {
    const workspacePath = await this.repository.ensureWorkspace()
    const id = stableDocumentId(options.identity)
    const existing = await this.repository.getDocument(id).catch(() => undefined)
    const storedPath = join(workspacePath, '.knowex', 'imports', `${id}.pdf`)
    const temporaryPath = `${storedPath}.tmp`
    await copyFileToBuffer(options.bytes, temporaryPath, storedPath)
    const document: DocumentRecord = {
      id,
      title: options.title || basename(options.filename, extname(options.filename)),
      kind: 'pdf',
      source: 'zotero',
      sourcePath: storedPath,
      sourceName: options.filename,
      zoteroItemKey: options.zoteroItemKey,
      zoteroParentItemKey: options.zoteroParentItemKey,
      zoteroExportNoteKey: existing?.zoteroExportNoteKey,
      collectionPath: options.collectionPath ?? existing?.collectionPath,
      openedAt: new Date().toISOString()
    }
    await this.repository.upsertDocument(document)
    return this.result(document, options.bytes)
  }

  private async result(document: DocumentRecord, bytes: Uint8Array): Promise<OpenDocumentResult> {
    return {
      document,
      bytes: new Uint8Array(bytes),
      regions: await this.repository.listRegions(document.id)
    }
  }
}

export function stableDocumentId(identity: string): string {
  return `doc-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`
}

async function copyFileToBuffer(bytes: Uint8Array, temporaryPath: string, finalPath: string): Promise<void> {
  const { writeFile, rename } = await import('node:fs/promises')
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, finalPath)
}
