import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

type TrustedHandler<T extends unknown[]> = (event: IpcMainInvokeEvent, ...args: T) => unknown

export class UntrustedIpcSenderError extends Error {
  constructor() {
    super('IPC sender is not trusted.')
    this.name = 'UntrustedIpcSenderError'
  }
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.webContents !== event.sender) throw new UntrustedIpcSenderError()

  const frameUrl = event.senderFrame?.url || event.sender.getURL()
  if (!isTrustedRendererUrl(frameUrl)) throw new UntrustedIpcSenderError()
}

export function registerTrustedHandler<T extends unknown[]>(
  channel: string,
  handler: TrustedHandler<T>
): void {
  ipcMain.handle(channel, async (event, ...args: T) => {
    assertTrustedIpcSender(event)
    return handler(event, ...args)
  })
}

export function isTrustedRendererUrl(value: string | undefined): boolean {
  if (!value) return false
  const parsed = parseUrl(value)
  if (!parsed) return false

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const allowed = parseUrl(devUrl)
    return Boolean(allowed && parsed.origin === allowed.origin)
  }

  if (parsed.protocol === 'file:') {
    return /\/renderer\/index\.html$/i.test(parsed.pathname.replace(/\\/g, '/'))
  }
  return parsed.protocol === 'knowex:'
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}
