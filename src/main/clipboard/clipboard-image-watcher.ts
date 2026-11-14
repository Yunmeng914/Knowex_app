import { createHash } from 'node:crypto'
import { clipboard, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/channels'

const POLL_INTERVAL = 700
const MAX_CLIPBOARD_IMAGE_BYTES = 15 * 1024 * 1024

export class ClipboardImageWatcher {
  private timer?: NodeJS.Timeout
  private lastHash?: string

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  start(): void {
    if (this.timer) return
    this.read(true)
    this.timer = setInterval(() => this.read(false), POLL_INTERVAL)
    this.timer.unref()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private read(initial: boolean): void {
    const image = clipboard.readImage()
    if (image.isEmpty()) {
      this.lastHash = undefined
      return
    }
    const bytes = image.toPNG()
    if (!bytes.length || bytes.length > MAX_CLIPBOARD_IMAGE_BYTES) return
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash === this.lastHash) return
    this.lastHash = hash
    if (initial) return
    const window = this.getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC_CHANNELS.clipboardImage, `data:image/png;base64,${bytes.toString('base64')}`)
  }
}
