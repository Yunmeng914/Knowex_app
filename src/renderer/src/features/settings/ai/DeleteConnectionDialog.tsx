import type { AIConnectionPublic } from '@shared/domain/models'
import { useI18n } from '../../../i18n/I18nProvider'
import { deleteConnectionCopy } from './ai-connection-ui'

interface Props {
  connection?: AIConnectionPublic
  totalConnections: number
  busy: boolean
  onCancel(): void
  onConfirm(connectionId: string): void
}

export function DeleteConnectionDialog({ connection, totalConnections, busy, onCancel, onConfirm }: Props): React.JSX.Element | null {
  const { language } = useI18n()
  const text = language === 'en-US'
    ? { cancel: 'Cancel', delete: 'Delete' }
    : { cancel: '取消', delete: '删除' }
  if (!connection) return null
  const copy = deleteConnectionCopy(connection, totalConnections, language)
  return (
    <div className="dialog-backdrop ai-nested-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="dialog delete-annotation-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{copy.title}</h2>
        {copy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onCancel}>{text.cancel}</button>
          <button type="button" className="button delete-confirm" disabled={busy} onClick={() => onConfirm(connection.id)}>{text.delete}</button>
        </div>
      </section>
    </div>
  )
}
