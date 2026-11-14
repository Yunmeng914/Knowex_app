import { Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  busy: boolean
  onCancel(): void
  onConfirm(doNotAskAgain: boolean): Promise<void>
}

export function DeleteAnnotationDialog({ open, busy, onCancel, onConfirm }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [doNotAskAgain, setDoNotAskAgain] = useState(false)

  useEffect(() => {
    if (open) setDoNotAskAgain(false)
  }, [open])

  if (!open) return null
  return (
    <div className="dialog-backdrop delete-annotation-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="dialog delete-annotation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-annotation-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="onboarding-close" title={t('common.close')} disabled={busy} onClick={onCancel}><X size={18} /></button>
        <div className="delete-annotation-icon"><Trash2 size={22} /></div>
        <h2 id="delete-annotation-title">{t('deleteDialog.title')}</h2>
        <p>{t('deleteDialog.body')}</p>
        <label className="checkbox-field delete-annotation-choice"><input type="checkbox" checked={doNotAskAgain} onChange={(event) => setDoNotAskAgain(event.target.checked)} /><span>{t('deleteDialog.doNotAskAgain')}</span></label>
        <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button><button type="button" className="button delete-confirm" disabled={busy} onClick={() => void onConfirm(doNotAskAgain)}><Trash2 size={14} />{t('deleteDialog.confirm')}</button></div>
      </section>
    </div>
  )
}
