import { globalShortcut, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/channels'

export class CaptureShortcut {
  private accelerator?: string

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  apply(accelerator: string): void {
    const next = accelerator.trim()
    if (next === this.accelerator && globalShortcut.isRegistered(next)) return
    const previous = this.accelerator
    if (previous) globalShortcut.unregister(previous)
    let registered = false
    try {
      registered = globalShortcut.register(next, () => this.startCapture())
    } catch {
      registered = false
    }
    if (!registered) {
      if (previous) globalShortcut.register(previous, () => this.startCapture())
      throw new Error(`快捷键 ${next} 无效或已被其他程序占用，请换一个组合。`)
    }
    this.accelerator = next
  }

  dispose(): void {
    if (this.accelerator) globalShortcut.unregister(this.accelerator)
    this.accelerator = undefined
  }

  private startCapture(): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send(IPC_CHANNELS.menuCommand, 'capture-region')
  }
}
