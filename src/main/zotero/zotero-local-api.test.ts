import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentService } from '../document/document-service'
import { ZoteroLocalApi } from './zotero-local-api'

describe('Zotero Local API diagnostics', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('explains HTTP 403 as a disabled local API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    const api = new ZoteroLocalApi({} as DocumentService)

    await expect(api.checkConnection()).resolves.toMatchObject({
      state: 'disabled'
    })
  })

  it('distinguishes a stopped Zotero process', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const api = new ZoteroLocalApi({} as DocumentService)

    await expect(api.checkConnection()).resolves.toMatchObject({
      state: 'offline'
    })
  })

  it('reports the negotiated local API version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: {
        'Zotero-API-Version': '3',
        'Zotero-Schema-Version': '42'
      }
    })))
    const api = new ZoteroLocalApi({} as DocumentService)

    await expect(api.checkConnection()).resolves.toMatchObject({
      state: 'ready',
      apiVersion: '3',
      schemaVersion: '42'
    })
  })

  it('uses the parent bibliographic title instead of Full Text PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('itemType=attachment')) return new Response(JSON.stringify([{
        key: 'ATTACH01',
        data: { key: 'ATTACH01', itemType: 'attachment', parentItem: 'PARENT01', title: 'Full Text PDF', filename: 'Attention Is All you Need.pdf', contentType: 'application/pdf' }
      }]), { status: 200 })
      if (url.includes('itemKey=PARENT01')) return new Response(JSON.stringify([{
        key: 'PARENT01', data: { key: 'PARENT01', itemType: 'conferencePaper', title: 'Attention Is All You Need', date: '2017', creators: [{ lastName: 'Vaswani' }] }
      }]), { status: 200 })
      return new Response('', { status: 404 })
    }))
    const api = new ZoteroLocalApi({} as DocumentService)
    await expect(api.listAttachments()).resolves.toEqual([expect.objectContaining({
      title: 'Attention Is All You Need', attachmentTitle: 'Full Text PDF', creators: 'Vaswani', year: '2017'
    })])
  })
})
