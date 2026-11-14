import { Clipboard, FileText, FolderOpen, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WorkspacePaths } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  documentId?: string
  onClose(): void
  onError(error: unknown): void
}

export function StoragePathsDialog({ open, documentId, onClose, onError }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [paths, setPaths] = useState<WorkspacePaths>({
    workspacePath: null,
    notesDirectory: null,
    temporaryDirectory: null,
    recycleBinIndexPath: null,
    documentNotePath: null
  })

  useEffect(() => {
    if (!open) return
    void window.knowex.workspace.paths(documentId).then(setPaths).catch(onError)
  }, [open, documentId])

  if (!open) return null
  const copy = async (value: string | null): Promise<void> => {
    if (!value) return
    try { await navigator.clipboard.writeText(value) } catch (error) { onError(error) }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog storage-paths-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header"><h2>{t('paths.title')}</h2><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
        {!paths.workspacePath ? <p className="empty-copy">{t('paths.empty')}</p> : <div className="path-list">
          <PathRow label={t('paths.workspace')} value={paths.workspacePath} onCopy={() => void copy(paths.workspacePath)} />
          <PathRow label={t('paths.notes')} value={paths.notesDirectory} onCopy={() => void copy(paths.notesDirectory)} />
          <PathRow label={t('paths.temporary')} value={paths.temporaryDirectory} onCopy={() => void copy(paths.temporaryDirectory)} />
          <PathRow label={t('paths.recycleBin')} value={paths.recycleBinIndexPath} onCopy={() => void copy(paths.recycleBinIndexPath)} />
          <PathRow label={t('paths.currentNote')} value={paths.documentNotePath ?? t('paths.noDocument')} onCopy={() => void copy(paths.documentNotePath)} />
        </div>}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={!paths.workspacePath} onClick={() => void window.knowex.workspace.open().catch(onError)}><FolderOpen size={15} />{t('paths.openWorkspace')}</button>
          <button type="button" className="button primary" disabled={!documentId || !paths.workspacePath} onClick={() => documentId && void window.knowex.workspace.revealNote(documentId).catch(onError)}><FileText size={15} />{t('paths.revealNote')}</button>
          <button type="button" className="button" onClick={onClose}>{t('common.close')}</button>
        </div>
      </section>
    </div>
  )
}

function PathRow({ label, value, onCopy }: { label: string; value: string | null; onCopy(): void }): React.JSX.Element {
  const { t } = useI18n()
  return <div className="path-row"><span>{label}</span><code>{value ?? '—'}</code><button type="button" className="icon-button" disabled={!value} title={t('paths.copy')} onClick={onCopy}><Clipboard size={14} /></button></div>
}
