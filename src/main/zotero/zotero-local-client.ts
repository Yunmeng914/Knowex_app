import type { ZoteroItem } from './zotero-types'

export const ZOTERO_API = 'http://127.0.0.1:23119/api'

export class ZoteroLocalClient {
  async getItems(url: string): Promise<ZoteroItem[]> {
    const items: ZoteroItem[] = []
    let start = 0
    while (true) {
      const target = new URL(url)
      target.searchParams.set('limit', '100')
      target.searchParams.set('start', String(start))
      const batch = await this.getJson<ZoteroItem[]>(target.toString())
      items.push(...batch)
      if (batch.length < 100) return items
      start += batch.length
    }
  }

  async getJson<T>(url: string): Promise<T> {
    return await (await this.get(url)).json() as T
  }

  async get(url: string): Promise<Response> {
    let response: Response
    try {
      response = await fetch(url, { method: 'GET', headers: { 'Zotero-API-Version': '3' }, signal: AbortSignal.timeout(8_000) })
    } catch (error) {
      throw new Error('未检测到 Zotero。请先启动 Zotero 桌面端并保持运行。', { cause: error })
    }
    if (response.status === 403) throw new Error('Zotero 已运行，但本地 API 未开启。请前往 Zotero：编辑 → 设置 → 高级，勾选“允许本机上的其他应用程序与 Zotero 通信”。')
    if (response.status === 404) throw new Error('Zotero 中找不到这个条目，它可能已被删除或移动。')
    if (!response.ok) throw new Error(`Zotero 本地接口返回 HTTP ${response.status}。`)
    return response
  }
}
