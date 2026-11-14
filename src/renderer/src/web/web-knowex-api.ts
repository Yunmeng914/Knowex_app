/**
 * Browser HTTP adapter implementing `KnowexApi` for the Web edition of Knowex.
 *
 * Bridges all existing React hooks and feature dialogs to Express `/api/*`
 * routes, translates binary uploads and base64 PDF payloads, provides browser
 * file selection, clipboard image paste handling, and triggers in-app modals
 * for workspace switching and Markdown note preview/export.
 */
import type { KnowexApi } from '@shared/contracts/api'
import type { AppLanguage, MenuCommand, OpenDocumentResult, WorkspaceStatus } from '@shared/domain/models'

interface SerializedOpenDocumentResult {
  document: OpenDocumentResult['document']
  bytesBase64: string
  regions: OpenDocumentResult['regions']
}

interface WebUiBridgeHandlers {
  openWorkspaceDialog?: () => Promise<WorkspaceStatus>
  openMarkdownPreview?: (documentId?: string) => Promise<void>
}

const uiHandlers: WebUiBridgeHandlers = {}
const languageListeners = new Set<(language: AppLanguage) => void>()
const clipboardImageListeners = new Set<(dataUrl: string) => void>()
const menuCommandListeners = new Set<(command: MenuCommand) => void>()

let pasteBound = false

/** Registers UI dialog callbacks used when components call `workspace.choose`, `open`, or `revealNote`. */
export function registerWebUiHandlers(handlers: WebUiBridgeHandlers): void {
  uiHandlers.openWorkspaceDialog = handlers.openWorkspaceDialog
  uiHandlers.openMarkdownPreview = handlers.openMarkdownPreview
}

/** Dispatches a menu command to App.tsx listeners (used by topbar menus and web shortcuts). */
export function emitWebMenuCommand(command: MenuCommand): void {
  for (const listener of menuCommandListeners) {
    listener(command)
  }
}

/** Initializes `window.knowex` if running in a standard browser without Electron preload. */
export function ensureWebKnowexBridge(): void {
  if (!window.knowex) {
    window.knowex = createWebKnowexApi()
  }
  bindGlobalClipboardPaste()
}

export function createWebKnowexApi(): KnowexApi {
  return {
    workspace: {
      get: () => apiJson('/api/workspace'),
      choose: async () => {
        if (uiHandlers.openWorkspaceDialog) {
          return uiHandlers.openWorkspaceDialog()
        }
        return apiJson('/api/workspace')
      },
      paths: (documentId) => apiJson(`/api/workspace/paths${documentId ? `?documentId=${encodeURIComponent(documentId)}` : ''}`),
      open: async () => {
        if (uiHandlers.openMarkdownPreview) {
          await uiHandlers.openMarkdownPreview(undefined)
        }
      },
      revealNote: async (documentId) => {
        if (uiHandlers.openMarkdownPreview) {
          await uiHandlers.openMarkdownPreview(documentId)
        }
      },
      listWorkspaces: () => apiJson('/api/workspaces'),
      selectWorkspace: (name) => apiJson('/api/workspaces/select', { method: 'POST', body: JSON.stringify({ name }) }),
      readNote: (documentId) => apiJson(`/api/workspace/note?documentId=${encodeURIComponent(documentId)}`),
      exportWorkspace: () => apiJson('/api/workspace/export')
    },
    document: {
      open: async () => {
        const file = await pickLocalDocumentFile()
        if (!file) return null
        return uploadDocumentFile(file)
      },
      uploadFile: (file) => uploadDocumentFile(file),
      openSample: async () => decodeOpenResult(await apiJson<SerializedOpenDocumentResult>('/api/documents/sample', { method: 'POST' })),
      openRecent: async (documentId) => decodeOpenResult(await apiJson<SerializedOpenDocumentResult>(`/api/documents/${encodeURIComponent(documentId)}/open`)),
      list: () => apiJson('/api/documents')
    },
    region: {
      create: (input) => apiJson('/api/regions', { method: 'POST', body: JSON.stringify(input) }),
      createMarkup: (input) => apiJson('/api/regions/markup', { method: 'POST', body: JSON.stringify(input) }),
      update: (input) => apiJson(`/api/regions/${encodeURIComponent(input.regionId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
      delete: async (regionId) => {
        await apiJson(`/api/regions/${encodeURIComponent(regionId)}`, { method: 'DELETE' })
      },
      list: (documentId) => apiJson(`/api/regions?documentId=${encodeURIComponent(documentId)}`),
      listTrash: (documentId) => apiJson(`/api/regions/trash${documentId ? `?documentId=${encodeURIComponent(documentId)}` : ''}`),
      restore: (regionId) => apiJson(`/api/regions/${encodeURIComponent(regionId)}/restore`, { method: 'POST' }),
      purge: async (regionId) => {
        await apiJson(`/api/regions/${encodeURIComponent(regionId)}/purge`, { method: 'DELETE' })
      }
    },
    ai: {
      getSettings: () => apiJson('/api/ai/settings'),
      listConnections: async () => (await apiJson<{ connections: Awaited<ReturnType<KnowexApi['ai']['listConnections']>> }>('/api/ai/settings')).connections,
      getProviderPresets: () => apiJson('/api/ai/presets'),
      saveSettings: (input) => apiJson('/api/ai/settings', { method: 'POST', body: JSON.stringify(input) }),
      saveConnection: (input) => apiJson('/api/ai/connections', { method: 'POST', body: JSON.stringify(input) }),
      setActiveConnection: (connectionId) => apiJson('/api/ai/connections/active', { method: 'POST', body: JSON.stringify({ connectionId }) }),
      deleteConnection: (connectionId) => apiJson(`/api/ai/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' }),
      testConnection: (input) => apiJson('/api/ai/connections/test', { method: 'POST', body: JSON.stringify(input) }),
      discoverModels: (input) => apiJson('/api/ai/models/discover', { method: 'POST', body: JSON.stringify(input) }),
      verifyTextCapability: (input) => apiJson('/api/ai/verify/text', { method: 'POST', body: JSON.stringify(input) }),
      verifyImageCapability: (input) => apiJson('/api/ai/verify/image', { method: 'POST', body: JSON.stringify(input) }),
      detectLocalTools: (input) => apiJson('/api/ai/local-tools/detect', { method: 'POST', body: JSON.stringify(input ?? {}) }),
      testLocalTool: (input) => apiJson('/api/ai/local-tools/test', { method: 'POST', body: JSON.stringify(input) }),
      ask: async (input) => (await apiJson<{ answer: string }>('/api/ai/ask', { method: 'POST', body: JSON.stringify(input) })).answer,
      cancel: (requestId) => apiJson('/api/ai/cancel', { method: 'POST', body: JSON.stringify({ requestId }) })
    },
    exa: {
      getSettings: () => apiJson('/api/exa/settings'),
      saveSettings: (input) => apiJson('/api/exa/settings', { method: 'POST', body: JSON.stringify(input) }),
      testConnection: () => apiJson('/api/exa/test', { method: 'POST' }),
      search: (input) => apiJson('/api/exa/search', { method: 'POST', body: JSON.stringify(input) }),
      getContent: (input) => apiJson('/api/exa/content', { method: 'POST', body: JSON.stringify(input) }),
      openSource: async (url) => {
        const { url: safeUrl } = await apiJson<{ url: string }>('/api/exa/open-source', { method: 'POST', body: JSON.stringify({ url }) })
        openValidatedLinkInTab(safeUrl)
      }
    },
    preferences: {
      get: () => apiJson('/api/preferences'),
      save: (input) => apiJson('/api/preferences', { method: 'PUT', body: JSON.stringify(input) })
    },
    zotero: {
      check: () => apiJson('/api/zotero/check'),
      list: () => apiJson('/api/zotero/list'),
      open: async (key, options) => {
        const response = await apiJson<{ result: SerializedOpenDocumentResult; importedCount: number; exportedCount: number }>(
          '/api/zotero/open',
          { method: 'POST', body: JSON.stringify({ key, options }) }
        )
        return {
          result: decodeOpenResult(response.result),
          importedCount: response.importedCount,
          exportedCount: response.exportedCount
        }
      },
      getSyncPreference: (key) => apiJson(`/api/zotero/sync-preference/${encodeURIComponent(key)}`),
      saveSyncPreference: (input) => apiJson('/api/zotero/sync-preference', { method: 'PUT', body: JSON.stringify(input) }),
      getSettings: () => apiJson('/api/zotero/settings'),
      saveSettings: (input) => apiJson('/api/zotero/settings', { method: 'PUT', body: JSON.stringify(input) }),
      export: async (documentId) => (await apiJson<{ count: number }>('/api/zotero/export', { method: 'POST', body: JSON.stringify({ documentId }) })).count
    },
    onboarding: {
      get: () => apiJson('/api/onboarding'),
      complete: () => apiJson('/api/onboarding/complete', { method: 'POST' })
    },
    language: {
      get: async () => (await apiJson<{ language: AppLanguage }>('/api/language')).language,
      set: async (language) => {
        const saved = (await apiJson<{ language: AppLanguage }>('/api/language', { method: 'PUT', body: JSON.stringify({ language }) })).language
        for (const listener of languageListeners) listener(saved)
        return saved
      },
      onChanged: (listener) => {
        languageListeners.add(listener)
        return () => languageListeners.delete(listener)
      }
    },
    clipboard: {
      onImage: (listener) => {
        clipboardImageListeners.add(listener)
        return () => clipboardImageListeners.delete(listener)
      }
    },
    menu: {
      onCommand: (listener) => {
        menuCommandListeners.add(listener)
        return () => menuCommandListeners.delete(listener)
      }
    }
  }
}

async function uploadDocumentFile(file: File): Promise<OpenDocumentResult> {
  const bytes = await file.arrayBuffer()
  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Knowex-Filename': encodeURIComponent(file.name)
    },
    body: bytes
  })
  const payload = await parseJsonResponse<SerializedOpenDocumentResult>(response)
  return decodeOpenResult(payload)
}

function decodeOpenResult(payload: SerializedOpenDocumentResult): OpenDocumentResult {
  return {
    document: payload.document,
    bytes: base64ToBytes(payload.bytesBase64),
    regions: payload.regions
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  })
  return parseJsonResponse<T>(response)
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`)
  }
  return data
}

function pickLocalDocumentFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.ppt,.pptx,application/pdf'
    input.style.display = 'none'
    let settled = false
    const finish = (file: File | null): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null)
    })
    input.addEventListener('cancel', () => {
      finish(null)
    })
    document.body.appendChild(input)
    input.click()
  })
}

/** Opens an anchor link without `window.open` so sandboxed iframe environments behave cleanly. */
function openValidatedLinkInTab(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function bindGlobalClipboardPaste(): void {
  if (pasteBound || typeof window === 'undefined') return
  pasteBound = true
  window.addEventListener('paste', (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items || clipboardImageListeners.size === 0) return
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue
      const blob = item.getAsFile()
      if (!blob) continue
      void blobToPngDataUrl(blob).then((dataUrl) => {
        for (const listener of clipboardImageListeners) {
          listener(dataUrl)
        }
      }).catch(() => undefined)
      break
    }
  })
}

async function blobToPngDataUrl(blob: Blob): Promise<string> {
  if (blob.type === 'image/png') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.toDataURL('image/png')
}
