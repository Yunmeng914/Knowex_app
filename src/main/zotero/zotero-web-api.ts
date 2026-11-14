import { randomUUID } from 'node:crypto'
import { annotationKind, type DocumentRecord, type RegionRecord } from '../../shared/domain/models'
import { ConfigStore } from '../storage/config-store'
import { WorkspaceRepository } from '../storage/workspace-repository'

interface ZoteroWriteResponse { success?: Record<string, string>; failed?: Record<string, { message?: string }> }
interface ZoteroWebItem { data?: Record<string, unknown> & { version?: number } }

const WEB_API = 'https://api.zotero.org'

export class ZoteroWebApi {
  constructor(private readonly config: ConfigStore, private readonly repository: WorkspaceRepository) {}

  async exportDocument(documentId: string): Promise<number> {
    const [document, allRegions, credentials] = await Promise.all([
      this.repository.getDocument(documentId),
      this.repository.listRegions(documentId),
      this.config.getZoteroCredentials()
    ])
    if (!document.zoteroParentItemKey) throw new Error('当前 PDF 没有关联的 Zotero 父文献，无法确定导出位置。')
    const regions = allRegions.filter((region) => region.asset.externalSource !== 'zotero')
    if (!regions.length) return 0
    const payload = {
      itemType: 'note',
      parentItem: document.zoteroParentItemKey,
      note: renderZoteroNote(document, regions),
      tags: [{ tag: 'Knowex' }],
      collections: [],
      relations: {}
    }

    let noteKey = document.zoteroExportNoteKey
    if (noteKey) {
      const current = await this.request(`${WEB_API}/users/${credentials.userId}/items/${noteKey}`, credentials.apiKey, { allowNotFound: true })
      if (current) {
        const body = await current.json() as ZoteroWebItem
        const data = { ...(body.data ?? {}), ...payload, key: noteKey, version: body.data?.version }
        await this.request(`${WEB_API}/users/${credentials.userId}/items/${noteKey}`, credentials.apiKey, { method: 'PUT', body: JSON.stringify(data) })
        return regions.length
      }
      noteKey = undefined
    }

    const response = await this.request(`${WEB_API}/users/${credentials.userId}/items`, credentials.apiKey, {
      method: 'POST',
      body: JSON.stringify([payload]),
      writeToken: randomUUID().replaceAll('-', '').slice(0, 32)
    })
    const result = await response?.json() as ZoteroWriteResponse
    const created = result.success?.['0']
    if (!created) throw new Error(result.failed?.['0']?.message || 'Zotero 没有返回新建笔记的条目 ID。')
    await this.repository.upsertDocument({ ...document, zoteroExportNoteKey: created })
    return regions.length
  }

  private async request(url: string, apiKey: string, options: { method?: string; body?: string; writeToken?: string; allowNotFound?: boolean } = {}): Promise<Response | null> {
    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'Zotero-API-Version': '3',
          'Zotero-API-Key': apiKey,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.writeToken ? { 'Zotero-Write-Token': options.writeToken } : {})
        },
        body: options.body,
        signal: AbortSignal.timeout(20_000)
      })
    } catch (error) { throw new Error('无法连接 Zotero Web API，请检查网络后重试。', { cause: error }) }
    if (options.allowNotFound && response.status === 404) return null
    if (response.status === 403) throw new Error('Zotero Web API 拒绝写入。请确认用户 ID 正确，且 API Key 已授予文献库写权限。')
    if (response.status === 412) throw new Error('Zotero 云端条目已发生变化，请同步 Zotero 后重试。')
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Zotero Web API 返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 240)}` : ''}`)
    }
    return response
  }
}

function renderZoteroNote(document: DocumentRecord, regions: RegionRecord[]): string {
  const entries = regions.map((region) => {
    const kind = annotationKind(region)
    const label = kind === 'snapshot' ? '截图' : kind === 'highlight' ? '高亮' : kind === 'underline' ? '下划线' : '页面标签'
    const title = region.note.title || label
    const quote = region.asset.selectedText ? `<blockquote>${escapeHtml(region.asset.selectedText)}</blockquote>` : ''
    const annotation = region.note.annotation ? `<p>${escapeHtml(region.note.annotation).replaceAll('\n', '<br>')}</p>` : ''
    const tags = region.note.tags.length ? `<p><small>${region.note.tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</small></p>` : ''
    return `<h3>第 ${region.asset.anchor.pageOrSlide} 页 · ${escapeHtml(title)}</h3>${quote}${annotation}${tags}<p><small>Knowex ID: ${escapeHtml(region.asset.id)}</small></p>`
  }).join('<hr>')
  return `<h1>Knowex 批注 · ${escapeHtml(document.title)}</h1><p><small>由 Knowex 于 ${new Date().toLocaleString('zh-CN')} 导出。再次导出会更新此笔记。</small></p>${entries}`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
