import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigStore } from '../storage/config-store'
import type { WorkspaceRepository } from '../storage/workspace-repository'
import { ZoteroWebApi } from './zotero-web-api'

describe('Zotero Web API export', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates one child note and excludes records imported from Zotero', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: { '0': 'NOTEKEY1' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const config = { getZoteroCredentials: vi.fn().mockResolvedValue({ userId: '12345', apiKey: 'secret' }) } as unknown as ConfigStore
    const repository = {
      getDocument: vi.fn().mockResolvedValue({ id: 'doc-1', title: 'Paper', source: 'zotero', zoteroParentItemKey: 'PARENT01' }),
      listRegions: vi.fn().mockResolvedValue([
        { asset: { id: 'H-1', kind: 'highlight', selectedText: 'evidence', anchor: { pageOrSlide: 2 } }, note: { title: '', annotation: 'important', tags: ['result'] } },
        { asset: { id: 'Z-1', kind: 'zotero', externalSource: 'zotero', anchor: { pageOrSlide: 1 } }, note: { title: 'Imported', annotation: '', tags: [] } }
      ]),
      upsertDocument: vi.fn()
    } as unknown as WorkspaceRepository
    const api = new ZoteroWebApi(config, repository)

    await expect(api.exportDocument('doc-1')).resolves.toBe(1)
    const request = fetchMock.mock.calls[0]
    const body = JSON.parse(request[1].body)[0]
    expect(body.parentItem).toBe('PARENT01')
    expect(body.note).toContain('evidence')
    expect(body.note).not.toContain('Imported')
  })
})
