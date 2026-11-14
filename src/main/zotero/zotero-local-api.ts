import type { OpenDocumentResult, ZoteroAttachment, ZoteroConnectionStatus } from '../../shared/domain/models'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { DocumentService } from '../document/document-service'
import { annotationPage, annotationTypeName, creatorSummary, fileStem, stripHtml, zoteroColor } from './zotero-mappers'
import { ZOTERO_API, ZoteroLocalClient } from './zotero-local-client'
import type { ZoteroImportedRecord, ZoteroItem } from './zotero-types'
import type { ZoteroCollection } from './zotero-types'
import { collectionPaths } from './zotero-collections'
export type { ZoteroImportedRecord } from './zotero-types'

export class ZoteroLocalApi {
  constructor(private readonly documents: DocumentService, private readonly client = new ZoteroLocalClient()) {}

  async checkConnection(): Promise<ZoteroConnectionStatus> {
    let response: Response
    try {
      response = await fetch(`${ZOTERO_API}/`, { method: 'GET', signal: AbortSignal.timeout(5_000) })
    } catch {
      return { state: 'offline', message: '未检测到 Zotero。请先启动 Zotero 桌面端，并保持它处于运行状态。' }
    }

    const clientVersion = response.headers.get('X-Zotero-Version') ?? undefined
    const apiVersion = response.headers.get('Zotero-API-Version') ?? undefined
    const schemaVersion = response.headers.get('Zotero-Schema-Version') ?? undefined
    if (response.status === 403) return { state: 'disabled', message: `${clientVersion ? `已检测到 Zotero ${clientVersion}` : 'Zotero 已运行'}，但尚未允许本机其他应用访问。请在 Zotero 设置中开启本地 API。`, clientVersion, apiVersion, schemaVersion }
    if (!response.ok) return { state: 'error', message: `Zotero 本地接口返回 HTTP ${response.status}，请重启 Zotero 后重试。` }
    if (apiVersion && apiVersion !== '3') return { state: 'unsupported', message: `当前 Zotero Local API 版本为 ${apiVersion}，Knowex 仅支持版本 3。请更新 Knowex 或 Zotero。`, clientVersion, apiVersion, schemaVersion }
    return { state: 'ready', message: '已连接 Zotero。本地接口负责读取；回写需要单独配置 Web API。', clientVersion, apiVersion: apiVersion ?? '3', schemaVersion }
  }

  async listAttachments(): Promise<ZoteroAttachment[]> {
    const items = await this.client.getItems(`${ZOTERO_API}/users/0/items?itemType=attachment`)
    const attachmentItems = items.filter((item) => {
      const data = item.data ?? {}
      return data.contentType === 'application/pdf' || data.filename?.toLowerCase().endsWith('.pdf')
    })
    const parentKeys = [...new Set(attachmentItems.map((item) => item.data?.parentItem).filter((key): key is string => Boolean(key)))]
    const parents = new Map<string, ZoteroItem>()
    const collections = await this.client.getItems(`${ZOTERO_API}/users/0/collections`).catch(() => []) as ZoteroCollection[]
    for (let index = 0; index < parentKeys.length; index += 50) {
      const keys = parentKeys.slice(index, index + 50)
      const batch = await this.client.getItems(`${ZOTERO_API}/users/0/items?itemKey=${encodeURIComponent(keys.join(','))}`)
      for (const item of batch) {
        const key = item.key ?? item.data?.key
        if (key) parents.set(key, item)
      }
    }

    return attachmentItems.map((item) => {
      const data = item.data ?? {}
      const key = item.key ?? data.key ?? ''
      const parent = data.parentItem ? parents.get(data.parentItem)?.data : undefined
      const filename = data.filename || data.title || `${key}.pdf`
      return {
        key,
        parentItemKey: data.parentItem || undefined,
        title: parent?.title || fileStem(filename) || data.title || key,
        attachmentTitle: data.title || filename,
        filename,
        contentType: data.contentType || '',
        creators: creatorSummary(parent?.creators),
        year: parent?.date?.match(/\b\d{4}\b/)?.[0],
        collectionPaths: collectionPaths(parent?.collections ?? data.collections ?? [], collections)
      }
    }).filter((item) => item.key).sort((a, b) => a.title.localeCompare(b.title))
  }

  async openAttachment(key: string): Promise<OpenDocumentResult> {
    if (!/^[A-Z0-9]{8}$/i.test(key)) throw new Error('Invalid Zotero attachment key.')
    const item = await this.client.getJson<ZoteroItem>(`${ZOTERO_API}/users/0/items/${key}`)
    const itemData = item.data ?? {}
    const parent = itemData.parentItem ? await this.client.getJson<ZoteroItem>(`${ZOTERO_API}/users/0/items/${itemData.parentItem}`) : undefined
    const response = await this.client.get(`${ZOTERO_API}/users/0/items/${key}/file/view/url`)
    const attachmentUrl = new URL((await response.text()).trim())
    if (attachmentUrl.protocol !== 'file:') throw new Error('Zotero 没有返回可读取的本地附件路径。')
    let bytes: Uint8Array
    try { bytes = new Uint8Array(await readFile(fileURLToPath(attachmentUrl))) }
    catch (error) { throw new Error('Zotero 条目存在，但本地 PDF 文件已移动、丢失或无权读取。请先在 Zotero 中确认附件能正常打开。', { cause: error }) }
    const filename = itemData.filename || `${key}.pdf`
    const collections = await this.client.getItems(`${ZOTERO_API}/users/0/collections`).catch(() => []) as ZoteroCollection[]
    return this.documents.importBytes({
      identity: `zotero:user:0:${key}`,
      title: parent?.data?.title || fileStem(filename) || itemData.title || key,
      filename,
      bytes,
      zoteroItemKey: key,
      zoteroParentItemKey: itemData.parentItem || undefined,
      collectionPath: collectionPaths(parent?.data?.collections ?? itemData.collections ?? [], collections)[0]
    })
  }

  async listImportedRecords(attachmentKey: string, parentItemKey?: string): Promise<ZoteroImportedRecord[]> {
    const childGroups = await Promise.all([
      this.client.getItems(`${ZOTERO_API}/users/0/items/${attachmentKey}/children`),
      parentItemKey ? this.client.getItems(`${ZOTERO_API}/users/0/items/${parentItemKey}/children`) : Promise.resolve([])
    ])
    const unique = new Map<string, ZoteroItem>()
    for (const item of childGroups.flat()) {
      const key = item.key ?? item.data?.key
      if (key && (item.data?.itemType === 'annotation' || item.data?.itemType === 'note')) unique.set(key, item)
    }
    return [...unique.values()].filter((item) => {
      const note = stripHtml(item.data?.note || '')
      return item.data?.itemType !== 'note' || !/^Knowex (批注|Annotations)/i.test(note)
    }).map((item, index) => {
      const data = item.data ?? {}
      const key = item.key ?? data.key ?? `zotero-${index}`
      const page = annotationPage(data.annotationPosition, data.annotationPageLabel)
      const note = stripHtml(data.note || '')
      const externalKind = data.itemType === 'annotation' ? data.annotationType || 'annotation' : 'note'
      return {
        key,
        page,
        title: data.itemType === 'note' ? 'Zotero 笔记' : `Zotero ${annotationTypeName(externalKind)}`,
        selectedText: data.annotationText?.trim() || '',
        annotation: data.annotationComment?.trim() || note,
        tags: (data.tags ?? []).map((tag) => tag.tag?.trim()).filter((tag): tag is string => Boolean(tag)),
        color: zoteroColor(data.annotationColor),
        externalKind
      }
    })
  }

}
