import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppLanguage, MenuCommand } from '../../shared/domain/models'

interface MenuOptions {
  window: BrowserWindow
  language: AppLanguage
  onLanguageChange(language: AppLanguage): Promise<void>
}

const labels = {
  'zh-CN': {
    file: '文件', open: '打开文件…', zotero: '从 Zotero 打开…', workspace: '选择工作区…', close: '关闭窗口', quit: '退出 Knowex',
    edit: '编辑', undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
    view: '窗口', reload: '重新加载', devtools: '开发者工具', actualSize: '实际大小', zoomIn: '放大', zoomOut: '缩小', fullscreen: '全屏', left: '文献面板', right: '批注记录面板',
    go: '前往', previous: '上一页', next: '下一页',
    tools: '工具', capture: '框选区域', highlight: '文字高亮', note: '插入页面标签', trash: '批注回收站…', storagePaths: '本地文件路径…', settings: '设置…', language: '语言', chinese: '简体中文', english: 'English',
    help: '帮助', gettingStarted: '新手使用指南', devHelp: '如何使用开发者工具', about: '关于 Knowex', aboutMessage: '本地优先的科研文献阅读器\n版本 '
  },
  'en-US': {
    file: 'File', open: 'Open File…', zotero: 'Open from Zotero…', workspace: 'Choose Workspace…', close: 'Close Window', quit: 'Quit Knowex',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'Window', reload: 'Reload', devtools: 'Developer Tools', actualSize: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullscreen: 'Full Screen', left: 'Documents Panel', right: 'Annotations Panel',
    go: 'Go', previous: 'Previous Page', next: 'Next Page',
    tools: 'Tools', capture: 'Capture Region', highlight: 'Highlight Text', note: 'Add Page Note', trash: 'Annotation Trash…', storagePaths: 'Local File Paths…', settings: 'Settings…', language: 'Language', chinese: '简体中文', english: 'English',
    help: 'Help', gettingStarted: 'Getting Started', devHelp: 'Using Developer Tools', about: 'About Knowex', aboutMessage: 'Local-first research document reader\nVersion '
  }
} as const

export function installApplicationMenu({ window, language, onLanguageChange }: MenuOptions): void {
  const t = labels[language]
  const send = (command: MenuCommand): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.menuCommand, command)
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: t.file,
      submenu: [
        { label: t.open, accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: t.zotero, accelerator: 'CmdOrCtrl+Shift+O', click: () => send('open-zotero') },
        { label: t.workspace, click: () => send('choose-workspace') },
        { type: 'separator' },
        { label: t.close, role: 'close' },
        { label: t.quit, role: 'quit' }
      ]
    },
    {
      label: t.edit,
      submenu: [
        { label: t.undo, role: 'undo' }, { label: t.redo, role: 'redo' }, { type: 'separator' },
        { label: t.cut, role: 'cut' }, { label: t.copy, role: 'copy' }, { label: t.paste, role: 'paste' },
        { type: 'separator' }, { label: t.selectAll, role: 'selectAll' }
      ]
    },
    {
      label: t.view,
      submenu: [
        { label: t.left, accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-left-sidebar') },
        { label: t.right, accelerator: 'CmdOrCtrl+Shift+R', click: () => send('toggle-right-sidebar') },
        { type: 'separator' },
        { label: t.reload, role: 'reload' }, { label: t.devtools, role: 'toggleDevTools' },
        { type: 'separator' }, { label: t.actualSize, role: 'resetZoom' }, { label: t.zoomIn, role: 'zoomIn' }, { label: t.zoomOut, role: 'zoomOut' },
        { type: 'separator' }, { label: t.fullscreen, role: 'togglefullscreen' }
      ]
    },
    {
      label: t.go,
      submenu: [
        { label: t.previous, accelerator: 'Alt+Left', click: () => send('previous-page') },
        { label: t.next, accelerator: 'Alt+Right', click: () => send('next-page') }
      ]
    },
    {
      label: t.tools,
      submenu: [
        { label: t.capture, accelerator: 'CmdOrCtrl+Shift+S', click: () => send('capture-region') },
        { label: t.highlight, accelerator: 'CmdOrCtrl+Shift+H', click: () => send('highlight-text') },
        { label: t.note, accelerator: 'CmdOrCtrl+Shift+N', click: () => send('add-page-note') },
        { type: 'separator' },
        { label: t.trash, click: () => send('show-trash') },
        { label: t.storagePaths, click: () => send('show-storage-paths') },
        { label: t.settings, accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        {
          label: t.language,
          submenu: [
            { label: t.chinese, type: 'radio', checked: language === 'zh-CN', click: () => void onLanguageChange('zh-CN') },
            { label: t.english, type: 'radio', checked: language === 'en-US', click: () => void onLanguageChange('en-US') }
          ]
        }
      ]
    },
    {
      label: t.help,
      submenu: [
        { label: t.gettingStarted, click: () => send('show-onboarding') },
        { label: t.devHelp, click: () => void dialog.showMessageBox(window, { type: 'info', title: t.devHelp, message: language === 'zh-CN' ? '查看 → 开发者工具' : 'View → Developer Tools', detail: language === 'zh-CN' ? '推荐在 npm run dev 模式下使用。\n\nConsole：查看界面报错和日志\nElements：检查布局和 CSS\nSources：设置断点并单步调试\nNetwork：查看渲染进程请求\n\n文件系统、Zotero 和模型请求在 Electron 主进程执行，其错误请查看运行 npm run dev 的终端。' : 'Use Developer Tools while running npm run dev.\n\nConsole: renderer errors and logs\nElements: layout and CSS\nSources: breakpoints and step debugging\nNetwork: renderer requests\n\nFile-system, Zotero, and model requests run in Electron main; inspect the npm run dev terminal for those errors.' }) },
        { type: 'separator' },
        { label: t.about, click: () => void dialog.showMessageBox(window, { type: 'info', title: t.about, message: 'Knowex', detail: `${t.aboutMessage}${app.getVersion()}` }) }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
