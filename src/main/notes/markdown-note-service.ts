import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { annotationKind, type DocumentRecord, type RegionRecord } from '../../shared/domain/models'
import { WorkspaceRepository } from '../storage/workspace-repository'

const START = '<!-- KNOWEX:REGIONS:START -->'
const END = '<!-- KNOWEX:REGIONS:END -->'

export class MarkdownNoteService {
  constructor(private readonly repository: WorkspaceRepository) {}

  async sync(document: DocumentRecord, regions: RegionRecord[]): Promise<void> {
    const workspacePath = await this.repository.ensureWorkspace()
    const notePath = documentNotePath(workspacePath, document)
    await mkdir(dirname(notePath), { recursive: true })
    const legacyPath = join(workspacePath, 'notes', `${document.id}.md`)
    if (legacyPath !== notePath) await migrateLegacyNote(legacyPath, notePath)
    const managed = renderManagedRegions(regions, (assetPath) => relative(dirname(notePath), join(workspacePath, ...assetPath.split('/'))).replaceAll('\\', '/'))
    let next: string

    try {
      const existing = await readFile(notePath, 'utf8')
      next = replaceManagedBlock(existing, managed)
    } catch (error) {
      if (!isMissingFile(error)) throw error
      next = `${renderFrontmatter(document)}\n# ${document.title}\n\n${START}\n${managed}${END}\n\n## 我的笔记\n\n`
    }

    const temporaryPath = `${notePath}.tmp`
    await writeFile(temporaryPath, next, 'utf8')
    await rename(temporaryPath, notePath)
  }
}

export function renderManagedRegions(regions: RegionRecord[], assetHref: (relativePath: string) => string = (path) => `../${path}`): string {
  if (regions.length === 0) return '_尚未保存批注。_\n'
  return `${regions.map((region) => {
    const { asset, note } = region
    const kind = annotationKind(region)
    const rect = asset.anchor.rect
    const fallback = kind === 'highlight' ? `文字高亮 ${asset.id}` : kind === 'underline' ? `文字下划线 ${asset.id}` : kind === 'note' ? `页面标签 ${asset.id}` : kind === 'zotero' ? `Zotero 批注 ${asset.id}` : `截图 ${asset.id}`
    const heading = note.title.trim() || fallback
    const tags = note.tags.map((tag) => `#${tag.replace(/^#/, '').replaceAll(' ', '-')}`).join(' ')
    const conversation = note.conversation.map((message) =>
      `#### ${message.role === 'user' ? '提问' : 'AI 回答'}\n\n${message.content.trim()}\n`
    ).join('\n')
    const evidence = kind === 'snapshot' && asset.relativePath
      ? `![${escapeAlt(heading)}](${assetHref(asset.relativePath)})\n\n`
      : kind === 'highlight' || kind === 'underline'
        ? `> ${(asset.selectedText || '（未保存文字内容）').replaceAll('\n', '\n> ')}\n\n`
        : kind === 'zotero' && asset.selectedText
          ? `> ${asset.selectedText.replaceAll('\n', '\n> ')}\n\n`
        : ''
    return `## 第 ${asset.anchor.pageOrSlide} 页 · ${heading}\n\n` +
      evidence +
      `- 类型：${kind === 'snapshot' ? '截图' : kind === 'highlight' ? '文字高亮' : kind === 'underline' ? '文字下划线' : kind === 'zotero' ? 'Zotero 导入批注' : '页面标签'}\n` +
      `${asset.externalKey ? `- Zotero 条目：\`${asset.externalKey}\`\n` : ''}` +
      `- 记录 ID：\`${asset.id}\`\n` +
      `- 页面位置：x=${rect.x.toFixed(4)}, y=${rect.y.toFixed(4)}, w=${rect.width.toFixed(4)}, h=${rect.height.toFixed(4)}\n` +
      `${asset.color ? `- 颜色：${asset.color}\n` : ''}` +
      `- 标签：${tags || '无'}\n\n` +
      `### 我的批注\n\n${note.annotation.trim() || '（暂无批注）'}\n\n` +
      `${conversation}`
  }).join('\n---\n\n')}\n`
}

export function documentNotePath(workspacePath: string, document: DocumentRecord): string {
  if (document.source !== 'zotero') return join(workspacePath, 'notes', `${document.id}.md`)
  const hierarchy = document.collectionPath?.length ? document.collectionPath : ['Unfiled']
  return join(workspacePath, 'notes', 'Zotero', ...hierarchy.map(safePathSegment), `${document.id}.md`)
}

function safePathSegment(value: string): string {
  const safe = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim()
  return safe || 'Untitled'
}

async function migrateLegacyNote(legacyPath: string, nextPath: string): Promise<void> {
  try {
    await readFile(nextPath)
    return
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }
  try { await rename(legacyPath, nextPath) } catch (error) { if (!isMissingFile(error)) throw error }
}

function renderFrontmatter(document: DocumentRecord): string {
  const zotero = document.zoteroItemKey ? `zotero_item_key: "${escapeYaml(document.zoteroItemKey)}"\n` : ''
  const collection = document.collectionPath?.length ? `collection_path: "${escapeYaml(document.collectionPath.join(' / '))}"\n` : ''
  return `---\nknowex_document_id: "${escapeYaml(document.id)}"\nsource: "${document.source}"\nsource_name: "${escapeYaml(document.sourceName)}"\n${zotero}${collection}---\n`
}

function replaceManagedBlock(existing: string, managed: string): string {
  const start = existing.indexOf(START)
  const end = existing.indexOf(END)
  if (start < 0 || end < start) {
    return `${existing.trimEnd()}\n\n${START}\n${managed}${END}\n`
  }
  return `${existing.slice(0, start + START.length)}\n${managed}${existing.slice(end)}`
}

function escapeYaml(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ')
}

function escapeAlt(value: string): string {
  return value.replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
