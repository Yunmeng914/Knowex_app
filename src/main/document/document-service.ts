/**
 * Document ingestion and workspace reopening service.
 *
 * Replaces Electron's native file dialog with `importUploaded` so browser uploads
 * are stored safely inside the active workspace's `.knowex/imports` folder.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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

  /** Persists a browser-uploaded PDF/PPT/PPTX into the workspace and returns hydrated reader bytes. */
  async importUploaded(options: { filename: string; bytes: Uint8Array }): Promise<OpenDocumentResult> {
    const safeFilename = sanitizeFilename(options.filename)
    const extension = extname(safeFilename).toLowerCase().slice(1)
    if (!['pdf', 'ppt', 'pptx'].includes(extension)) {
      throw new Error('Knowex supports PDF, PPT, and PPTX files.')
    }
    if (options.bytes.byteLength === 0 || options.bytes.byteLength > 100 * 1024 * 1024) {
      throw new Error('Uploaded file must be between 1 byte and 100 MB.')
    }

    const workspacePath = await this.repository.ensureWorkspace()
    const kind = extension as DocumentKind
    // Include content digest so re-uploading the same file reconnects to existing annotations.
    const digest = createHash('sha256').update(options.bytes).digest('hex').slice(0, 16)
    const id = stableDocumentId(`web:${safeFilename.toLowerCase()}:${digest}`)
    const importsDir = join(workspacePath, '.knowex', 'imports')
    await mkdir(importsDir, { recursive: true })

    let storedPath = join(importsDir, `${id}.pdf`)
    let pdfBytes = options.bytes

    if (kind === 'pdf') {
      await copyFileToBuffer(options.bytes, `${storedPath}.tmp`, storedPath)
    } else {
      const stagedSource = join(workspacePath, '.knowex', 'tmp', `${id}.${extension}`)
      await mkdir(join(workspacePath, '.knowex', 'tmp'), { recursive: true })
      await copyFileToBuffer(options.bytes, `${stagedSource}.tmp`, stagedSource)
      try {
        const convertedPath = await this.converter.convert(stagedSource, importsDir)
        if (convertedPath !== storedPath) {
          await rename(convertedPath, storedPath)
        }
        pdfBytes = new Uint8Array(await readFile(storedPath))
      } finally {
        await rm(stagedSource, { force: true }).catch(() => undefined)
      }
    }

    const existing = await this.repository.getDocument(id).catch(() => undefined)
    const document: DocumentRecord = {
      id,
      title: existing?.title || basename(safeFilename, extname(safeFilename)),
      kind,
      source: 'local',
      sourcePath: storedPath,
      sourceName: safeFilename,
      openedAt: new Date().toISOString()
    }
    await this.repository.upsertDocument(document)
    return this.result(document, pdfBytes)
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

function sanitizeFilename(value: string): string {
  const base = basename(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return base || 'document.pdf'
}

async function copyFileToBuffer(bytes: Uint8Array, temporaryPath: string, finalPath: string): Promise<void> {
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, finalPath)
}
