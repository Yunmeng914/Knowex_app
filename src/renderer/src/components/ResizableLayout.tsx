import { ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  leftOpen: boolean
  rightOpen: boolean
  onToggleLeft(): void
  onToggleRight(): void
}

export function ResizableLayout({ left, center, right, leftOpen, rightOpen, onToggleLeft, onToggleRight }: Props): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(350)
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)

  const move = useCallback((event: PointerEvent) => {
    if (!dragging || !container.current) return
    const box = container.current.getBoundingClientRect()
    if (dragging === 'left') setLeftWidth(Math.max(190, Math.min(420, event.clientX - box.left)))
    if (dragging === 'right') setRightWidth(Math.max(300, Math.min(520, box.right - event.clientX)))
  }, [dragging])

  useEffect(() => {
    if (!dragging) return
    const stop = (): void => setDragging(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [dragging, move])

  return (
    <div ref={container} className={`resizable-layout ${dragging ? 'is-resizing' : ''}`}>
      {leftOpen && <aside className="layout-panel layout-left" style={{ width: leftWidth }}>{left}</aside>}
      {leftOpen && <div className="resize-handle left" onPointerDown={() => setDragging('left')}><button type="button" className="panel-edge-toggle" title="隐藏文献面板" onPointerDown={(event) => event.stopPropagation()} onClick={onToggleLeft}><ChevronLeft size={13} /></button></div>}
      {!leftOpen && <button type="button" className="panel-reopen left" title="显示文献面板" onClick={onToggleLeft}><PanelLeftOpen size={15} /></button>}
      <main className="layout-center">{center}</main>
      {!rightOpen && <button type="button" className="panel-reopen right" title="显示批注面板" onClick={onToggleRight}><PanelRightOpen size={15} /></button>}
      {rightOpen && <div className="resize-handle right" onPointerDown={() => setDragging('right')}><button type="button" className="panel-edge-toggle" title="隐藏批注面板" onPointerDown={(event) => event.stopPropagation()} onClick={onToggleRight}><ChevronRight size={13} /></button></div>}
      {rightOpen && <aside className="layout-panel layout-right" style={{ width: rightWidth }}>{right}</aside>}
    </div>
  )
}
