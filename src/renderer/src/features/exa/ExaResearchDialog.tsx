/**
 * Lightweight global Exa dialog for searches that do not begin inside an annotation.
 * Annotation-scoped searches reuse ExaSearchPanel directly and avoid this modal.
 */
import { X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { ExaSearchPanel } from './ExaSearchPanel'

interface Props {
  open: boolean
  initialContext?: string
  initialInstruction?: string
  documentTitle?: string
  onClose(): void
  onConfigure(): void
}

export function ExaResearchDialog({ open, initialContext, initialInstruction, documentTitle, onClose, onConfigure }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  if (!open) return null
  return <div className="dialog-backdrop exa-dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dialog exa-research-dialog" role="dialog" aria-modal="true" aria-labelledby="exa-research-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-header">
        <div><span className="dialog-eyebrow">EXA · ACADEMIC FIRST</span><h2 id="exa-research-title">{t('exa.title')}</h2>{documentTitle && <p className="exa-dialog-subtitle">{documentTitle}</p>}</div>
        <button type="button" className="icon-button" title={t('common.close')} onClick={onClose}><X size={18} /></button>
      </div>
      <ExaSearchPanel context={initialContext} initialQuery={initialInstruction} onConfigure={onConfigure} />
    </section>
  </div>
}
