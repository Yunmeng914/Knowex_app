import { ArrowRight, CloudUpload, Download, Settings2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ZoteroAttachment, ZoteroOpenOptions } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  attachment?: ZoteroAttachment
  webConfigured: boolean
  loading: boolean
  initialOptions: ZoteroOpenOptions
  preferenceScope: 'default' | 'item'
  onCancel(): void
  onConfigure(): void
  onConfirm(options: ZoteroOpenOptions): void
}

export function ZoteroSyncDialog({ attachment, webConfigured, loading, initialOptions, preferenceScope, onCancel, onConfigure, onConfirm }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [importAnnotations, setImportAnnotations] = useState(true)
  const [exportKnowex, setExportKnowex] = useState(false)
  useEffect(() => { setImportAnnotations(initialOptions.importAnnotations); setExportKnowex(initialOptions.exportKnowex) }, [attachment?.key, initialOptions.importAnnotations, initialOptions.exportKnowex])
  if (!attachment) return null
  return (
    <div className="dialog-backdrop sync-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="dialog zotero-sync-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header"><div><small className="dialog-eyebrow">ZOTERO ↔ KNOWEX</small><h2>{t('zotero.syncTitle')}</h2></div><button type="button" className="icon-button" onClick={onCancel}><X size={18} /></button></div>
        <div className="sync-document"><strong>{attachment.title}</strong><span>{[attachment.creators, attachment.year, attachment.filename].filter(Boolean).join(' · ')}</span></div>
        <p className="sync-default-hint">{t(preferenceScope === 'default' ? 'zotero.syncDefaultHint' : 'zotero.syncItemHint')}</p>
        <label className="sync-option"><input type="checkbox" checked={importAnnotations} onChange={(event) => setImportAnnotations(event.target.checked)} /><Download size={19} /><span><strong>{t('zotero.importOption')}</strong><small>{t('zotero.importOptionHint')}</small></span></label>
        <label className="sync-option"><input type="checkbox" checked={exportKnowex} onChange={(event) => setExportKnowex(event.target.checked)} /><CloudUpload size={19} /><span><strong>{t('zotero.exportOption')}</strong><small>{t('zotero.exportOptionHint')}</small></span></label>
        {exportKnowex && !webConfigured && <div className="sync-warning"><p>{t('zotero.exportNeedsKey')}</p><button type="button" className="button" onClick={onConfigure}><Settings2 size={15} />{t('zotero.configureWrite')}</button></div>}
        <p className="sync-privacy">{t('zotero.syncPrivacy')}</p>
        <div className="dialog-actions"><button type="button" className="button" onClick={onCancel}>{t('common.cancel')}</button><button type="button" className="button primary" disabled={loading || (exportKnowex && !webConfigured)} onClick={() => onConfirm({ importAnnotations, exportKnowex })}>{t('zotero.openDocument')}<ArrowRight size={15} /></button></div>
      </section>
    </div>
  )
}
