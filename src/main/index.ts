import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registerIpcHandlers } from './ipc/register-handlers'
import { installApplicationMenu } from './menu/application-menu'
import { ConfigStore } from './storage/config-store'
import { IPC_CHANNELS } from '../shared/contracts/channels'
import type { AppLanguage, AppSettingsPublic } from '../shared/domain/models'
import { CaptureShortcut } from './shortcuts/capture-shortcut'
import { ClipboardImageWatcher } from './clipboard/clipboard-image-watcher'
import { isTrustedRendererUrl } from './ipc/trusted-ipc-sender'

let cleanupBeforeQuit: (() => Promise<void>) | undefined
let quitAfterCleanup = false
const smokeTest = process.env.KNOWEX_SMOKE_TEST === '1'

if (smokeTest) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('in-process-gpu')
  app.setPath('userData', join(tmpdir(), `knowex-smoke-${process.pid}`))
}

function createWindow(): BrowserWindow {
  const readerSmokeTest = process.env.KNOWEX_READER_SMOKE_TEST === '1'
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f0e9',
    title: 'Knowex',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => {
    if (!smokeTest) window.show()
  })
  if (smokeTest) {
    window.webContents.once('did-finish-load', () => {
      const expression = readerSmokeTest ? `
        (async () => {
          const waitFor = async (selector, timeout = 15000) => {
            const started = Date.now()
            while (Date.now() - started < timeout) {
              const element = document.querySelector(selector)
              if (element) return element
              await new Promise((resolve) => setTimeout(resolve, 100))
            }
            return null
          }
          if (!window.knowex || !document.querySelector('.app-shell')) return { ok: false, stage: 'shell' }
          const item = await waitFor('.document-item', 5000)
          if (!item) return { ok: false, stage: 'recent-document' }
          item.click()
          const canvas = await waitFor('.page-stage canvas[width]', 20000)
          const text = await waitFor('.textLayer span', 20000)
          let singleClickSafe = false
          if (text) {
            const box = text.getBoundingClientRect()
            text.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: box.left + 2, clientY: box.top + 2 }))
            text.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0, clientX: box.left + 2, clientY: box.top + 2 }))
            await new Promise((resolve) => setTimeout(resolve, 100))
            singleClickSafe = !document.querySelector('.selection-toolbar')
            text.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: box.left + 2, clientY: box.top + 2 }))
            const range = document.createRange()
            range.selectNodeContents(text)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
            text.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, button: 0, clientX: box.right, clientY: box.bottom }))
            text.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0, clientX: box.right, clientY: box.bottom }))
          }
          const selectionToolbar = await waitFor('.selection-toolbar', 3000)
          document.querySelector('.reader-shell')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 500, clientY: 350 }))
          const contextMenu = await waitFor('.reader-context-menu', 3000)
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          document.querySelector('[data-reader-split="vertical"]')?.click()
          const secondaryView = await waitFor('.secondary-view', 5000)
          const continuous = document.querySelector('[data-reader-mode="continuous"]')
          continuous?.click()
          await new Promise((resolve) => setTimeout(resolve, 700))
          const before = document.querySelector('.zoom-value')?.textContent
          const reader = document.querySelector('.reader-scroll')
          reader?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: 500, clientY: 400 }))
          await new Promise((resolve) => setTimeout(resolve, 700))
          const after = document.querySelector('.zoom-value')?.textContent
          return { ok: Boolean(canvas && text && singleClickSafe && selectionToolbar && contextMenu && secondaryView && document.querySelector('.reader-navigator') && document.querySelectorAll('.page-stage').length > 1 && before !== after), stage: 'reader', before, after }
        })()
      ` : "window.knowex ? Promise.all([window.knowex.workspace.get(), window.knowex.zotero.check()]).then(([workspace, zotero]) => ({ ok: Boolean(document.querySelector('.app-shell') && typeof workspace.ready === 'boolean' && typeof zotero.state === 'string'), stage: 'shell' })) : { ok: false, stage: 'bridge' }"
      void window.webContents.executeJavaScript(expression)
        .then((result: { ok: boolean; stage: string; before?: string; after?: string }) => {
          console.log(result.ok ? `KNOWEX_${readerSmokeTest ? 'READER_' : ''}SMOKE_OK` : `KNOWEX_SMOKE_FAILED_AT_${result.stage}`, result.before && result.after ? `${result.before} -> ${result.after}` : '')
          app.exit(result.ok ? 0 : 1)
        })
        .catch((error) => {
          console.error('KNOWEX_SMOKE_FAILED', error)
          app.exit(1)
        })
    })
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:') void shell.openExternal(parsed.toString())
    } catch {
      // Ignore malformed renderer navigation targets.
    }
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(async () => {
  const config = new ConfigStore()
  let language = await config.getLanguage()
  let mainWindow: BrowserWindow | null = null
  const captureShortcut = new CaptureShortcut(() => mainWindow)
  const clipboardImages = new ClipboardImageWatcher(() => mainWindow)

  const applyLanguage = async (nextLanguage: AppLanguage): Promise<void> => {
    language = nextLanguage
    await config.setLanguage(nextLanguage)
    if (!mainWindow || mainWindow.isDestroyed()) return
    installApplicationMenu({ window: mainWindow, language, onLanguageChange: applyLanguage })
    mainWindow.webContents.send(IPC_CHANNELS.languageChanged, language)
  }

  const openWindow = (): BrowserWindow => {
    const window = createWindow()
    mainWindow = window
    installApplicationMenu({ window, language, onLanguageChange: applyLanguage })
    window.on('closed', () => {
      if (mainWindow === window) mainWindow = null
    })
    return window
  }

  const applyAppSettings = async (settings: AppSettingsPublic): Promise<void> => {
    captureShortcut.apply(settings.captureShortcut)
  }

  const services = registerIpcHandlers({ config, onLanguageChanged: applyLanguage, onAppSettingsChanged: applyAppSettings })
  await services.maintenance.start()
  openWindow()
  clipboardImages.start()
  const appSettings = await config.getAppSettings()
  try { captureShortcut.apply(appSettings.captureShortcut) } catch (error) { console.warn(error) }
  cleanupBeforeQuit = async () => {
    captureShortcut.dispose()
    clipboardImages.dispose()
    await services.maintenance.dispose()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitAfterCleanup || !cleanupBeforeQuit) return
  event.preventDefault()
  void cleanupBeforeQuit().finally(() => {
    quitAfterCleanup = true
    app.quit()
  })
})
