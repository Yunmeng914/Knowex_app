/**
 * Reusable in-app confirmation modal replacing native `window.confirm` dialogs.
 * Keeps destructive and external write-back confirmations accessible inside iframe/web contexts.
 */
import { TriangleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, tone = 'danger', busy = false, onConfirm, onCancel }: Props): React.JSX.Element | null {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="dialog-backdrop delete-annotation-backdrop" role="presentation" onMouseDown={() => { if (!busy) onCancel() }}>
      <section className="dialog delete-annotation-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="onboarding-close" aria-label={t('common.close')} disabled={busy} onClick={onCancel}><X size={17} /></button>
        <div className="delete-annotation-icon"><TriangleAlert size={22} /></div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</button>
          <button type="button" className={`button ${tone === 'danger' ? 'delete-confirm' : 'primary'}`} disabled={busy} onClick={onConfirm}>{confirmLabel ?? t('common.delete')}</button>
        </div>
      </section>
    </div>
  )
}
