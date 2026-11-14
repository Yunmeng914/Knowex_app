/** Document-session state and persistence workflows; UI intents may consume returned regions. */
import { useState } from 'react'
import type { DocumentRecord, NormalizedRect, OpenDocumentResult, RegionRecord, TrashedRegionRecord, WorkspaceStatus } from '@shared/domain/models'
import type { RegionDraft, SaveRegionOptions } from '../../features/annotations/RegionPanel'
import type { ReaderTool } from '../../features/capture/CaptureOverlay'
import type { MarkupRequest } from '../../features/reader/PdfReader'
import { useI18n } from '../../i18n/I18nProvider'
import type { AppNotice } from './useNotice'

interface Options {
  flash(kind: AppNotice['kind'], text: string): void
  showError(error: unknown): void
}

export function useDocumentSession({ flash, showError }: Options) {
  const { t } = useI18n()
  const [workspace, setWorkspace] = useState<WorkspaceStatus>({ path: null, ready: false })
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [current, setCurrent] = useState<OpenDocumentResult | null>(null)
  const [regions, setRegions] = useState<RegionRecord[]>([])
  const [trash, setTrash] = useState<TrashedRegionRecord[]>([])
  const [activeRegionId, setActiveRegionId] = useState<string>()
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [scale, setScale] = useState(1.15)
  const [activeTool, setActiveTool] = useState<ReaderTool>('none')
  const [busy, setBusy] = useState(false)

  const refreshDocuments = async (): Promise<void> => setDocuments(await window.knowex.document.list())

  const refreshRegions = async (): Promise<void> => {
    if (!current) return
    const [active, deleted] = await Promise.all([window.knowex.region.list(current.document.id), window.knowex.region.listTrash(current.document.id)])
    setRegions(active)
    setTrash(deleted)
  }

  const loadResult = async (result: OpenDocumentResult): Promise<void> => {
    const [hydratedRegions, trashedRegions] = await Promise.all([
      window.knowex.region.list(result.document.id),
      window.knowex.region.listTrash(result.document.id)
    ])
    setCurrent({ ...result, bytes: new Uint8Array(result.bytes) })
    setRegions(hydratedRegions)
    setTrash(trashedRegions)
    setActiveRegionId(undefined)
    setPage(1)
    setTotalPages(1)
    setActiveTool('none')
    await refreshDocuments()
  }

  const chooseWorkspace = async (): Promise<void> => {
    try {
      const prevPath = workspace.path
      const status = await window.knowex.workspace.choose()
      setWorkspace(status)
      setDocuments(await window.knowex.document.list())
      if (status.path !== prevPath) {
        setCurrent(null)
        setRegions([])
        setTrash([])
        setActiveRegionId(undefined)
        setPage(1)
        setTotalPages(1)
        setActiveTool('none')
        if (status.ready) flash('success', t('notice.workspaceReady'))
      }
    } catch (error) { showError(error) }
  }

  const switchWorkspace = async (name: string): Promise<void> => {
    if (!window.knowex.workspace.selectWorkspace) return
    const status = await window.knowex.workspace.selectWorkspace(name)
    setWorkspace(status)
    setDocuments(await window.knowex.document.list())
    setCurrent(null)
    setRegions([])
    setTrash([])
    setActiveRegionId(undefined)
    setPage(1)
    setTotalPages(1)
    setActiveTool('none')
    if (status.ready) flash('success', t('notice.workspaceReady'))
  }

  const openLocal = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.knowex.document.open()
      if (result) await loadResult(result)
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const uploadFile = async (file: File): Promise<void> => {
    if (!window.knowex.document.uploadFile) {
      await openLocal()
      return
    }
    setBusy(true)
    try {
      const result = await window.knowex.document.uploadFile(file)
      await loadResult(result)
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const openSample = async (): Promise<void> => {
    if (!window.knowex.document.openSample) return
    setBusy(true)
    try {
      const result = await window.knowex.document.openSample()
      await loadResult(result)
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const openRecent = async (documentId: string): Promise<void> => {
    setBusy(true)
    try { await loadResult(await window.knowex.document.openRecent(documentId)) }
    catch (error) { showError(error) }
    finally { setBusy(false) }
  }

  const capture = async (pageNumber: number, rect: NormalizedRect, pngDataUrl: string): Promise<RegionRecord | undefined> => {
    if (!current) return
    setBusy(true)
    try {
      const region = await window.knowex.region.create({ documentId: current.document.id, pageOrSlide: pageNumber, rect, zoomAtCapture: scale, pngDataUrl })
      setRegions((value) => [...value, region])
      setActiveRegionId(region.note.id)
      setActiveTool('none')
      flash('success', t('notice.captureSaved', { page: pageNumber }))
      return region
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const createMarkup = async (input: MarkupRequest, openEditor = false): Promise<RegionRecord | undefined> => {
    if (!current) return
    const lockedMarkup = activeTool === input.kind
    setBusy(true)
    try {
      const region = await window.knowex.region.createMarkup({ ...input, documentId: current.document.id, pageOrSlide: input.page, zoomAtCapture: scale })
      setRegions((value) => [...value, region])
      setPage(input.page)
      if ((input.kind === 'note' && !lockedMarkup) || openEditor) setActiveRegionId(region.note.id)
      if (input.kind === 'note') setActiveTool('none')
      flash('success', input.kind === 'highlight' ? t('notice.highlightCreated') : input.kind === 'underline' ? t('notice.underlineCreated') : t('notice.noteCreated'))
      return region
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const saveRegion = async (region: RegionRecord, draft: RegionDraft, options: SaveRegionOptions = {}): Promise<void> => {
    if (!options.silent) setBusy(true)
    try {
      const updated = await window.knowex.region.update({
        regionId: region.note.id,
        title: draft.title,
        annotation: draft.annotation,
        tags: draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        color: draft.color,
        conversation: draft.conversation
      })
      setRegions((value) => value.map((item) => item.note.id === updated.note.id ? updated : item))
      if (options.closeEditor !== false) setActiveRegionId(undefined)
      if (!options.silent) flash('success', t('notice.noteSaved'))
    } catch (error) { showError(error) } finally { if (!options.silent) setBusy(false) }
  }

  const deleteRegion = async (region: RegionRecord): Promise<void> => {
    setBusy(true)
    try {
      await window.knowex.region.delete(region.note.id)
      setRegions((value) => value.filter((item) => item.note.id !== region.note.id))
      if (current) setTrash(await window.knowex.region.listTrash(current.document.id))
      setActiveRegionId(undefined)
      flash('success', t('notice.regionDeleted'))
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const restoreRegion = async (entry: TrashedRegionRecord): Promise<void> => {
    setBusy(true)
    try {
      const restored = await window.knowex.region.restore(entry.region.note.id)
      setTrash((value) => value.filter((item) => item.region.note.id !== restored.note.id))
      setRegions((value) => [...value, restored].sort((a, b) => a.asset.createdAt.localeCompare(b.asset.createdAt)))
      setActiveRegionId(restored.note.id)
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const purgeRegion = async (entry: TrashedRegionRecord): Promise<void> => {
    setBusy(true)
    try {
      await window.knowex.region.purge(entry.region.note.id)
      setTrash((value) => value.filter((item) => item.region.note.id !== entry.region.note.id))
    } catch (error) { showError(error) } finally { setBusy(false) }
  }

  const selectRegion = (region: RegionRecord): void => {
    setActiveRegionId(region.note.id)
    setPage(region.asset.anchor.pageOrSlide)
  }

  const askAI = async (region: RegionRecord, question: string, history: RegionRecord['note']['conversation'], annotationContext: string, includeRegionImage: boolean, imageDataUrls: string[], requestId: string): Promise<string> => {
    try {
      return await window.knowex.ai.ask({ requestId, regionId: region.note.id, question, annotationContext, includeRegionImage, imageDataUrls, history: history.map(({ role, content }) => ({ role, content })) })
    } catch (error) {
      showError(error)
      throw error
    }
  }

  const cancelAI = async (requestId: string): Promise<void> => {
    try { await window.knowex.ai.cancel(requestId) }
    catch (error) { showError(error) }
  }

  return {
    workspace, setWorkspace, documents, setDocuments, current, regions, trash, activeRegionId, setActiveRegionId,
    page, setPage, totalPages, setTotalPages, scale, setScale, activeTool, setActiveTool, busy, setBusy,
    loadResult, refreshRegions, chooseWorkspace, switchWorkspace, openLocal, uploadFile, openSample, openRecent, capture, createMarkup, saveRegion, deleteRegion, restoreRegion, purgeRegion, selectRegion, askAI, cancelAI
  }
}
