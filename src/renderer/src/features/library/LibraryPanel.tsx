import { BookOpen, FileText, FolderClock } from 'lucide-react'
import { useState } from 'react'
import type { DocumentRecord, ZoteroAttachment } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { ZoteroCollectionTree } from './ZoteroCollectionTree'

interface Props {
  documents: DocumentRecord[]
  zoteroAttachments: ZoteroAttachment[]
  activeDocumentId?: string
  onOpen(documentId: string): void
  onOpenZotero(): void
  onOpenZoteroAttachment(attachment: ZoteroAttachment): void
  onConfigureZoteroAttachment(attachment: ZoteroAttachment): void
}

export function LibraryPanel({ documents, zoteroAttachments, activeDocumentId, onOpen, onOpenZotero, onOpenZoteroAttachment, onConfigureZoteroAttachment }: Props): React.JSX.Element {
  const { t, language } = useI18n()
  const [zoteroExpanded, setZoteroExpanded] = useState(() => localStorage.getItem('knowex:library-zotero-expanded') !== 'false')
  const [recentExpanded, setRecentExpanded] = useState(() => localStorage.getItem('knowex:library-recent-expanded') !== 'false')
  return (
    <div className="sidebar-content">
      <div className="panel-heading"><h2>{t('library.title')}</h2></div>
      <button type="button" className="source-action" onClick={onOpenZotero}><BookOpen size={17} /><span><strong>{t('library.zotero')}</strong><small>{t('library.zoteroHint')}</small></span></button>
      {zoteroAttachments.length > 0 && <details className="library-section" open={zoteroExpanded} onToggle={(event) => { const open = event.currentTarget.open; setZoteroExpanded(open); localStorage.setItem('knowex:library-zotero-expanded', String(open)) }}><summary className="section-label"><BookOpen size={14} /> <span>{t('library.zoteroSynced')}</span></summary><div className="zotero-catalog"><ZoteroCollectionTree attachments={zoteroAttachments.slice(0, 100)} onOpen={onOpenZoteroAttachment} onConfigure={onConfigureZoteroAttachment} /></div></details>}
      <details className="library-section" open={recentExpanded} onToggle={(event) => { const open = event.currentTarget.open; setRecentExpanded(open); localStorage.setItem('knowex:library-recent-expanded', String(open)) }}><summary className="section-label"><FolderClock size={14} /> <span>{t('library.recent')}</span></summary>
      <div className="document-list">
        {documents.length === 0 && <p className="empty-copy">{t('library.empty')}</p>}
        {documents.map((document) => (
          <button type="button" key={document.id} className={`document-item ${document.id === activeDocumentId ? 'active' : ''}`} onClick={() => onOpen(document.id)}>
            <FileText size={16} />
            <span><strong>{document.title}</strong><small>{document.source === 'zotero' ? 'Zotero' : document.kind.toUpperCase()} · {new Date(document.openedAt).toLocaleDateString(language)}</small></span>
          </button>
        ))}
      </div>
      </details>
    </div>
  )
}
