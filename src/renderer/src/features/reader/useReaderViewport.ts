import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ReadingMode } from '@shared/domain/models'
import type { FitMode } from './reader-types'

interface Options {
  document: PDFDocumentProxy | null
  page: number
  scale: number
  mode: ReadingMode
  onPageChange(page: number): void
  onScaleChange(scale: number): void
}

const clampScale = (scale: number): number => Math.max(0.45, Math.min(3, scale))

export function useReaderViewport({ document, page, scale, mode, onPageChange, onScaleChange }: Options) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageElements = useRef(new Map<number, HTMLDivElement>())
  const lastReportedPage = useRef(page)
  const scrollFrame = useRef<number | undefined>(undefined)
  const fitRequest = useRef(0)
  const fitModeRef = useRef<FitMode>('width')
  const zoomTarget = useRef(scale)
  const visualScaleRef = useRef(scale)
  const zoomFrame = useRef<number | undefined>(undefined)
  const zoomCommit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [fitMode, setFitModeState] = useState<FitMode>('width')
  const [visualScale, setVisualScale] = useState(scale)

  const setFitMode = useCallback((next: FitMode): void => {
    fitModeRef.current = next
    if (next === 'none') fitRequest.current += 1
    setFitModeState(next)
  }, [])

  const fitWidth = useCallback(async (): Promise<void> => {
    if (!document || !scrollRef.current) return
    const request = ++fitRequest.current
    const natural = (await document.getPage(page)).getViewport({ scale: 1 })
    const available = Math.max(280, scrollRef.current.clientWidth - 48)
    if (request === fitRequest.current && fitModeRef.current === 'width') onScaleChange(clampScale(available / natural.width))
  }, [document, page, onScaleChange])

  const fitHeight = useCallback(async (): Promise<void> => {
    if (!document || !scrollRef.current) return
    const request = ++fitRequest.current
    const natural = (await document.getPage(page)).getViewport({ scale: 1 })
    const available = Math.max(300, scrollRef.current.clientHeight - 36)
    if (request === fitRequest.current && fitModeRef.current === 'height') onScaleChange(clampScale(available / natural.height))
  }, [document, page, onScaleChange])

  useEffect(() => {
    if (zoomCommit.current !== undefined) return
    zoomTarget.current = scale
    visualScaleRef.current = scale
    setVisualScale(scale)
  }, [scale])

  useEffect(() => () => {
    if (zoomFrame.current !== undefined) cancelAnimationFrame(zoomFrame.current)
    if (zoomCommit.current !== undefined) clearTimeout(zoomCommit.current)
    if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current)
  }, [])

  useEffect(() => {
    localStorage.setItem('knowex:reading-mode', mode)
    if (fitMode === 'width') void fitWidth()
    if (fitMode === 'height') void fitHeight()
  }, [mode, fitMode, fitWidth, fitHeight])

  useEffect(() => {
    if (fitMode === 'none' || !scrollRef.current) return
    const observer = new ResizeObserver(() => { if (fitMode === 'width') void fitWidth(); else void fitHeight() })
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [fitMode, fitWidth, fitHeight])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const next = clampScale(zoomTarget.current * Math.exp(-event.deltaY * 0.0015))
      if (Math.abs(next - zoomTarget.current) < 0.001) return
      setFitMode('none')
      zoomTarget.current = next
      if (zoomFrame.current !== undefined) cancelAnimationFrame(zoomFrame.current)
      zoomFrame.current = requestAnimationFrame(() => {
        zoomFrame.current = undefined
        const previous = visualScaleRef.current
        const anchorX = container.scrollLeft + localX
        const anchorY = container.scrollTop + localY
        visualScaleRef.current = next
        setVisualScale(next)
        requestAnimationFrame(() => {
          const ratio = next / previous
          container.scrollLeft = anchorX * ratio - localX
          container.scrollTop = anchorY * ratio - localY
        })
      })
      if (zoomCommit.current !== undefined) clearTimeout(zoomCommit.current)
      zoomCommit.current = setTimeout(() => {
        zoomCommit.current = undefined
        onScaleChange(zoomTarget.current)
      }, 170)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [onScaleChange])

  const setManualScale = (next: number): void => {
    setFitMode('none')
    if (zoomFrame.current !== undefined) cancelAnimationFrame(zoomFrame.current)
    if (zoomCommit.current !== undefined) clearTimeout(zoomCommit.current)
    zoomFrame.current = undefined
    zoomCommit.current = undefined
    zoomTarget.current = clampScale(next)
    visualScaleRef.current = zoomTarget.current
    setVisualScale(zoomTarget.current)
    onScaleChange(zoomTarget.current)
  }

  const goToPage = useCallback((nextPage: number): void => {
    onPageChange(Math.max(1, Math.min(document?.numPages ?? 1, nextPage)))
  }, [document, onPageChange])

  const registerPage = useCallback((pageNumber: number, element: HTMLDivElement | null): void => {
    if (element) pageElements.current.set(pageNumber, element)
    else pageElements.current.delete(pageNumber)
  }, [])

  const reportVisiblePage = (): void => {
    if (mode !== 'continuous' || !scrollRef.current) return
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!container) return
      const center = container.getBoundingClientRect().top + container.clientHeight * 0.38
      let nearestPage = page
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const [pageNumber, element] of pageElements.current) {
        const rect = element.getBoundingClientRect()
        const distance = Math.abs(rect.top + Math.min(rect.height / 2, container.clientHeight * 0.3) - center)
        if (distance < nearestDistance) { nearestDistance = distance; nearestPage = pageNumber }
      }
      if (nearestPage !== lastReportedPage.current) { lastReportedPage.current = nearestPage; onPageChange(nearestPage) }
    })
  }

  useEffect(() => {
    if (mode !== 'continuous' || page === lastReportedPage.current) return
    lastReportedPage.current = page
    pageElements.current.get(page)?.scrollIntoView({ block: 'start' })
  }, [mode, page])

  return { scrollRef, fitMode, visualScale, setFitMode, fitWidth, fitHeight, setManualScale, goToPage, registerPage, reportVisiblePage }
}
