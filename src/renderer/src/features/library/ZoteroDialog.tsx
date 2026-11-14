import { BookOpen, CheckCircle2, CircleAlert, Power, RefreshCw, Settings2, X } from 'lucide-react'
import type { ZoteroAttachment, ZoteroConnectionStatus } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { ZoteroCollectionTree } from './ZoteroCollectionTree'

interface Props {
  open: boolean
  loading: boolean
  status?: ZoteroConnectionStatus
  attachments: ZoteroAttachment[]
  error?: string
  onClose(): void
  onRefresh(): void
  onOpen(attachment: ZoteroAttachment): void
  onConfigure(attachment: ZoteroAttachment): void
}

export function ZoteroDialog(props: Props): React.JSX.Element | null {
  const { t } = useI18n()
  if (!props.open) return null
  const statusMessage = props.status
    ? t(props.status.state === 'ready' ? 'zotero.status.ready'
      : props.status.state === 'disabled' ? 'zotero.status.disabled'
        : props.status.state === 'offline' ? 'zotero.status.offline'
          : props.status.state === 'unsupported' ? 'zotero.status.unsupported'
            : 'zotero.status.error')
    : ''
  const version = props.status?.clientVersion ? ` · Zotero ${props.status.clientVersion}` : ''
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="dialog zotero-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header"><h2>{t('zotero.title')}</h2><button type="button" className="icon-button" onClick={props.onClose}><X size={18} /></button></div>
        {props.status && (
          <div className={`zotero-status ${props.status.state}`}>
            {props.status.state === 'ready' ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
            <div><strong>{props.status.state === 'ready' ? t('zotero.connected', { version }) : t('zotero.needsSetup')}</strong><span>{statusMessage}</span></div>
          </div>
        )}
        {props.error && <div className="inline-error">{props.error}</div>}
        {props.loading && !props.status ? (
          <div className="zotero-empty"><RefreshCw className="is-spinning" size={22} /><strong>{t('zotero.checking')}</strong><p>{t('zotero.checkingHint')}</p></div>
        ) : props.status?.state !== 'ready' ? (
          <div className="zotero-setup-guide">
            <h3>{t('zotero.setupTitle')}</h3>
            <ol>
              <li><span><Power size={15} /></span><div><strong>{t('zotero.step1')}</strong><p>{t('zotero.step1Hint')}</p></div></li>
              <li><span><Settings2 size={15} /></span><div><strong>{t('zotero.step2')}</strong><p>{t('zotero.step2Hint')}</p></div></li>
              <li><span>✓</span><div><strong>{t('zotero.step3')}</strong><p>{t('zotero.step3Hint')}</p></div></li>
              <li><span><RefreshCw size={15} /></span><div><strong>{t('zotero.step4')}</strong><p>{t('zotero.step4Hint')}</p></div></li>
            </ol>
          </div>
        ) : (
          <div className="zotero-list">
            {props.loading && <p className="empty-copy">{t('zotero.loadingAttachments')}</p>}
            {!props.loading && props.attachments.length === 0 && <div className="zotero-empty"><BookOpen size={22} /><strong>{t('zotero.emptyTitle')}</strong><p>{t('zotero.emptyBody')}</p></div>}
            {props.attachments.length > 0 && <ZoteroCollectionTree attachments={props.attachments} detailed onOpen={props.onOpen} onConfigure={props.onConfigure} />}
          </div>
        )}
        <div className="dialog-actions"><button type="button" className="button primary" disabled={props.loading} onClick={props.onRefresh}><RefreshCw size={15} />{props.status?.state === 'ready' ? t('zotero.refresh') : t('zotero.retry')}</button><button type="button" className="button" onClick={props.onClose}>{t('common.close')}</button></div>
      </section>
    </div>
  )
}
