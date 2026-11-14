/**
 * Web-mode server workspace manager.
 *
 * Replaces Electron's native directory picker with managed workspaces under
 * `<dataDir>/workspaces/<name>`, auto-provisioning a ready `default` workspace
 * with a sample research PDF on first launch while preserving strict path traversal guards.
 */
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { OpenDocumentResult, WorkspacePaths, WorkspaceStatus } from '../shared/domain/models'
import type { AppServices } from '../main/app-services'
import { buildSampleResearchPdf, SAMPLE_PDF_FILENAME, SAMPLE_PDF_TITLE } from '../main/document/sample-pdf'
import { documentNotePath } from '../main/notes/markdown-note-service'

export interface WebWorkspaceSummary {
  name: string
  path: string
  active: boolean
  documentCount: number
  updatedAt?: string
}

export interface WebWorkspaceList {
  current: string | null
  workspaces: WebWorkspaceSummary[]
}

export interface WebNoteDocument {
  documentId: string
  title: string
  filename: string
  relativePath: string
  content: string
}

export interface WebWorkspaceExport {
  workspaceName: string
  exportedAt: string
  notes: Array<{ path: string; content: string }>
}

const DEFAULT_WORKSPACE_NAME = 'default'
const WORKSPACE_NAME_PATTERN = /^[a-zA-Z0-9._\-\u4e00-\u9fa5 ]{1,64}$/

export class WebWorkspaceManager {
  constructor(private readonly services: AppServices) {}

  get workspacesRoot(): string {
    return join(this.services.config.dataDir, 'workspaces')
  }

  /** Ensures at least one valid workspace is active on boot so the Web UI is immediately usable. */
  async ensureInitialized(): Promise<WorkspaceStatus> {
    await mkdir(this.workspacesRoot, { recursive: true })
    const existingPath = await this.services.config.getWorkspacePath()
    if (existingPath) {
      await this.services.repository.ensureWorkspace()
      return { path: existingPath, ready: true }
    }

    const defaultPath = this.resolveWorkspaceDir(DEFAULT_WORKSPACE_NAME)
    await this.services.config.setWorkspacePath(defaultPath)
    await this.services.repository.ensureWorkspace()
    await this.seedSampleDocumentIfEmpty()
    return { path: defaultPath, ready: true }
  }

  async getStatus(): Promise<WorkspaceStatus> {
    const path = await this.services.config.getWorkspacePath()
    return { path, ready: Boolean(path) }
  }

  async listWorkspaces(): Promise<WebWorkspaceList> {
    await this.ensureInitialized()
    const currentPath = await this.services.config.getWorkspacePath()
    const entries = await readdir(this.workspacesRoot, { withFileTypes: true }).catch(() => [])
    const workspaces: WebWorkspaceSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(this.workspacesRoot, entry.name)
      let documentCount = 0
      let updatedAt: string | undefined
      try {
        const indexRaw = await readFile(join(dir, '.knowex', 'index.json'), 'utf8')
        const parsed = JSON.parse(indexRaw) as { documents?: unknown[]; updatedAt?: string }
        documentCount = Array.isArray(parsed.documents) ? parsed.documents.length : 0
        updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined
      } catch {
        // Newly created or empty folder without index.json yet.
      }
      workspaces.push({
        name: entry.name,
        path: dir,
        active: currentPath === dir,
        documentCount,
        updatedAt
      })
    }

    workspaces.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return {
      current: currentPath ? basename(currentPath) : null,
      workspaces
    }
  }

  async selectWorkspace(name: string): Promise<WorkspaceStatus> {
    const trimmed = name.trim()
    if (!WORKSPACE_NAME_PATTERN.test(trimmed) || trimmed === '.' || trimmed === '..') {
      throw new Error('Workspace name must be 1-64 characters and cannot contain path separators.')
    }
    const targetPath = this.resolveWorkspaceDir(trimmed)
    await mkdir(targetPath, { recursive: true })
    await this.services.config.setWorkspacePath(targetPath)
    await this.services.repository.ensureWorkspace()
    return { path: targetPath, ready: true }
  }

  async getPaths(documentId?: string): Promise<WorkspacePaths> {
    const workspacePath = await this.services.config.getWorkspacePath()
    const document = documentId ? await this.services.repository.getDocument(documentId).catch(() => undefined) : undefined
    return {
      workspacePath,
      notesDirectory: workspacePath ? join(workspacePath, 'notes') : null,
      temporaryDirectory: workspacePath ? join(workspacePath, '.knowex', 'tmp') : null,
      recycleBinIndexPath: workspacePath ? join(workspacePath, '.knowex', 'index.json') : null,
      documentNotePath: workspacePath && document ? documentNotePath(workspacePath, document) : null
    }
  }

  async openSampleDocument(): Promise<OpenDocumentResult> {
    await this.ensureInitialized()
    const docs = await this.services.repository.listDocuments()
    const existing = docs.find((doc) => doc.sourceName === SAMPLE_PDF_FILENAME)
    if (existing) {
      return this.services.documents.openRecent(existing.id)
    }
    const imported = await this.services.documents.importUploaded({
      filename: SAMPLE_PDF_FILENAME,
      bytes: buildSampleResearchPdf()
    })
    const updatedDoc = { ...imported.document, title: SAMPLE_PDF_TITLE }
    await this.services.repository.upsertDocument(updatedDoc)
    return { ...imported, document: updatedDoc }
  }

  async readNoteMarkdown(documentId: string): Promise<WebNoteDocument> {
    const workspacePath = await this.services.repository.ensureWorkspace()
    const document = await this.services.repository.getDocument(documentId)
    const notePath = documentNotePath(workspacePath, document)
    let content: string
    try {
      content = await readFile(notePath, 'utf8')
    } catch {
      // If no region has been saved yet, synthesize the baseline Markdown header cleanly.
      content = `---\nknowex_document_id: "${document.id}"\nsource: "${document.source}"\nsource_name: "${document.sourceName}"\n---\n\n# ${document.title}\n\n_尚未保存批注。_\n`
    }
    return {
      documentId: document.id,
      title: document.title,
      filename: `${sanitizeDownloadName(document.title)}.md`,
      relativePath: relative(workspacePath, notePath).replaceAll('\\', '/'),
      content
    }
  }

  async exportWorkspaceNotes(): Promise<WebWorkspaceExport> {
    const workspacePath = await this.services.repository.ensureWorkspace()
    const notesDir = join(workspacePath, 'notes')
    const notes: Array<{ path: string; content: string }> = []

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          notes.push({
            path: relative(workspacePath, full).replaceAll('\\', '/'),
            content: await readFile(full, 'utf8')
          })
        }
      }
    }

    await walk(notesDir)
    return {
      workspaceName: basename(workspacePath),
      exportedAt: new Date().toISOString(),
      notes
    }
  }

  private async seedSampleDocumentIfEmpty(): Promise<void> {
    const docs = await this.services.repository.listDocuments()
    if (docs.length > 0) return
    const imported = await this.services.documents.importUploaded({
      filename: SAMPLE_PDF_FILENAME,
      bytes: buildSampleResearchPdf()
    })
    await this.services.repository.upsertDocument({ ...imported.document, title: SAMPLE_PDF_TITLE })
  }

  private resolveWorkspaceDir(name: string): string {
    const root = resolve(this.workspacesRoot)
    const target = resolve(root, name)
    const rel = relative(root, target)
    if (isAbsolute(rel) || rel.startsWith(`..${sep}`) || rel === '..' || !rel) {
      throw new Error('Invalid workspace directory path.')
    }
    return target
  }
}

function sanitizeDownloadName(value: string): string {
  const safe = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return safe || 'knowex-note'
}
