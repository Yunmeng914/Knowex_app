/**
 * Presents the reader's frequent actions while grouping less frequent view,
 * reading-mode, and split-screen controls in one menu. PdfReader owns state and
 * behavior; this file only coordinates toolbar interaction and accessibility.
 */
import { Baseline, ChevronLeft, ChevronRight, Columns2, Highlighter, Maximize2, Minus, PanelLeftClose, PanelLeftOpen, Plus, Rows2, Rows3, Square, StickyNote, Underline } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AnnotationColor, ReadingMode } from '@shared/domain/models'
import type { ReaderTool } from '../capture/CaptureOverlay'
import { useI18n } from '../../i18n/I18nProvider'
import type { SplitMode } from './ReaderContextMenu'
import type { FitMode, ReaderTheme } from './reader-types'

interface Props {
  navigatorOpen: boolean
  scale: number
  fitMode: FitMode
  theme: ReaderTheme
  tool: ReaderTool
  lockedColor: AnnotationColor
  mode: ReadingMode
  split: SplitMode
  page: number
  totalPages: number
  rendering: boolean
  onToggleNavigator(): void
  onScaleChange(scale: number): void
  onFitWidth(): void
  onThemeChange(theme: ReaderTheme): void
  onToolChange(tool: ReaderTool): void
  onColorChange(color: AnnotationColor): void
  onModeChange(mode: ReadingMode): void
  onSplit(mode: Exclude<SplitMode, 'none'>): void
  onPageChange(page: number): void
}

const annotationColors: AnnotationColor[] = ['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray']

export function ReaderToolbar(props: Props): React.JSX.Element {
  const { t } = useI18n()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const appearanceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!appearanceOpen) return
    const dismiss = (event: MouseEvent): void => {
      if (!appearanceRef.current?.contains(event.target as Node)) setAppearanceOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [appearanceOpen])

  return (
    <div className="reader-controls">
      <button type="button" className={`icon-button ${props.navigatorOpen ? 'active' : ''}`} title={t('reader.navigation')} onClick={props.onToggleNavigator}>{props.navigatorOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
      <span className="control-divider" />
      <button type="button" className="icon-button" title={t('reader.zoomOut')} onClick={() => props.onScaleChange(props.scale - 0.12)}><Minus size={16} /></button>
      <span className="zoom-value">{Math.round(props.scale * 100)}%</span>
      <button type="button" className="icon-button" title={t('reader.zoomIn')} onClick={() => props.onScaleChange(props.scale + 0.12)}><Plus size={16} /></button>
      <button type="button" className={`icon-button ${props.fitMode === 'width' ? 'active' : ''}`} title={t('reader.fitWidth')} onClick={props.onFitWidth}><Maximize2 size={15} /></button>
      <div className="appearance-control" ref={appearanceRef}>
        <button type="button" className={`icon-button ${appearanceOpen ? 'active' : ''}`} title={t('reader.appearance')} aria-haspopup="menu" aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen((value) => !value)} onKeyDown={(event) => { if (event.key === 'Escape') setAppearanceOpen(false) }}><Baseline size={17} /></button>
        <div className="appearance-popover" role="menu" aria-label={t('reader.appearance')} hidden={!appearanceOpen}>
          <strong>{t('reader.theme')}</strong>
          <div className="appearance-options theme-options">{(['light', 'sepia', 'dark'] as ReaderTheme[]).map((value) => <button type="button" role="menuitem" key={value} className={`${value} ${props.theme === value ? 'active' : ''}`} onClick={() => props.onThemeChange(value)}>{t(`reader.theme.${value}` as 'reader.theme.light')}</button>)}</div>
          <strong>{t('reader.layout')}</strong>
          <div className="appearance-options layout-options">
            <button type="button" role="menuitem" data-reader-mode="single" className={props.mode === 'single' ? 'active' : ''} onClick={() => props.onModeChange('single')}><Square size={15} />{t('reader.single')}</button>
            <button type="button" role="menuitem" data-reader-mode="continuous" className={props.mode === 'continuous' ? 'active' : ''} onClick={() => props.onModeChange('continuous')}><Rows3 size={16} />{t('reader.continuous')}</button>
            <button type="button" role="menuitem" data-reader-split="horizontal" className={props.split === 'horizontal' ? 'active' : ''} onClick={() => props.onSplit('horizontal')}><Rows2 size={16} />{t('reader.splitHorizontal')}</button>
            <button type="button" role="menuitem" data-reader-split="vertical" className={props.split === 'vertical' ? 'active' : ''} onClick={() => props.onSplit('vertical')}><Columns2 size={16} />{t('reader.splitVertical')}</button>
          </div>
        </div>
      </div>
      <span className="control-divider" />
      <button type="button" className={`icon-button ${props.tool === 'highlight' ? 'active annotation-tool' : ''}`} title={t('reader.lockedHighlight')} onClick={() => props.onToolChange(props.tool === 'highlight' ? 'none' : 'highlight')}><Highlighter size={16} /></button>
      <button type="button" className={`icon-button ${props.tool === 'underline' ? 'active annotation-tool' : ''}`} title={t('reader.lockedUnderline')} onClick={() => props.onToolChange(props.tool === 'underline' ? 'none' : 'underline')}><Underline size={16} /></button>
      <div className="annotation-color-control">
        <button type="button" className={`locked-color-button color-${props.lockedColor}`} title={t('reader.annotationColor')} onClick={() => setColorPickerOpen((value) => !value)} />
        {colorPickerOpen && <div className="locked-color-popover">{annotationColors.map((color) => <button type="button" key={color} className={`color-${color} ${props.lockedColor === color ? 'active' : ''}`} aria-label={color} onClick={() => { props.onColorChange(color); setColorPickerOpen(false) }} />)}</div>}
      </div>
      <button type="button" className={`icon-button ${props.tool === 'note' ? 'active annotation-tool' : ''}`} title={t('reader.note')} onClick={() => props.onToolChange(props.tool === 'note' ? 'none' : 'note')}><StickyNote size={16} /></button>
      <span className="control-divider" />
      <button type="button" className="icon-button" title={t('reader.previous')} disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}><ChevronLeft size={17} /></button>
      <label className="page-control"><input value={props.page} aria-label={t('reader.pageNumber')} min={1} max={props.totalPages} type="number" onChange={(event) => props.onPageChange(Number(event.target.value))} /><span>/ {props.totalPages}</span></label>
      <button type="button" className="icon-button" title={t('reader.next')} disabled={props.page >= props.totalPages} onClick={() => props.onPageChange(props.page + 1)}><ChevronRight size={17} /></button>
      {props.rendering && <span className="reader-loading">{t('reader.rendering')}</span>}
    </div>
  )
}
