/**
 * Web Workspace Switcher and Creator dialog.
 * Allows switching between server-managed workspaces or creating a new named
 * workspace in browser mode where native OS folder pickers do not exist.
 */
import { CheckCircle2, FolderOpen, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WebWorkspaceSummary } from '@shared/contracts/api'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  onSelect(name: string): Promise<void>
  onClose(): void
  onError(error: unknown): void
}

export function WorkspaceDialog({ open, onSelect, onClose, onError }: Props): React.JSX.Element | null {
  const { language, t } = useI18n()
  const [workspaces, setWorkspaces] = useState<WebWorkspaceSummary[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const copy = language === 'en-US'
    ? {
        eyebrow: 'WEB WORKSPACE',
        title: 'Choose or Create Workspace',
        subtitle: 'Each workspace isolates its own documents, region screenshots, Markdown notes, and trash index.',
        existing: 'Available workspaces',
        docs: (n: number) => `${n} documents`,
        active: 'Active',
        switchBtn: 'Switch',
        createLabel: 'Create new workspace',
        createPlaceholder: 'e.g. thesis-2026',
        createBtn: 'Create & Switch'
      }
    : {
        eyebrow: '网页端工作区',
        title: '选择或新建工作区',
        subtitle: '每个工作区独立保存文献、页面截图、Markdown 笔记与回收站索引。',
        existing: '已有工作区',
        docs: (n: number) => `${n} 篇文献`,
        active: '当前使用',
        switchBtn: '切换',
        createLabel: '新建工作区',
        createPlaceholder: '例如：thesis-2026',
        createBtn: '创建并切换'
      }

  const refresh = async (): Promise<void> => {
    if (!window.knowex.workspace.listWorkspaces) return
    setLoading(true)
    try {
      const result = await window.knowex.workspace.listWorkspaces()
      setWorkspaces(result.workspaces)
    } catch (error) {
      onError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setNewName('')
      void refresh()
    }
  }, [open])

  if (!open) return null

  const handleSelect = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onSelect(trimmed)
      onClose()
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose() }}>
      <section className="dialog workspace-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <small className="dialog-eyebrow">{copy.eyebrow}</small>
            <h2 id="workspace-dialog-title">{copy.title}</h2>
            <p className="workspace-dialog-subtitle">{copy.subtitle}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t('common.close')} disabled={busy} onClick={onClose}><X size={18} /></button>
        </div>

        <div className="workspace-picker-section">
          <strong>{copy.existing}</strong>
          {loading ? (
            <p className="empty-copy">…</p>
          ) : (
            <div className="workspace-list">
              {workspaces.map((item) => (
                <div key={item.name} className={`workspace-row ${item.active ? 'active' : ''}`}>
                  <FolderOpen size={17} />
                  <div className="workspace-row-meta">
                    <strong>{item.name}</strong>
                    <small>{copy.docs(item.documentCount)}{item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleDateString(language)}` : ''}</small>
                  </div>
                  {item.active ? (
                    <span className="workspace-active-badge"><CheckCircle2 size={14} />{copy.active}</span>
                  ) : (
                    <button type="button" className="button" disabled={busy} onClick={() => void handleSelect(item.name)}>{copy.switchBtn}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form className="workspace-create-form" onSubmit={(event) => { event.preventDefault(); void handleSelect(newName) }}>
          <label className="field">
            <span>{copy.createLabel}</span>
            <div className="workspace-create-row">
              <input value={newName} maxLength={64} placeholder={copy.createPlaceholder} onChange={(event) => setNewName(event.target.value)} />
              <button type="submit" className="button primary" disabled={busy || !newName.trim()}><Plus size={15} />{copy.createBtn}</button>
            </div>
          </label>
        </form>
      </section>
    </div>
  )
}
