/**
 * Node.js built-in test runner suite (`node:test`) covering Web-mode server
 * workspace lifecycle, built-in sample PDF generation, Express `/api/*` routes,
 * annotation & Markdown round-trips, and credential non-echo guarantees.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSampleResearchPdf, SAMPLE_PDF_FILENAME } from '../main/document/sample-pdf'
import { createWebApp } from './create-app'

test('buildSampleResearchPdf produces a valid two-page PDF 1.4 document', () => {
  const bytes = buildSampleResearchPdf()
  const text = Buffer.from(bytes).toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4\n'))
  assert.ok(text.includes('/Count 2'))
  assert.ok(text.includes('Knowex: Region-Bound Evidence'))
  assert.ok(text.includes('Figure 1: Fourteen-day evidence trace retention'))
  assert.ok(text.trimEnd().endsWith('%%EOF'))
})

test('Web server boots, manages workspaces, persists annotations/Markdown, and never echoes secrets', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'knowex-web-test-'))
  const webApp = await createWebApp({ dataDir: tempDir, isProduction: true })
  const server = webApp.app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve())
    server.once('error', reject)
  })

  try {
    const port = (server.address() as AddressInfo).port
    const baseUrl = `http://127.0.0.1:${port}`

    // 1. Health & initial default workspace with seeded sample PDF
    const health = await fetchJson<{ ok: boolean; mode: string }>(`${baseUrl}/api/health`)
    assert.equal(health.ok, true)
    assert.equal(health.mode, 'web')

    const wsStatus = await fetchJson<{ path: string | null; ready: boolean }>(`${baseUrl}/api/workspace`)
    assert.equal(wsStatus.ready, true)
    assert.ok(wsStatus.path?.endsWith('default'))

    const docs = await fetchJson<Array<{ id: string; sourceName: string }>>(`${baseUrl}/api/documents`)
    assert.equal(docs.length, 1)
    assert.equal(docs[0].sourceName, SAMPLE_PDF_FILENAME)

    // 2. Open sample document & create a markup note -> verify Markdown note generation
    const sampleRes = await fetchJson<{ document: { id: string }; bytesBase64: string; regions: unknown[] }>(
      `${baseUrl}/api/documents/sample`,
      { method: 'POST' }
    )
    assert.equal(sampleRes.document.id, docs[0].id)
    assert.ok(Buffer.from(sampleRes.bytesBase64, 'base64').toString('latin1').startsWith('%PDF-1.4'))

    const createdRegion = await fetchJson<{ note: { id: string; title: string }; asset: { id: string } }>(
      `${baseUrl}/api/regions/markup`,
      {
        method: 'POST',
        body: JSON.stringify({
          documentId: sampleRes.document.id,
          pageOrSlide: 1,
          zoomAtCapture: 1.15,
          kind: 'note',
          color: 'green',
          rect: { x: 0.25, y: 0.4, width: 0.04, height: 0.04 }
        })
      }
    )
    assert.ok(createdRegion.note.id)

    const updatedRegion = await fetchJson<{ note: { id: string; title: string; annotation: string; tags: string[] } }>(
      `${baseUrl}/api/regions/${encodeURIComponent(createdRegion.note.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          regionId: createdRegion.note.id,
          title: 'Key Finding',
          annotation: 'Normalized coordinates keep anchors aligned.',
          tags: ['spatial', 'markdown'],
          color: 'blue',
          conversation: []
        })
      }
    )
    assert.equal(updatedRegion.note.title, 'Key Finding')

    const noteDoc = await fetchJson<{ content: string; filename: string }>(
      `${baseUrl}/api/workspace/note?documentId=${encodeURIComponent(sampleRes.document.id)}`
    )
    assert.ok(noteDoc.filename.endsWith('.md'))
    assert.ok(noteDoc.content.includes('Key Finding'))
    assert.ok(noteDoc.content.includes('Normalized coordinates keep anchors aligned.'))

    // 3. Soft delete -> trash list -> restore round-trip
    await fetchJson(`${baseUrl}/api/regions/${encodeURIComponent(createdRegion.note.id)}`, { method: 'DELETE' })
    const trashed = await fetchJson<Array<{ region: { note: { id: string } } }>>(
      `${baseUrl}/api/regions/trash?documentId=${encodeURIComponent(sampleRes.document.id)}`
    )
    assert.equal(trashed.length, 1)
    assert.equal(trashed[0].region.note.id, createdRegion.note.id)

    await fetchJson(`${baseUrl}/api/regions/${encodeURIComponent(createdRegion.note.id)}/restore`, { method: 'POST' })
    const activeRegions = await fetchJson<Array<{ note: { id: string } }>>(
      `${baseUrl}/api/regions?documentId=${encodeURIComponent(sampleRes.document.id)}`
    )
    assert.equal(activeRegions.length, 1)

    // 4. Create & switch workspace + reject path traversal workspace names
    const switched = await fetchJson<{ path: string; ready: boolean }>(`${baseUrl}/api/workspaces/select`, {
      method: 'POST',
      body: JSON.stringify({ name: 'thesis-lab' })
    })
    assert.equal(switched.ready, true)
    assert.ok(switched.path.endsWith('thesis-lab'))

    const badWs = await fetch(`${baseUrl}/api/workspaces/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '../escape' })
    })
    assert.equal(badWs.status, 400)

    // 5. Save preferences & Exa key and verify secret is never echoed back
    const savedPrefs = await fetchJson<{ captureShortcut: string; confirmAnnotationDelete: boolean }>(
      `${baseUrl}/api/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify({
          captureShortcut: 'CommandOrControl+Shift+K',
          cleanupTempOnExit: true,
          zoteroAutoSync: false,
          confirmAnnotationDelete: false
        })
      }
    )
    assert.equal(savedPrefs.captureShortcut, 'CommandOrControl+Shift+K')
    assert.equal(savedPrefs.confirmAnnotationDelete, false)

    const savedExa = await fetchJson<Record<string, unknown>>(`${baseUrl}/api/exa/settings`, {
      method: 'POST',
      body: JSON.stringify({ apiKey: 'exa-secret-test-token-12345' })
    })
    assert.equal(savedExa.configured, true)
    assert.equal(JSON.stringify(savedExa).includes('exa-secret-test-token-12345'), false)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await webApp.dispose()
    await rm(tempDir, { recursive: true, force: true })
  }
})

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(payload as { error?: string }).error || text}`)
  }
  return payload as T
}
