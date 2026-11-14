import { Check, Copy, Minus, PanelLeft, PanelTop, Plus, ScanLine } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n/I18nProvider'

export type SplitMode = 'none' | 'horizontal' | 'vertical'

interface Props {
  x: number
  y: number
  hasSelection: boolean
  split: SplitMode
  canPrevious: boolean
  canNext: boolean
  onCopy(): void
  onZoomIn(): void
  onZoomOut(): void
  onActualSize(): void
  onFitWidth(): void
  onFitHeight(): void
  onSplit(mode: Exclude<SplitMode, 'none'>): void
  onPrevious(): void
  onNext(): void
  onClose(): void
}

export function ReaderContextMenu(props: Props): React.JSX.Element {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) props.onClose()
    }
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') props.onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape) }
  }, [props.onClose])

  const action = (callback: () => void): (() => void) => () => { callback(); props.onClose() }
  return (
    <div ref={ref} className="reader-context-menu" style={{ left: props.x, top: props.y }} role="menu">
      <button type="button" disabled={!props.hasSelection} onClick={action(props.onCopy)}><Copy size={15} />{t('reader.copy')}</button>
      <span className="context-separator" />
      <button type="button" onClick={action(props.onZoomIn)}><Plus size={15} />{t('reader.zoomIn')}</button>
      <button type="button" onClick={action(props.onZoomOut)}><Minus size={15} />{t('reader.zoomOut')}</button>
      <button type="button" onClick={action(props.onActualSize)}><ScanLine size={15} />{t('reader.actualSize')}</button>
      <button type="button" onClick={action(props.onFitWidth)}><PanelLeft size={15} />{t('reader.fitWidth')}</button>
      <button type="button" onClick={action(props.onFitHeight)}><PanelTop size={15} />{t('reader.fitHeight')}</button>
      <span className="context-separator" />
      <button type="button" onClick={action(() => props.onSplit('horizontal'))}>{props.split === 'horizontal' ? <Check size={15} /> : <PanelTop size={15} />}{t('reader.splitHorizontal')}</button>
      <button type="button" onClick={action(() => props.onSplit('vertical'))}>{props.split === 'vertical' ? <Check size={15} /> : <PanelLeft size={15} />}{t('reader.splitVertical')}</button>
      <span className="context-separator" />
      <button type="button" disabled={!props.canNext} onClick={action(props.onNext)}>{t('reader.next')}</button>
      <button type="button" disabled={!props.canPrevious} onClick={action(props.onPrevious)}>{t('reader.previous')}</button>
    </div>
  )
}
