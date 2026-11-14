import { FileText, Highlighter, Image, MapPin, RotateCcw, Trash2, X, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { annotationKind, type DocumentRecord, type TrashedRegionRecord } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  documents: DocumentRecord[]
  onClose(): void
  onChanged(documentId: string): Promise<void>
  onError(error: unknown): void
}

export function TrashDialog({ open, documents, onClose, onChanged, onError }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [entries, setEntries] = useState<TrashedRegionRecord[]>([])
  const [busyId, setBusyId] = useState<string>()
  const names = useMemo(() => new Map(documents.map((document) => [document.id, document.title])), [documents])

  const load = async (): Promise<void> => setEntries(await window.knowex.region.listTrash())
  useEffect(() => { if (open) void load().catch(onError) }, [open])
  if (!open) return null

  const change = async (entry: TrashedRegionRecord, action: 'restore' | 'purge'): Promise<void> => {
    const id = entry.region.note.id
    if (action === 'purge' && !window.confirm(t('region.purgeConfirm'))) return
    setBusyId(id)
    try {
      if (action === 'restore') await window.knowex.region.restore(id)
      else await window.knowex.region.purge(id)
      setEntries((value) => value.filter((item) => item.region.note.id !== id))
      await onChanged(entry.region.asset.anchor.documentId)
    } catch (error) { onError(error) } finally { setBusyId(undefined) }
  }

  return <div className="dialog-backdrop trash-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dialog trash-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-header"><div><small className="dialog-eyebrow">KNOWEX WORKSPACE</small><h2>{t('trash.title')}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="trash-toolbar"><div><Trash2 size={18} /><span><strong>{t('trash.count', { count: entries.length })}</strong><small>{t('trash.retention')}</small></span></div></div>
      <div className="trash-page-list">
        {entries.length === 0 && <div className="trash-page-empty"><Trash2 size={34} /><h3>{t('region.trashEmpty')}</h3><p>{t('trash.emptyHint')}</p></div>}
        {entries.map((entry) => {
          const region = entry.region
          const kind = annotationKind(region)
          const remaining = Math.max(0, Math.ceil((new Date(entry.purgeAfter).getTime() - Date.now()) / 86_400_000))
          return <article className="trash-page-row" key={region.note.id}>
            <div className="trash-page-preview">{kind === 'snapshot' && region.asset.previewDataUrl
              ? <img src={region.asset.previewDataUrl} alt="" />
              : kind === 'highlight' || kind === 'underline' ? <Highlighter size={22} /> : kind === 'note' ? <MapPin size={22} /> : kind === 'zotero' ? <FileText size={22} /> : <Image size={22} />}</div>
            <div className="trash-page-copy"><strong>{region.note.title || t(kind === 'highlight' ? 'region.highlight' : kind === 'underline' ? 'region.underline' : kind === 'note' ? 'region.note' : kind === 'zotero' ? 'region.zotero' : 'region.untitled')}</strong><span>{names.get(region.asset.anchor.documentId) || region.asset.anchor.documentId}</span><small>{t('common.page', { page: region.asset.anchor.pageOrSlide })} · {t('trash.daysLeft', { count: remaining })}</small></div>
            <div className="trash-page-actions"><button type="button" className="button" disabled={busyId === region.note.id} onClick={() => void change(entry, 'restore')}><RotateCcw size={14} />{t('region.restore')}</button><button type="button" className="button danger-ghost" disabled={busyId === region.note.id} onClick={() => void change(entry, 'purge')}><XCircle size={14} />{t('region.purge')}</button></div>
          </article>
        })}
      </div>
      <div className="dialog-actions"><button type="button" className="button primary" onClick={onClose}>{t('common.close')}</button></div>
    </section>
  </div>
}
