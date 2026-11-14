import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  windowForSender: undefined as undefined | { webContents: unknown },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn((sender: unknown) => electronMock.windowForSender && electronMock.windowForSender.webContents === sender ? electronMock.windowForSender : null)
  }
}))

vi.mock('electron', () => ({
  BrowserWindow: electronMock.BrowserWindow,
  ipcMain: electronMock.ipcMain
}))

const { assertTrustedIpcSender, isTrustedRendererUrl } = await import('./trusted-ipc-sender')

function event(url: string, sender = { getURL: () => url }): Electron.IpcMainInvokeEvent {
  electronMock.windowForSender = { webContents: sender }
  return { sender, senderFrame: { url } } as unknown as Electron.IpcMainInvokeEvent
}

describe('trusted IPC sender', () => {
  beforeEach(() => {
    delete process.env.ELECTRON_RENDERER_URL
    electronMock.windowForSender = undefined
    electronMock.BrowserWindow.fromWebContents.mockClear()
  })

  it('allows the production Knowex renderer file', () => {
    expect(() => assertTrustedIpcSender(event('file:///C:/app/out/renderer/index.html'))).not.toThrow()
  })

  it('rejects similar malicious file and invalid protocol URLs', () => {
    expect(() => assertTrustedIpcSender(event('file:///C:/app/out/renderer/index.html.evil'))).toThrow('not trusted')
    expect(() => assertTrustedIpcSender(event('https://example.com/renderer/index.html'))).toThrow('not trusted')
  })

  it('rejects other WebContents', () => {
    const sender = { getURL: () => 'file:///C:/app/out/renderer/index.html' }
    electronMock.windowForSender = undefined
    expect(() => assertTrustedIpcSender({ sender, senderFrame: { url: sender.getURL() } } as unknown as Electron.IpcMainInvokeEvent)).toThrow('not trusted')
  })

  it('matches development origin exactly and rejects prefix lookalikes', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    expect(isTrustedRendererUrl('http://localhost:5173/settings')).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173.evil.test/settings')).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5174/settings')).toBe(false)
  })
})
