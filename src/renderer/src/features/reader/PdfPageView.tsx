/** PDF page rendering, text-selection geometry, and page-local evidence interactions. */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { AnnotationColor, AnnotationKind, NormalizedRect, RegionRecord } from '@shared/domain/models'
import { CaptureOverlay, type ReaderTool } from '../capture/CaptureOverlay'
import { SelectionToolbar } from './SelectionToolbar'
import { regionsAtPoint } from './highlight-overlap'
import { selectionRects } from './selection-geometry'
import { EvidenceContextMenu } from '../research/EvidenceContextMenu'
import type { EvidenceTool } from '../research/evidence-workflow'

interface TextSelection {
  text: string
  rect: NormalizedRect
  rects: NormalizedRect[]
  toolbarX: number
  toolbarY: number
}

interface Props {
  document: pdfjs.PDFDocumentProxy
  pageNumber: number
  scale: number
  tool: ReaderTool
  lockedColor: AnnotationColor
  regions: RegionRecord[]
  activeRegionId?: string
  scrollRoot: RefObject<HTMLDivElement | null>
  lazy: boolean
  onCapture(page: number, rect: NormalizedRect, pngDataUrl: string, tool?: EvidenceTool): void
  onCreateTextMarkup(kind: Extract<AnnotationKind, 'highlight' | 'underline'>, page: number, rect: NormalizedRect, rects: NormalizedRect[], text: string, color: AnnotationColor, tool?: EvidenceTool): void
  onCreateNote(page: number, rect: NormalizedRect, color: AnnotationColor): void
  onCancelTool(): void
  onRegionClick(regionId: string): void
  onClearRegionSelection(): void
  onElement(page: number, element: HTMLDivElement | null): void
  onRenderingChange(page: number, rendering: boolean): void
  onTextContent?(page: number, text: string): void
  searchTerms: string[]
}

export function PdfPageView(props: Props): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const selectionOrigin = useRef<{ x: number; y: number; pointerId: number; moved: boolean } | undefined>(undefined)
  const pagePointerOrigin = useRef<{ x: number; y: number } | undefined>(undefined)
  const [pdfPage, setPdfPage] = useState<pdfjs.PDFPageProxy | null>(null)
  const [visible, setVisible] = useState(!props.lazy)
  const [selectionDraft, setSelectionDraft] = useState<TextSelection | null>(null)
  const [selectionKind, setSelectionKind] = useState<Extract<AnnotationKind, 'highlight' | 'underline'>>('highlight')
  const [evidenceMenu, setEvidenceMenu] = useState<{ x: number; y: number }>()

  useEffect(() => {
    let cancelled = false
    void props.document.getPage(props.pageNumber).then((page) => {
      if (!cancelled) setPdfPage(page)
    })
    return () => { cancelled = true }
  }, [props.document, props.pageNumber])

  useEffect(() => {
    const element = stageRef.current
    props.onElement(props.pageNumber, element)
    return () => props.onElement(props.pageNumber, null)
  }, [props.pageNumber, props.onElement])

  useEffect(() => {
    if (!props.lazy || visible || !stageRef.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { root: props.scrollRoot.current, rootMargin: '900px 0px' })
    observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [props.lazy, props.scrollRoot, visible])

  const viewport = useMemo(() => pdfPage?.getViewport({ scale: props.scale }) ?? null, [pdfPage, props.scale])

  useEffect(() => {
    if (!pdfPage || !viewport || !visible || !canvasRef.current || !textLayerRef.current) return
    let cancelled = false
    const ratio = window.devicePixelRatio || 1
    const canvas = canvasRef.current
    const stagingCanvas = document.createElement('canvas')
    const context = stagingCanvas.getContext('2d')
    if (!context) return

    stagingCanvas.width = Math.floor(viewport.width * ratio)
    stagingCanvas.height = Math.floor(viewport.height * ratio)
    const textContainer = document.createElement('div')
    textContainer.className = 'textLayer'
    textContainer.style.setProperty('--total-scale-factor', String(viewport.scale))

    const renderTask = pdfPage.render({
      canvas: stagingCanvas,
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
    })
    const textContent = pdfPage.streamTextContent({ includeMarkedContent: true })
    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container: textContainer,
      viewport
    })

    props.onRenderingChange(props.pageNumber, true)
    void Promise.all([renderTask.promise, textLayer.render()])
      .then(() => {
        if (cancelled || !canvasRef.current || !textLayerRef.current) return
        const displayCanvas = canvasRef.current
        displayCanvas.width = stagingCanvas.width
        displayCanvas.height = stagingCanvas.height
        displayCanvas.getContext('2d')?.drawImage(stagingCanvas, 0, 0)
        const visibleText = textLayerRef.current
        visibleText.replaceChildren(...textContainer.childNodes)
        visibleText.style.setProperty('--total-scale-factor', String(viewport.scale))
        applySearchHighlights(visibleText, props.searchTerms)
        if (!cancelled && props.onTextContent) {
          const text = Array.from(visibleText.querySelectorAll('span')).map((span) => span.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
          props.onTextContent(props.pageNumber, text)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !(error instanceof pdfjs.RenderingCancelledException)) console.error(error)
      })
      .finally(() => {
        if (!cancelled) props.onRenderingChange(props.pageNumber, false)
      })

    return () => {
      cancelled = true
      renderTask.cancel()
      textLayer.cancel()
    }
  }, [pdfPage, viewport, visible, props.pageNumber])

  useEffect(() => {
    if (textLayerRef.current) applySearchHighlights(textLayerRef.current, props.searchTerms)
  }, [props.searchTerms])

  const readSelection = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = selectionOrigin.current
    selectionOrigin.current = undefined
    if (!origin || origin.pointerId !== event.pointerId || !origin.moved) {
      window.getSelection()?.removeAllRanges()
      setSelectionDraft(null)
      return
    }
    if (!stageRef.current || !textLayerRef.current) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return
    if (!textLayerRef.current.contains(selection.anchorNode) || !textLayerRef.current.contains(selection.focusNode)) return
    const text = selection.toString().replace(/\s+/g, ' ').trim()
    if (!text) return

    const stage = stageRef.current.getBoundingClientRect()
    const rects = selectionRects(Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
      .flatMap((range) => Array.from(range.getClientRects()))
      .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })), stage)
    if (!rects.length) return

    const left = Math.min(...rects.map((rect) => rect.x))
    const top = Math.min(...rects.map((rect) => rect.y))
    const right = Math.max(...rects.map((rect) => rect.x + rect.width))
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
    const toolbarX = Math.max(0.08, Math.min(0.92, (left + right) / 2))
    const toolbarY = Math.max(0.02, Math.min(0.96, bottom + 0.018))
    const draft = { text, rect: { x: left, y: top, width: right - left, height: bottom - top }, rects, toolbarX, toolbarY }
    if (props.tool === 'highlight' || props.tool === 'underline') {
      props.onCreateTextMarkup(props.tool, props.pageNumber, draft.rect, draft.rects, draft.text, props.lockedColor)
      selection.removeAllRanges()
      setSelectionDraft(null)
      return
    }
    setSelectionDraft(draft)
  }

  const createSelectionMarkup = (color: AnnotationColor): void => {
    if (!selectionDraft) return
    props.onCreateTextMarkup(selectionKind, props.pageNumber, selectionDraft.rect, selectionDraft.rects, selectionDraft.text, color)
    window.getSelection()?.removeAllRanges()
    setSelectionDraft(null)
  }

  const useSelection = (tool: EvidenceTool): void => {
    if (!selectionDraft) return
    props.onCreateTextMarkup('highlight', props.pageNumber, selectionDraft.rect, selectionDraft.rects, selectionDraft.text, 'yellow', tool)
    window.getSelection()?.removeAllRanges()
    setSelectionDraft(null)
  }

  const copySelection = (): void => {
    if (selectionDraft) void navigator.clipboard.writeText(selectionDraft.text)
  }

  const width = viewport ? Math.floor(viewport.width) : 612 * props.scale
  const height = viewport ? Math.floor(viewport.height) : 792 * props.scale

  return (
    <div
      ref={stageRef}
      className={`page-stage ${props.tool === 'highlight' || props.tool === 'underline' ? 'highlight-tool-active' : ''}`}
      data-page-number={props.pageNumber}
      style={{ width, height }}
      onContextMenu={(event) => {
        if (!selectionDraft) return
        event.preventDefault()
        event.stopPropagation()
        setEvidenceMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)) })
      }}
      onPointerDownCapture={(event) => {
        if (event.button === 0) pagePointerOrigin.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerMoveCapture={(event) => {
        const origin = pagePointerOrigin.current
        if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 2) pagePointerOrigin.current = undefined
      }}
      onClick={(event) => {
        if (pagePointerOrigin.current) {
          pagePointerOrigin.current = undefined
          if (window.getSelection()?.isCollapsed !== false) {
            const box = stageRef.current?.getBoundingClientRect()
            if (box) {
              const candidates = regionsAtPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, props.regions)
              if (candidates.length) {
                const activeIndex = candidates.findIndex((region) => region.note.id === props.activeRegionId)
                props.onRegionClick(candidates[(activeIndex + 1) % candidates.length].note.id)
              }
            }
          }
        }
      }}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div
        ref={textLayerRef}
        className="textLayer"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          props.onClearRegionSelection()
          setSelectionDraft(null)
          selectionOrigin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false }
        }}
        onPointerMove={(event) => {
          const origin = selectionOrigin.current
          if (origin && origin.pointerId === event.pointerId && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 2) origin.moved = true
        }}
        onPointerUp={readSelection}
        onPointerCancel={() => { selectionOrigin.current = undefined }}
      />
      <CaptureOverlay
        tool={props.tool}
        canvasRef={canvasRef}
        regions={props.regions}
        activeRegionId={props.activeRegionId}
        onCancel={props.onCancelTool}
        onConfirm={(rect, data, tool) => props.onCapture(props.pageNumber, rect, data, tool)}
        onCreateNote={(rect) => props.onCreateNote(props.pageNumber, rect, 'yellow')}
        onRegionClick={props.onRegionClick}
      />
      {selectionDraft && <SelectionToolbar
        x={selectionDraft.toolbarX}
        y={selectionDraft.toolbarY}
        kind={selectionKind}
        onKindChange={setSelectionKind}
        onCreate={createSelectionMarkup}
        onQuickAction={useSelection}
        onCopy={copySelection}
      />}
      {evidenceMenu && selectionDraft && <EvidenceContextMenu x={evidenceMenu.x} y={evidenceMenu.y} onAction={useSelection} onCopy={copySelection} onClose={() => setEvidenceMenu(undefined)} />}
      <span className="page-number-badge">{props.pageNumber}</span>
    </div>
  )
}

function applySearchHighlights(container: HTMLDivElement, terms: string[]): void {
  const normalized = terms.map((term) => term.toLocaleLowerCase()).filter(Boolean)
  for (const span of container.querySelectorAll('span')) {
    span.classList.toggle('search-match', normalized.some((term) => (span.textContent ?? '').toLocaleLowerCase().includes(term)))
  }
}
