/**
 * Context menu shown only when a PDF text selection is active.
 * It replaces document-layout commands with evidence actions and closes on outside input or Escape.
 */
import { useEffect, useRef } from 'react'
import { EvidenceQuickActions } from './EvidenceQuickActions'
import type { EvidenceTool } from './evidence-workflow'

interface Props {
  x: number
  y: number
  onAction(tool: EvidenceTool): void
  onCopy(): void
  onClose(): void
}

export function EvidenceContextMenu({ x, y, onAction, onCopy, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => { if (!ref.current?.contains(event.target as Node)) onClose() }
    const closeEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeEscape)
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { window.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeEscape) }
  }, [onClose])

  const finish = (callback: () => void): void => { callback(); onClose() }
  return <div ref={ref} className="evidence-context-menu" style={{ left: x, top: y }} role="menu">
    <EvidenceQuickActions layout="menu" onAction={(tool) => finish(() => onAction(tool))} onCopy={() => finish(onCopy)} />
  </div>
}
