/** Text-selection toolbar combines annotation colors with immediate evidence actions. */
import { Highlighter, Underline } from 'lucide-react'
import type { AnnotationColor, AnnotationKind } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { EvidenceQuickActions } from '../research/EvidenceQuickActions'
import type { EvidenceTool } from '../research/evidence-workflow'

const colors: AnnotationColor[] = ['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray']

interface Props {
  x: number
  y: number
  kind: Extract<AnnotationKind, 'highlight' | 'underline'>
  onKindChange(kind: Extract<AnnotationKind, 'highlight' | 'underline'>): void
  onCreate(color: AnnotationColor): void
  onQuickAction(tool: EvidenceTool): void
  onCopy(): void
}

export function SelectionToolbar({ x, y, kind, onKindChange, onCreate, onQuickAction, onCopy }: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div
      className="selection-toolbar"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      role="toolbar"
      aria-label={t('reader.selectionTools')}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className="selection-colors">
        {colors.map((color) => <button
          type="button"
          key={color}
          className={`color-${color}`}
          title={t('reader.createMarkup', { kind: kind === 'highlight' ? t('region.highlight') : t('region.underline'), color })}
          aria-label={color}
          onClick={() => onCreate(color)}
        />)}
      </div>
      <div className="selection-kinds">
        <button type="button" className={kind === 'highlight' ? 'active' : ''} title={t('region.highlight')} onClick={() => onKindChange('highlight')}><Highlighter size={18} /></button>
        <button type="button" className={kind === 'underline' ? 'active' : ''} title={t('region.underline')} onClick={() => onKindChange('underline')}><Underline size={18} /></button>
      </div>
      <EvidenceQuickActions onAction={onQuickAction} onCopy={onCopy} />
    </div>
  )
}
