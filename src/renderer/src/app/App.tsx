/** Root renderer composition; feature behavior stays in dedicated hooks and feature modules. */
import { BookOpen, Bot, CheckCircle2, CloudUpload, FileText, FolderOpen, HelpCircle, Library, PanelRight, Scan, Search, Settings, Trash2, TriangleAlert, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AIProviderPresetPublic, AISettingsPublic, AppSettingsPublic, RegionRecord, WorkspaceStatus, ZoteroWebSettingsPublic } from '@shared/domain/models'
import { ActionMenu } from '../components/ActionMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ResizableLayout } from '../components/ResizableLayout'
import { RegionPanel } from '../features/annotations/RegionPanel'
import { DeleteAnnotationDialog } from '../features/annotations/DeleteAnnotationDialog'
import { LibraryPanel } from '../features/library/LibraryPanel'
import { ZoteroDialog } from '../features/library/ZoteroDialog'
import { ZoteroSyncDialog } from '../features/library/ZoteroSyncDialog'
import { OnboardingDialog } from '../features/onboarding/OnboardingDialog'
import { PdfReader } from '../features/reader/PdfReader'
import { SettingsDialog } from '../features/settings/SettingsDialog'
import { MarkdownPreviewDialog } from '../features/workspace/MarkdownPreviewDialog'
import { StoragePathsDialog } from '../features/workspace/StoragePathsDialog'
import { TrashDialog } from '../features/workspace/TrashDialog'
import { WorkspaceDialog } from '../features/workspace/WorkspaceDialog'
import { ExaResearchDialog } from '../features/exa/ExaResearchDialog'
import type { TransientChatImage } from '../features/chat/AnnotationChat'
import type { AnnotationToolRequest, EvidenceTool } from '../features/research/evidence-workflow'
import { useI18n } from '../i18n/I18nProvider'
import { registerWebUiHandlers } from '../web/web-knowex-api'
import { useDocumentSession } from './hooks/useDocumentSession'
import { useNotice } from './hooks/useNotice'
import { useZoteroIntegration } from './hooks/useZoteroIntegration'

const DEFAULT_AI: AISettingsPublic = { connections: [] }
const DEFAULT_PROVIDER_PRESETS: AIProviderPresetPublic[] = []
const DEFAULT_ZOTERO_WEB: ZoteroWebSettingsPublic = { configured: false, userId: '' }
const DEFAULT_APP_SETTINGS: AppSettingsPublic = { captureShortcut: 'CommandOrControl+Alt+K', cleanupTempOnExit: true, zoteroAutoSync: true, confirmAnnotationDelete: true }

export function App(): React.JSX.Element {
  const { t } = useI18n()
  const { notice, flash, showError } = useNotice()
  const [bootstrapping, setBootstrapping] = useState(true)
  const [leftOpen, setLeftOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900)
  const [rightOpen, setRightOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'general' | 'ai' | 'exa' | 'zotero'>('general')
  const [exaOpen, setExaOpen] = useState(false)
  const [annotationToolRequest, setAnnotationToolRequest] = useState<AnnotationToolRequest>()
  const [storagePathsOpen, setStoragePathsOpen] = useState(false)
  const [trashDialogOpen, setTrashDialogOpen] = useState(false)
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)
  const [markdownPreviewOpen, setMarkdownPreviewOpen] = useState(false)
  const [markdownPreviewDocId, setMarkdownPreviewDocId] = useState<string | undefined>()
  const [zoteroExportConfirmOpen, setZoteroExportConfirmOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingIsUpdate, setOnboardingIsUpdate] = useState(false)
  const [transientImages, setTransientImages] = useState<TransientChatImage[]>([])
  const [deleteCandidate, setDeleteCandidate] = useState<RegionRecord>()
  const [aiSettings, setAISettings] = useState(DEFAULT_AI)
  const [providerPresets, setProviderPresets] = useState(DEFAULT_PROVIDER_PRESETS)
  const [zoteroWebSettings, setZoteroWebSettings] = useState(DEFAULT_ZOTERO_WEB)
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS)
  const session = useDocumentSession({ flash, showError })
  const zotero = useZoteroIntegration({ webSettings: zoteroWebSettings, loadResult: session.loadResult, flash, autoSync: appSettings.zoteroAutoSync })
  const workspacePickerResolver = useRef<((status: WorkspaceStatus) => void) | undefined>(undefined)
  const latestWorkspaceRef = useRef<WorkspaceStatus>(session.workspace)
  latestWorkspaceRef.current = session.workspace

  const activeAIConnection = aiSettings.connections.find((connection) => connection.active) ?? aiSettings.connections[0]
  const activeRegion = session.regions.find((region) => region.note.id === session.activeRegionId)
  // Exa treats selected paper text as evidence context, never as if it were the user's instruction.
  const exaInitialContext = activeRegion?.asset.selectedText
  const exaInitialInstruction = activeRegion?.note.title || activeRegion?.note.annotation

  const openSettings = (section: typeof settingsSection = 'general'): void => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }

  const openLocalOrChooseWorkspace = (): void => {
    if (session.workspace.ready) void session.openLocal()
    else void session.chooseWorkspace()
  }

  const openMarkdownPreview = (documentId?: string): void => {
    setMarkdownPreviewDocId(documentId)
    setMarkdownPreviewOpen(true)
  }

  useEffect(() => {
    registerWebUiHandlers({
      openWorkspaceDialog: () => new Promise<WorkspaceStatus>((resolve) => {
        workspacePickerResolver.current = resolve
        setWorkspaceDialogOpen(true)
      }),
      openMarkdownPreview: async (documentId) => {
        openMarkdownPreview(documentId)
      }
    })
  }, [])

  useEffect(() => {
    const autostart = new URLSearchParams(window.location.search).get('autostart') === '1'
    void Promise.all([
      window.knowex.workspace.get(),
      window.knowex.document.list(),
      window.knowex.ai.getSettings(),
      window.knowex.ai.getProviderPresets(),
      window.knowex.zotero.getSettings(),
      window.knowex.preferences.get(),
      window.knowex.onboarding.get()
    ]).then(([workspace, documents, ai, presets, zoteroSettings, preferences, onboarding]) => {
      session.setWorkspace(workspace)
      session.setDocuments(documents)
      setAISettings(ai)
      setProviderPresets(presets)
      setZoteroWebSettings(zoteroSettings)
      setAppSettings(preferences)
      setOnboardingIsUpdate(onboarding.isUpdate)
      setOnboardingOpen(!autostart && !onboarding.completed)
    }).catch(showError).finally(() => setBootstrapping(false))
  }, [])

  // Keep center reader usable when viewport shrinks to tablet/mobile widths.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setLeftOpen(false)
        setRightOpen(false)
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (session.activeRegionId) setRightOpen(true)
  }, [session.activeRegionId])

  useEffect(() => window.knowex.clipboard.onImage((dataUrl) => {
    setTransientImages((current) => {
      if (current.some((image) => image.dataUrl === dataUrl)) return current
      if (current.length >= 10) {
        window.setTimeout(() => flash('error', t('notice.screenshotLimit')), 0)
        return current
      }
      window.setTimeout(() => flash('success', t('notice.systemScreenshotAdded', { count: current.length + 1 })), 0)
      return [...current, { id: crypto.randomUUID(), dataUrl }]
    })
  }), [flash, t])

  // Bind the configured capture shortcut inside the browser viewport when reading a document.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!session.current || session.busy) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return
      }
      if (matchesShortcut(event, appSettings.captureShortcut)) {
        event.preventDefault()
        session.setActiveTool((value) => value === 'capture' ? 'none' : 'capture')
        setRightOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [appSettings.captureShortcut, session.current, session.busy])

  const finishOnboarding = async (): Promise<void> => {
    await window.knowex.onboarding.complete()
    setOnboardingOpen(false)
  }

  const requestExportCurrentToZotero = (): void => {
    if (!session.current) return
    if (!zoteroWebSettings.configured) {
      openSettings('zotero')
      flash('error', t('zotero.exportNeedsKey'))
      return
    }
    setZoteroExportConfirmOpen(true)
  }

  const executeExportCurrentToZotero = async (): Promise<void> => {
    if (!session.current) return
    setZoteroExportConfirmOpen(false)
    session.setBusy(true)
    try {
      const count = await window.knowex.zotero.export(session.current.document.id)
      flash('success', t('notice.zoteroExportDone', { count }))
    } catch (error) { showError(error) } finally { session.setBusy(false) }
  }

  const requestDelete = (region: RegionRecord): void => {
    if (appSettings.confirmAnnotationDelete) setDeleteCandidate(region)
    else void session.deleteRegion(region)
  }

  const openAnnotationTool = (region: RegionRecord | undefined, tool: EvidenceTool): void => {
    if (!region) return
    const translated = tool === 'translate'
    setAnnotationToolRequest({
      requestId: crypto.randomUUID(),
      regionId: region.note.id,
      tool: translated ? 'ai' : tool,
      initialQuestion: translated ? t('evidence.translatePrompt') : undefined
    })
    setRightOpen(true)
  }

  const confirmDelete = async (doNotAskAgain: boolean): Promise<void> => {
    const region = deleteCandidate
    if (!region) return
    setDeleteCandidate(undefined)
    if (doNotAskAgain) {
      try {
        const saved = await window.knowex.preferences.save({ ...appSettings, confirmAnnotationDelete: false })
        setAppSettings(saved)
      } catch (error) { showError(error) }
    }
    await session.deleteRegion(region)
  }

  useEffect(() => window.knowex.menu.onCommand((command) => {
    if (command === 'open-file') openLocalOrChooseWorkspace()
    if (command === 'open-zotero') zotero.show()
    if (command === 'choose-workspace') void session.chooseWorkspace()
    if (command === 'capture-region' && session.current && !session.busy) {
      session.setActiveTool((value) => value === 'capture' ? 'none' : 'capture')
      setRightOpen(true)
    }
    if (command === 'highlight-text' && session.current && !session.busy) session.setActiveTool((value) => value === 'highlight' ? 'none' : 'highlight')
    if (command === 'add-page-note' && session.current && !session.busy) session.setActiveTool((value) => value === 'note' ? 'none' : 'note')
    if (command === 'show-storage-paths') setStoragePathsOpen(true)
    if (command === 'show-trash') setTrashDialogOpen(true)
    if (command === 'settings') openSettings()
    if (command === 'show-onboarding') setOnboardingOpen(true)
    if (command === 'previous-page') session.setPage((value) => Math.max(1, value - 1))
    if (command === 'next-page') session.setPage((value) => Math.min(session.totalPages, value + 1))
    if (command === 'toggle-left-sidebar') setLeftOpen((value) => !value)
    if (command === 'toggle-right-sidebar') setRightOpen((value) => !value)
  }), [session.current, session.busy, session.totalPages])

  const closeWorkspaceDialog = (): void => {
    setWorkspaceDialogOpen(false)
    const resolve = workspacePickerResolver.current
    workspacePickerResolver.current = undefined
    resolve?.(latestWorkspaceRef.current)
  }

  const handleSelectWorkspace = async (name: string): Promise<void> => {
    await session.switchWorkspace(name)
    const updated = await window.knowex.workspace.get()
    latestWorkspaceRef.current = updated
    const resolve = workspacePickerResolver.current
    workspacePickerResolver.current = undefined
    resolve?.(updated)
  }

  const handleDropFile = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file && !session.busy) {
      void session.uploadFile(file)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">K</div><strong>Knowex</strong></div>
        <div className="toolbar">
          <button type="button" className="button" onClick={openLocalOrChooseWorkspace} disabled={session.busy}><FolderOpen size={16} />{session.workspace.ready ? t('app.openFile') : t('app.chooseWorkspace')}</button>
          <ActionMenu
            label={t('app.research')}
            icon={<Search size={16} />}
            items={[
              { id: 'zotero', label: t('app.openZotero'), icon: <BookOpen size={16} />, onSelect: zotero.show },
              { id: 'exa', label: t('app.openExa'), icon: <Search size={16} />, onSelect: () => setExaOpen(true) },
              { id: 'export-zotero', label: t('zotero.exportCurrent'), icon: <CloudUpload size={16} />, disabled: session.current?.document.source !== 'zotero' || session.busy, separatorBefore: true, onSelect: requestExportCurrentToZotero }
            ]}
          />
          <ActionMenu
            label={t('app.tools')}
            icon={<Wrench size={16} />}
            items={[
              { id: 'markdown-preview', label: t('app.markdownPreview'), icon: <FileText size={16} />, onSelect: () => openMarkdownPreview(session.current?.document.id) },
              { id: 'storage-paths', label: t('paths.title'), icon: <FolderOpen size={16} />, onSelect: () => setStoragePathsOpen(true) },
              { id: 'trash', label: t('trash.title'), icon: <Trash2 size={16} />, onSelect: () => setTrashDialogOpen(true) },
              { id: 'workspace', label: t('app.changeWorkspace'), icon: <FolderOpen size={16} />, separatorBefore: true, onSelect: () => void session.chooseWorkspace() },
              { id: 'guide', label: t('app.guide'), icon: <HelpCircle size={16} />, onSelect: () => setOnboardingOpen(true) }
            ]}
          />
          <button type="button" className={`button capture-button ${session.activeTool === 'capture' ? 'active' : ''}`} disabled={!session.current || session.busy} onClick={() => session.setActiveTool((value) => value === 'capture' ? 'none' : 'capture')}><Scan size={16} />{session.activeTool === 'capture' ? t('app.cancelCapture') : t('app.capture')}</button>
        </div>
        <div className="topbar-spacer" />
        <button type="button" className={`workspace-pill ${session.workspace.ready ? 'ready' : ''}`} onClick={() => void session.chooseWorkspace()} title={session.workspace.path ?? t('app.chooseWorkspace')} aria-label={t('app.changeWorkspace')}>
          {session.workspace.ready ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          <span>{session.workspace.path ? session.workspace.path.split(/[\\/]/).at(-1) : t('app.chooseWorkspace')}</span>
        </button>
        <button type="button" className={`icon-button ${leftOpen ? 'active' : ''}`} title={t('app.toggleSources')} aria-label={t('app.toggleSources')} onClick={() => { setLeftOpen((value) => { const next = !value; if (next && window.innerWidth <= 900) setRightOpen(false); return next }) }}><Library size={18} /></button>
        <button type="button" className={`icon-button ${rightOpen ? 'active' : ''}`} title={t('app.toggleRegions')} aria-label={t('app.toggleRegions')} onClick={() => { setRightOpen((value) => { const next = !value; if (next && window.innerWidth <= 900) setLeftOpen(false); return next }) }}><PanelRight size={18} /></button>
        <button type="button" className="icon-button" title={t('app.settings')} aria-label={t('app.settings')} onClick={() => openSettings()}><Settings size={18} /></button>
      </header>

      <ResizableLayout
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((value) => { const next = !value; if (next && window.innerWidth <= 900) setRightOpen(false); return next })}
        onToggleRight={() => setRightOpen((value) => { const next = !value; if (next && window.innerWidth <= 900) setLeftOpen(false); return next })}
        left={<LibraryPanel documents={session.documents} zoteroAttachments={zotero.attachments} activeDocumentId={session.current?.document.id} onOpen={(id) => void session.openRecent(id)} onOpenZotero={zotero.show} onOpenZoteroAttachment={(attachment) => void zotero.prepare(attachment)} onConfigureZoteroAttachment={(attachment) => void zotero.configure(attachment)} />}
        center={
          <div
            className={`center-drop-zone ${dragActive ? 'drag-active' : ''}`}
            data-drop-label={t('app.dropDocumentHint')}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) {
                event.preventDefault()
                setDragActive(true)
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragActive(false)
              }
            }}
            onDrop={handleDropFile}
          >
            {session.current ? (
              <PdfReader
                key={session.current.document.id}
                bytes={session.current.bytes}
                page={Math.min(session.page, session.totalPages)}
                scale={session.scale}
                tool={session.activeTool}
                regions={session.regions}
                activeRegionId={session.activeRegionId}
                onPageChange={(value) => session.setPage(Math.max(1, Math.min(session.totalPages, value)))}
                onScaleChange={session.setScale}
                onToolChange={session.setActiveTool}
                onReady={(count) => { session.setTotalPages(count); session.setPage((value) => Math.min(value, count)) }}
                onCapture={(page, rect, data, tool) => { void session.capture(page, rect, data).then((region) => { if (tool) openAnnotationTool(region, tool) }) }}
                onCreateMarkup={(input, tool) => { void session.createMarkup(input, Boolean(tool)).then((region) => { if (tool) openAnnotationTool(region, tool) }) }}
                onRegionClick={(id) => session.setActiveRegionId(id)}
                onClearRegionSelection={() => session.setActiveRegionId(undefined)}
                onDeleteRegion={(id) => {
                  const region = session.regions.find((item) => item.note.id === id)
                  if (region) requestDelete(region)
                }}
              />
            ) : bootstrapping ? (
              <div className="welcome" aria-busy="true" />
            ) : (
              <div className="welcome">
                <h1>{session.workspace.ready ? t('welcome.title') : t('welcome.workspaceTitle')}</h1>
                <p>{session.workspace.ready ? t('welcome.body') : t('welcome.workspaceBody')}</p>
                <div className="welcome-actions">
                  {session.workspace.ready ? (
                    <>
                      <button type="button" className="button primary large" disabled={session.busy} onClick={() => void session.openLocal()}><FolderOpen size={17} />{t('welcome.open')}</button>
                      <button type="button" className="button large" disabled={session.busy} onClick={() => void session.openSample()}><FileText size={17} />{t('welcome.sample')}</button>
                      <button type="button" className="button large" disabled={session.busy} onClick={zotero.show}><BookOpen size={17} />Zotero</button>
                    </>
                  ) : (
                    <button type="button" className="button primary large" onClick={() => void session.chooseWorkspace()}><FolderOpen size={17} />{t('app.chooseWorkspace')}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        }
        right={<RegionPanel regions={session.regions} trash={session.trash} transientImages={transientImages} activeRegionId={session.activeRegionId} toolRequest={annotationToolRequest} busy={session.busy} onSelect={session.selectRegion} onCloseEditor={() => session.setActiveRegionId(undefined)} onConfigureExa={() => openSettings('exa')} onSave={session.saveRegion} onDelete={async (region) => requestDelete(region)} onRestore={session.restoreRegion} onPurge={session.purgeRegion} onRemoveTransientImage={(id) => setTransientImages((value) => value.filter((image) => image.id !== id))} onAsk={session.askAI} onCancelAsk={session.cancelAI} />}
      />

      <footer className="statusbar">
        <span>{session.current ? `${session.current.document.title} · ${Math.min(session.page, session.totalPages)}/${session.totalPages}` : t('app.noDocument')}</span>
        <span className="status-spacer" /><span>{session.workspace.ready ? t('app.localReady') : t('app.workspaceRequired')}</span><span className="status-dot" />
        <span><Bot size={12} /> {activeAIConnection?.configured ? `${activeAIConnection.name} · ${activeAIConnection.model ?? ''}` : t('app.aiNotConfigured')}</span>
      </footer>

      {notice && <div className={`toast ${notice.kind}`}>{notice.kind === 'error' ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}{notice.text}</div>}
      <ZoteroSyncDialog attachment={zotero.pendingAttachment} webConfigured={zotero.webConfigured} loading={zotero.loading} initialOptions={zotero.pendingOptions} preferenceScope={zotero.preferenceScope} onCancel={() => zotero.setPendingAttachment(undefined)} onConfigure={() => openSettings('zotero')} onConfirm={(options) => void zotero.open(options)} />
      <SettingsDialog open={settingsOpen} initialSection={settingsSection} settings={aiSettings} providerPresets={providerPresets} zoteroSettings={zoteroWebSettings} appSettings={appSettings} onClose={() => setSettingsOpen(false)} onAISettingsChanged={(next) => { setAISettings(next); flash('success', t('notice.settingsSaved')) }} onError={showError} onSaveApp={async (input) => { try { setAppSettings(await window.knowex.preferences.save(input)) } catch (error) { showError(error); throw error } }} onSaveZotero={async (input) => { try { setZoteroWebSettings(await window.knowex.zotero.saveSettings(input)) } catch (error) { showError(error); throw error } }} />
      <ExaResearchDialog open={exaOpen} initialContext={exaInitialContext} initialInstruction={exaInitialInstruction} documentTitle={session.current?.document.title} onClose={() => setExaOpen(false)} onConfigure={() => { setExaOpen(false); openSettings('exa') }} />
      <StoragePathsDialog open={storagePathsOpen} documentId={session.current?.document.id} onClose={() => setStoragePathsOpen(false)} onError={showError} />
      <WorkspaceDialog open={workspaceDialogOpen} onSelect={handleSelectWorkspace} onClose={closeWorkspaceDialog} onError={showError} />
      <MarkdownPreviewDialog open={markdownPreviewOpen} documentId={markdownPreviewDocId} onClose={() => setMarkdownPreviewOpen(false)} onError={showError} />
      <TrashDialog open={trashDialogOpen} documents={session.documents} onClose={() => setTrashDialogOpen(false)} onChanged={async (documentId) => { if (session.current?.document.id === documentId) await session.refreshRegions() }} onError={showError} />
      <DeleteAnnotationDialog open={Boolean(deleteCandidate)} busy={session.busy} onCancel={() => setDeleteCandidate(undefined)} onConfirm={confirmDelete} />
      <ConfirmDialog open={zoteroExportConfirmOpen} title={t('zotero.exportCurrent')} message={t('zotero.exportConfirm')} confirmLabel={t('zotero.exportCurrent')} tone="primary" busy={session.busy} onCancel={() => setZoteroExportConfirmOpen(false)} onConfirm={() => void executeExportCurrentToZotero()} />
      <ZoteroDialog open={zotero.dialogOpen} loading={zotero.loading} status={zotero.status} attachments={zotero.attachments} error={zotero.error} onClose={() => zotero.setDialogOpen(false)} onRefresh={() => void zotero.load()} onOpen={(attachment) => void zotero.prepare(attachment)} onConfigure={(attachment) => void zotero.configure(attachment)} />
      <OnboardingDialog open={onboardingOpen} workspaceReady={session.workspace.ready} captureShortcut={appSettings.captureShortcut} isUpdate={onboardingIsUpdate} onChooseWorkspace={() => void session.chooseWorkspace()} onSaveShortcut={async (captureShortcut) => { const saved = await window.knowex.preferences.save({ ...appSettings, captureShortcut }); setAppSettings(saved) }} onFinish={() => void finishOnboarding()} />
    </div>
  )
}

function matchesShortcut(event: KeyboardEvent, accelerator: string): boolean {
  const parts = accelerator.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean)
  if (parts.length === 0) return false
  const keyPart = parts.at(-1)
  const needsCmdOrCtrl = parts.includes('commandorcontrol') || parts.includes('ctrl') || parts.includes('control') || parts.includes('cmd') || parts.includes('meta')
  const needsAlt = parts.includes('alt') || parts.includes('option')
  const needsShift = parts.includes('shift')
  const hasCmdOrCtrl = event.ctrlKey || event.metaKey
  return hasCmdOrCtrl === needsCmdOrCtrl
    && event.altKey === needsAlt
    && event.shiftKey === needsShift
    && event.key.toLowerCase() === keyPart
}
