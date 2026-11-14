/**
 * Web Markdown Note Preview & Export dialog.
 * Replaces Electron's `shell.openPath` / `shell.showItemInFolder` by letting
 * browser users inspect live generated Markdown notes, copy them, or download `.md` / workspace bundles.
 */
import { Check, Clipboard, Download, FileText, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WebNoteDocument, WebWorkspaceExport } from '@shared/contracts/api'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  documentId?: string
  onClose(): void
  onError(error: unknown): void
}

export function MarkdownPreviewDialog({ open, documentId, onClose, onError }: Props): React.JSX.Element | null {
  const { language, t } = useI18n()
  const [note, setNote] = useState<WebNoteDocument>()
  const [bundle, setBundle] = useState<WebWorkspaceExport>()
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = language === 'en-US'
    ? {
        eyebrow: 'MARKDOWN EXPORT',
        noteTitle: 'Document Markdown Note',
        workspaceTitle: 'Workspace Notes Overview',
        copy: 'Copy Markdown',
        copied: 'Copied',
        download: 'Download .md',
        downloadBundle: 'Download All Notes (.json)',
        noNotes: 'No Markdown notes have been generated in this workspace yet. Create an annotation on a document first.',
        noteCount: (n: number) => `${n} Markdown note files in current workspace`
      }
    : {
        eyebrow: 'MARKDOWN 笔记导出',
        noteTitle: '当前文献 Markdown 笔记',
        workspaceTitle: '工作区笔记总览',
        copy: '复制 Markdown',
        copied: '已复制',
        download: '下载 .md',
        downloadBundle: '导出全部笔记 (.json)',
        noNotes: '当前工作区尚未生成 Markdown 笔记，请先在文献中创建一条批注。',
        noteCount: (n: number) => `当前工作区共有 ${n} 份 Markdown 笔记`
      }

  useEffect(() => {
    if (!open) return
    setCopied(false)
    setNote(undefined)
    setBundle(undefined)
    setLoading(true)
    const load = async (): Promise<void> => {
      try {
        if (documentId && window.knowex.workspace.readNote) {
          setNote(await window.knowex.workspace.readNote(documentId))
        } else if (window.knowex.workspace.exportWorkspace) {
          setBundle(await window.knowex.workspace.exportWorkspace())
        }
      } catch (error) {
        onError(error)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [open, documentId])

  if (!open) return null

  const copyContent = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      onError(error)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog markdown-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="markdown-preview-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <small className="dialog-eyebrow">{copy.eyebrow}</small>
            <h2 id="markdown-preview-title">{note ? note.title : documentId ? copy.noteTitle : copy.workspaceTitle}</h2>
            {note && <small className="markdown-preview-path">{note.relativePath}</small>}
          </div>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <p className="empty-copy">…</p>
        ) : note ? (
          <>
            <pre className="markdown-preview-code">{note.content}</pre>
            <div className="dialog-actions">
              <button type="button" className="button" onClick={() => void copyContent(note.content)}>
                {copied ? <Check size={15} /> : <Clipboard size={15} />}
                {copied ? copy.copied : copy.copy}
              </button>
              <button type="button" className="button primary" onClick={() => triggerTextDownload(note.filename, note.content, 'text/markdown;charset=utf-8')}>
                <Download size={15} />
                {copy.download}
              </button>
              <button type="button" className="button" onClick={onClose}>{t('common.close')}</button>
            </div>
          </>
        ) : bundle ? (
          <>
            <p className="empty-copy">{bundle.notes.length > 0 ? copy.noteCount(bundle.notes.length) : copy.noNotes}</p>
            {bundle.notes.length > 0 && (
              <div className="workspace-notes-list">
                {bundle.notes.map((entry) => (
                  <article key={entry.path} className="workspace-note-item">
                    <div className="workspace-note-item-header">
                      <span><FileText size={15} /><strong>{entry.path}</strong></span>
                      <button type="button" className="button" onClick={() => triggerTextDownload(entry.path.split('/').pop() || 'note.md', entry.content, 'text/markdown;charset=utf-8')}>
                        <Download size={14} />{copy.download}
                      </button>
                    </div>
                    <pre className="markdown-preview-code compact">{entry.content.slice(0, 600)}{entry.content.length > 600 ? '\n…' : ''}</pre>
                  </article>
                ))}
              </div>
            )}
            <div className="dialog-actions">
              {bundle.notes.length > 0 && (
                <button type="button" className="button primary" onClick={() => triggerTextDownload(`${bundle.workspaceName}-notes.json`, JSON.stringify(bundle, null, 2), 'application/json;charset=utf-8')}>
                  <Download size={15} />{copy.downloadBundle}
                </button>
              )}
              <button type="button" className="button" onClick={onClose}>{t('common.close')}</button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}

function triggerTextDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
