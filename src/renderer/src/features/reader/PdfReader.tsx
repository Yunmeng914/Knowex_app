/** Reader composition; page-local evidence intents are forwarded to the application workflow. */
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { AnnotationColor, AnnotationKind, NormalizedRect, ReadingMode, RegionRecord } from '@shared/domain/models'
import type { ReaderTool } from '../capture/CaptureOverlay'
import { useI18n } from '../../i18n/I18nProvider'
import { PdfPageView } from './PdfPageView'
import { ReaderContextMenu, type SplitMode } from './ReaderContextMenu'
import { ReaderNavigator } from './ReaderNavigator'
import { ReaderToolbar } from './ReaderToolbar'
import type { ReaderTheme } from './reader-types'
import { useReaderViewport } from './useReaderViewport'
import type { EvidenceTool } from '../research/evidence-workflow'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface MarkupRequest {
  kind: Extract<AnnotationKind, 'highlight' | 'underline' | 'note'>
  page: number
  rect: NormalizedRect
  rects?: NormalizedRect[]
  selectedText?: string
  color: AnnotationColor
}

interface Props {
  bytes: Uint8Array
  page: number
  scale: number
  tool: ReaderTool
  regions: RegionRecord[]
  activeRegionId?: string
  onPageChange(page: number): void
  onScaleChange(scale: number): void
  onToolChange(tool: ReaderTool): void
  onReady(totalPages: number): void
  onCapture(page: number, rect: NormalizedRect, pngDataUrl: string, tool?: EvidenceTool): void
  onCreateMarkup(input: MarkupRequest, tool?: EvidenceTool): void
  onRegionClick(regionId: string): void
  onClearRegionSelection(): void
  onDeleteRegion(regionId: string): void
}

interface ContextState { x: number; y: number; text: string }

export function PdfReader(props: Props): React.JSX.Element {
  const { t } = useI18n()
  const secondaryScrollRef = useRef<HTMLDivElement>(null)
  const [document, setDocument] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [renderingPages, setRenderingPages] = useState<Set<number>>(() => new Set())
  const [mode, setMode] = useState<ReadingMode>(() => localStorage.getItem('knowex:reading-mode') === 'single' ? 'single' : 'continuous')
  const [navigatorOpen, setNavigatorOpen] = useState(true)
  const [lockedColor, setLockedColor] = useState<AnnotationColor>('yellow')
  const [theme, setTheme] = useState<ReaderTheme>(() => (localStorage.getItem('knowex:reader-theme') as ReaderTheme) || 'light')
  const [split, setSplit] = useState<SplitMode>('none')
  const [secondaryPage, setSecondaryPage] = useState(1)
  const [context, setContext] = useState<ContextState | null>(null)
  const [searchMatches, setSearchMatches] = useState<Record<number, string[]>>({})
  const viewport = useReaderViewport({ document, page: props.page, scale: props.scale, mode, onPageChange: props.onPageChange, onScaleChange: props.onScaleChange })

  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument({ data: props.bytes.slice() })
    void task.promise
      .then((loaded) => {
        if (cancelled) return
        setDocument(loaded)
        setSecondaryPage(Math.min(loaded.numPages, Math.max(1, props.page + 1)))
        props.onReady(loaded.numPages)
      })
      .catch((error: unknown) => {
        // Ignore expected cancellation rejections from React StrictMode unmount or document switching.
        if (!cancelled) console.error(error)
      })
    return () => {
      cancelled = true
      void task.destroy().catch(() => undefined)
      setDocument(null)
    }
  }, [props.bytes])

  useEffect(() => {
    localStorage.setItem('knowex:reader-theme', theme)
  }, [theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
      if (event.ctrlKey || event.metaKey || event.altKey || typing) return
      if (event.key.toLocaleLowerCase() === 'h') props.onToolChange(props.tool === 'highlight' ? 'none' : 'highlight')
      if (event.key.toLocaleLowerCase() === 'u') props.onToolChange(props.tool === 'underline' ? 'none' : 'underline')
      if (event.key === 'Escape') { props.onToolChange('none'); setContext(null) }
      if (event.key === 'Delete' && props.activeRegionId) { event.preventDefault(); props.onDeleteRegion(props.activeRegionId) }
      if (event.key === 'PageDown') viewport.goToPage(props.page + 1)
      if (event.key === 'PageUp') viewport.goToPage(props.page - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.page, props.tool, props.activeRegionId, props.onToolChange, props.onDeleteRegion, document])

  const updateRendering = useCallback((pageNumber: number, rendering: boolean): void => {
    setRenderingPages((value) => {
      const next = new Set(value)
      if (rendering) next.add(pageNumber); else next.delete(pageNumber)
      return next
    })
  }, [])

  const toggleSplit = (next: Exclude<SplitMode, 'none'>): void => {
    setSplit((value) => value === next ? 'none' : next)
    setSecondaryPage(Math.min(document?.numPages ?? 1, Math.max(1, props.page + 1)))
  }

  const pageNumbers = document ? (mode === 'continuous' ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [props.page]) : []
  const regionsFor = (page: number): RegionRecord[] => props.regions.filter((region) => region.asset.anchor.pageOrSlide === page)
  const createTextMarkup = (kind: 'highlight' | 'underline', page: number, rect: NormalizedRect, rects: NormalizedRect[], text: string, color: AnnotationColor, tool?: EvidenceTool): void => props.onCreateMarkup({ kind, page, rect, rects, selectedText: text, color }, tool)

  return (
    <section className={`reader-shell theme-${theme}`} onContextMenu={(event) => {
      event.preventDefault()
      const text = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? ''
      setContext({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 235)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 420)), text })
    }}>
      <ReaderToolbar
        navigatorOpen={navigatorOpen} scale={viewport.visualScale} fitMode={viewport.fitMode} theme={theme} tool={props.tool} lockedColor={lockedColor}
        mode={mode} split={split} page={props.page} totalPages={document?.numPages ?? 1} rendering={renderingPages.size > 0}
        onToggleNavigator={() => setNavigatorOpen((value) => !value)} onScaleChange={viewport.setManualScale}
        onFitWidth={() => { viewport.setFitMode('width'); void viewport.fitWidth() }} onThemeChange={setTheme} onToolChange={props.onToolChange}
        onColorChange={setLockedColor} onModeChange={setMode} onSplit={toggleSplit} onPageChange={viewport.goToPage}
      />

      <div className={`reader-body ${navigatorOpen ? 'with-navigator' : ''}`}>
        {document && navigatorOpen && <ReaderNavigator document={document} activePage={props.page} regions={props.regions} onPageChange={viewport.goToPage} onRegionClick={props.onRegionClick} onSearchMatches={setSearchMatches} />}
        <div className={`reader-workspace split-${split}`}>
          <div ref={viewport.scrollRef} className={`reader-scroll mode-${mode}`} onScroll={viewport.reportVisiblePage}>
            <div className="pages-container" style={{ zoom: viewport.visualScale / props.scale }}>
              {document && pageNumbers.map((pageNumber) => <PdfPageView
                key={pageNumber}
                document={document}
                pageNumber={pageNumber}
                scale={props.scale}
                tool={props.tool}
                lockedColor={lockedColor}
                regions={regionsFor(pageNumber)}
                activeRegionId={props.activeRegionId}
                scrollRoot={viewport.scrollRef}
                lazy={mode === 'continuous'}
                onCapture={props.onCapture}
                onCreateTextMarkup={createTextMarkup}
                onCreateNote={(page, rect, color) => props.onCreateMarkup({ kind: 'note', page, rect, color })}
                onCancelTool={() => props.onToolChange('none')}
                onRegionClick={props.onRegionClick}
                onClearRegionSelection={props.onClearRegionSelection}
                onElement={viewport.registerPage}
                onRenderingChange={updateRendering}
                searchTerms={searchMatches[pageNumber] ?? []}
              />)}
            </div>
          </div>
          {document && split !== 'none' && <div className="secondary-view">
            <div className="secondary-controls">
              <button type="button" disabled={secondaryPage <= 1} onClick={() => setSecondaryPage((value) => value - 1)}><ChevronLeft size={14} /></button>
              <span>{secondaryPage} / {document.numPages}</span>
              <button type="button" disabled={secondaryPage >= document.numPages} onClick={() => setSecondaryPage((value) => value + 1)}><ChevronRight size={14} /></button>
              <button type="button" title={t('common.close')} onClick={() => setSplit('none')}><X size={14} /></button>
            </div>
            <div ref={secondaryScrollRef} className="reader-scroll secondary-scroll">
              <div className="pages-container" style={{ zoom: viewport.visualScale / props.scale }}><PdfPageView
                document={document}
                pageNumber={secondaryPage}
                scale={props.scale}
                tool={props.tool}
                lockedColor={lockedColor}
                regions={regionsFor(secondaryPage)}
                activeRegionId={props.activeRegionId}
                scrollRoot={secondaryScrollRef}
                lazy={false}
                onCapture={props.onCapture}
                onCreateTextMarkup={createTextMarkup}
                onCreateNote={(page, rect, color) => props.onCreateMarkup({ kind: 'note', page, rect, color })}
                onCancelTool={() => props.onToolChange('none')}
                onRegionClick={props.onRegionClick}
                onClearRegionSelection={props.onClearRegionSelection}
                onElement={() => undefined}
                onRenderingChange={updateRendering}
                searchTerms={searchMatches[secondaryPage] ?? []}
              /></div>
            </div>
          </div>}
        </div>
      </div>

      {context && <ReaderContextMenu
        x={context.x}
        y={context.y}
        hasSelection={Boolean(context.text)}
        split={split}
        canPrevious={props.page > 1}
        canNext={props.page < (document?.numPages ?? 1)}
        onCopy={() => void navigator.clipboard.writeText(context.text)}
        onZoomIn={() => viewport.setManualScale(props.scale + 0.12)}
        onZoomOut={() => viewport.setManualScale(props.scale - 0.12)}
        onActualSize={() => viewport.setManualScale(1)}
        onFitWidth={() => { viewport.setFitMode('width'); void viewport.fitWidth() }}
        onFitHeight={() => { viewport.setFitMode('height'); void viewport.fitHeight() }}
        onSplit={toggleSplit}
        onPrevious={() => viewport.goToPage(props.page - 1)}
        onNext={() => viewport.goToPage(props.page + 1)}
        onClose={() => setContext(null)}
      />}
    </section>
  )
}
