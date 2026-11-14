/** Capture and annotation overlay; newly framed evidence can route directly to research tools. */
import { Check, MapPin, RotateCcw, X } from 'lucide-react'
import { useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { denormalizeRect, rectFromPoints, type Point } from '@shared/domain/coordinates'
import { annotationKind, type NormalizedRect, type RegionRecord } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { highlightAlpha, regionsAtPoint } from '../reader/highlight-overlap'
import { EvidenceQuickActions } from '../research/EvidenceQuickActions'
import { EvidenceContextMenu } from '../research/EvidenceContextMenu'
import type { EvidenceTool } from '../research/evidence-workflow'

export type ReaderTool = 'none' | 'capture' | 'highlight' | 'underline' | 'note'

interface Props {
  tool: ReaderTool
  canvasRef: RefObject<HTMLCanvasElement | null>
  regions: RegionRecord[]
  activeRegionId?: string
  onCancel(): void
  onConfirm(rect: NormalizedRect, pngDataUrl: string, tool?: EvidenceTool): void
  onCreateNote(rect: NormalizedRect): void
  onRegionClick(regionId: string): void
}

export function CaptureOverlay({ tool, canvasRef, regions, activeRegionId, onCancel, onConfirm, onCreateNote, onRegionClick }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const [evidenceMenu, setEvidenceMenu] = useState<{ x: number; y: number }>()

  const localPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(box.width, event.clientX - box.left)),
      y: Math.max(0, Math.min(box.height, event.clientY - box.top))
    }
  }

  const selection = start && end
    ? rectFromPoints(start, end, canvasRef.current?.clientWidth ?? 1, canvasRef.current?.clientHeight ?? 1)
    : null

  const captureData = (): { rect: NormalizedRect; dataUrl: string } | undefined => {
    const canvas = canvasRef.current
    if (!selection || !canvas || selection.width < 0.005 || selection.height < 0.005) return undefined
    const output = document.createElement('canvas')
    const sx = Math.round(selection.x * canvas.width)
    const sy = Math.round(selection.y * canvas.height)
    const sw = Math.max(1, Math.round(selection.width * canvas.width))
    const sh = Math.max(1, Math.round(selection.height * canvas.height))
    output.width = sw
    output.height = sh
    output.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
    return { rect: selection, dataUrl: output.toDataURL('image/png') }
  }

  const confirm = (tool?: EvidenceTool): void => {
    const captured = captureData()
    if (!captured) return
    onConfirm(captured.rect, captured.dataUrl, tool)
    setEvidenceMenu(undefined)
    setStart(null)
    setEnd(null)
  }

  const copySelection = async (): Promise<void> => {
    const captured = captureData()
    if (!captured) return
    const blob = await (await fetch(captured.dataUrl)).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }

  const pixelSelection = selection && canvasRef.current
    ? denormalizeRect(selection, canvasRef.current.clientWidth, canvasRef.current.clientHeight)
    : null

  const selectMarker = (event: MouseEvent<HTMLButtonElement>, fallbackId: string): void => {
    event.stopPropagation()
    const layer = event.currentTarget.parentElement
    if (!layer) return onRegionClick(fallbackId)
    const box = layer.getBoundingClientRect()
    const candidates = regionsAtPoint((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, regions)
    if (candidates.length < 2) return onRegionClick(fallbackId)
    const activeIndex = candidates.findIndex((region) => region.note.id === activeRegionId)
    onRegionClick(candidates[(activeIndex + 1) % candidates.length].note.id)
  }

  return (
    <>
      <div className={`annotation-markers ${tool === 'highlight' || tool === 'underline' ? 'markup-tool-active' : ''}`} aria-label={t('capture.savedRegions')}>
        {regions.flatMap((region) => {
          const kind = annotationKind(region)
          if (kind === 'zotero') return []
          const rects = (kind === 'highlight' || kind === 'underline') && region.asset.rects?.length
              ? region.asset.rects
              : [region.asset.anchor.rect]
          if (kind === 'note') {
            const rect = region.asset.anchor.rect
            return [<button
              type="button"
              key={region.note.id}
              className={`page-note-marker color-${region.asset.color ?? 'yellow'}`}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%` }}
              onClick={(event) => selectMarker(event, region.note.id)}
              title={region.note.title || t('region.note')}
            ><MapPin size={17} /></button>]
          }
          const markers = rects.map((rect, index) => {
            const style = {
              left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
              '--highlight-alpha': kind === 'highlight' ? highlightAlpha(rect, regions) : undefined
            } as CSSProperties
            return <span
            key={`${region.note.id}-${index}`}
            className={`${kind === 'highlight' ? 'text-highlight-marker' : kind === 'underline' ? 'text-underline-marker' : 'region-marker'} color-${region.asset.color ?? 'yellow'}`}
            style={style}
            title={region.note.title || region.asset.id}
          />
          })
          if ((kind === 'highlight' || kind === 'underline') && region.note.id === activeRegionId) {
            const rect = region.asset.anchor.rect
            markers.push(<span key={`${region.note.id}-selection`} className="markup-selection-box" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)
          }
          return markers
        })}
      </div>

      {tool === 'note' && <div
        className="note-insert-overlay"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const width = 0.028
          const height = 0.028
          const x = Math.max(0, Math.min(1 - width, (event.clientX - box.left) / box.width - width / 2))
          const y = Math.max(0, Math.min(1 - height, (event.clientY - box.top) / box.height - height / 2))
          onCreateNote({ x, y, width, height })
        }}
      ><div className="capture-hint">{t('capture.noteHint')}</div></div>}

      {tool === 'capture' && <div
        className="capture-overlay"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = localPoint(event)
          setStart(point)
          setEnd(point)
        }}
        onPointerMove={(event) => {
          if (start && event.currentTarget.hasPointerCapture(event.pointerId)) setEnd(localPoint(event))
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <div className="capture-hint">{t('capture.hint')}</div>
        {pixelSelection && <div className="capture-selection" style={{ left: pixelSelection.x, top: pixelSelection.y, width: pixelSelection.width, height: pixelSelection.height }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setEvidenceMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)) }) }}>
          <div className="capture-actions" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="icon-button" title={t('capture.retry')} onClick={() => { setStart(null); setEnd(null) }}><RotateCcw size={15} /></button>
            <button type="button" className="icon-button" title={t('common.cancel')} onClick={onCancel}><X size={15} /></button>
            <button type="button" className="icon-button primary" title={t('capture.save')} onClick={() => confirm()}><Check size={15} /></button>
          </div>
          <div className="capture-quick-actions" onPointerDown={(event) => event.stopPropagation()}>
            <EvidenceQuickActions onAction={confirm} onCopy={() => void copySelection()} />
          </div>
        </div>}
        {evidenceMenu && pixelSelection && <EvidenceContextMenu x={evidenceMenu.x} y={evidenceMenu.y} onAction={confirm} onCopy={() => void copySelection()} onClose={() => setEvidenceMenu(undefined)} />}
      </div>}
    </>
  )
}
