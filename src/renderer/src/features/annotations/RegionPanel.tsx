/**
 * Owns annotation browsing, autosave, trash, and the layered note/Exa/AI workspace.
 * Persistence and AI behavior remain in App session callbacks; the panel keeps
 * drafts isolated and exposes visible plus contextual actions for each record.
 */
import { ArrowLeft, BookOpen, Bot, CheckCircle2, ChevronRight, FileText, Highlighter, Image, MapPin, NotebookPen, Pencil, RotateCcw, Save, Trash2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { annotationKind, type AnnotationColor, type ChatMessage, type RegionRecord, type TrashedRegionRecord } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { ContextActionMenu } from '../../components/ContextActionMenu'
import { AnnotationChat, type TransientChatImage } from '../chat/AnnotationChat'
import type { AnnotationToolRequest } from '../research/evidence-workflow'
import { ExaSearchPanel } from '../exa/ExaSearchPanel'
import { AnnotationToolAccordion } from './AnnotationToolAccordion'

export interface RegionDraft {
  title: string
  annotation: string
  tags: string
  color: AnnotationColor
  conversation: ChatMessage[]
}

export interface SaveRegionOptions {
  closeEditor?: boolean
  silent?: boolean
}

interface Props {
  regions: RegionRecord[]
  trash: TrashedRegionRecord[]
  transientImages: TransientChatImage[]
  activeRegionId?: string
  toolRequest?: AnnotationToolRequest
  busy: boolean
  onSelect(region: RegionRecord): void
  onCloseEditor(): void
  onConfigureExa(): void
  onSave(region: RegionRecord, draft: RegionDraft, options?: SaveRegionOptions): Promise<void>
  onDelete(region: RegionRecord): Promise<void>
  onRestore(entry: TrashedRegionRecord): Promise<void>
  onPurge(entry: TrashedRegionRecord): Promise<void>
  onRemoveTransientImage(id: string): void
  onAsk(region: RegionRecord, question: string, history: ChatMessage[], annotationContext: string, includeRegionImage: boolean, imageDataUrls: string[], requestId: string): Promise<string>
  onCancelAsk(requestId: string): Promise<void>
}

export function RegionPanel({ regions, trash, transientImages, activeRegionId, toolRequest, busy, onSelect, onCloseEditor, onConfigureExa, onSave, onDelete, onRestore, onPurge, onRemoveTransientImage, onAsk, onCancelAsk }: Props): React.JSX.Element {
  const { t } = useI18n()
  const active = useMemo(() => regions.find((region) => region.note.id === activeRegionId), [regions, activeRegionId])
  const [draft, setDraft] = useState<RegionDraft>({ title: '', annotation: '', tags: '', color: 'yellow', conversation: [] })
  const [trashOpen, setTrashOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; region: RegionRecord }>()
  const [openSection, setOpenSection] = useState<'notes' | 'exa' | 'ai' | null>('notes')
  const editRef = useRef<{ region: RegionRecord; draft: RegionDraft; saved: string } | undefined>(undefined)

  const savePending = (): void => {
    const editing = editRef.current
    if (!editing) return
    const snapshot = serializeDraft(editing.draft)
    if (snapshot === editing.saved) return
    editing.saved = snapshot
    void onSave(editing.region, editing.draft, { closeEditor: false, silent: true })
  }

  const updateDraft = (change: (current: RegionDraft) => RegionDraft): void => {
    setDraft((current) => {
      const next = change(current)
      if (editRef.current) editRef.current.draft = next
      return next
    })
  }

  useEffect(() => {
    savePending()
    const next: RegionDraft = active ? {
      title: active.note.title,
      annotation: active.note.annotation,
      tags: active.note.tags.join(', '),
      color: active.asset.color ?? 'yellow',
      conversation: active.note.conversation
    } : { title: '', annotation: '', tags: '', color: 'yellow', conversation: [] }
    setDraft(next)
    setOpenSection('notes')
    editRef.current = active ? { region: active, draft: next, saved: serializeDraft(next) } : undefined
  }, [active?.note.id])

  useEffect(() => {
    if (active && toolRequest?.regionId === active.note.id) setOpenSection(toolRequest.tool)
  }, [active?.note.id, toolRequest?.requestId])

  useEffect(() => () => savePending(), [])

  const activeKind = active ? annotationKind(active) : undefined
  const exaContext = active?.asset.selectedText || [draft.title, draft.annotation].filter((value) => value.trim()).join('\n')
  const titleFor = (region: RegionRecord): string => {
    if (region.note.title) return region.note.title
    const kind = annotationKind(region)
    return kind === 'highlight' ? t('region.highlight') : kind === 'underline' ? t('region.underline') : kind === 'note' ? t('region.note') : kind === 'zotero' ? t('region.zotero') : t('region.untitled')
  }

  return (
    <div className="region-panel">
      <div className="panel-heading"><h2>{trashOpen ? t('region.trash') : t('region.title')}</h2><div className="panel-heading-actions"><button type="button" className={`trash-toggle ${trashOpen ? 'active' : ''}`} title={t('region.trash')} onClick={() => { savePending(); setTrashOpen((value) => !value) }}><Trash2 size={14} /><span>{trash.length}</span></button><span className="count-badge">{trashOpen ? trash.length : regions.length}</span></div></div>
      {trashOpen ? (
        <div className="trash-list">
          <p className="empty-copy">{t('region.trashHint')}</p>
          {trash.length === 0 && <div className="right-empty"><div className="empty-illustration"><Trash2 size={26} /></div><h3>{t('region.trashEmpty')}</h3></div>}
          {trash.map((entry) => <div className="trash-card" key={entry.region.note.id}><div><strong>{titleFor(entry.region)}</strong><small>{t('common.page', { page: entry.region.asset.anchor.pageOrSlide })} · {new Date(entry.deletedAt).toLocaleDateString()}</small></div><button type="button" className="icon-button" disabled={busy} title={t('region.restore')} onClick={() => void onRestore(entry).then(() => setTrashOpen(false))}><RotateCcw size={15} /></button><button type="button" className="icon-button danger-ghost" disabled={busy} title={t('region.purge')} onClick={() => { if (window.confirm(t('region.purgeConfirm'))) void onPurge(entry) }}><XCircle size={15} /></button></div>)}
        </div>
      ) : <>
      {active && regions.length > 1 && (
        <div className="region-strip">
          {regions.map((region) => <button type="button" key={region.note.id} className={region.note.id === active?.note.id ? 'active' : ''} onClick={() => onSelect(region)}>P{region.asset.anchor.pageOrSlide}<ChevronRight size={13} /></button>)}
        </div>
      )}
      {!active && regions.length === 0 ? (
        <div className="right-empty"><div className="empty-illustration"><Image size={26} /></div><h3>{t('region.emptyTitle')}</h3><p>{t('region.emptyBody')}</p></div>
      ) : !active ? (
        <div className="saved-region-view">
          <div className="saved-region-summary"><CheckCircle2 size={17} /><div><strong>{t('region.savedCount', { count: regions.length })}</strong><span>{t('region.savedHint')}</span></div></div>
          <div className="saved-region-list">
            {regions.map((region) => (
              <button type="button" className="saved-region-card" key={region.note.id} onClick={() => onSelect(region)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, region }) }}>
                {annotationKind(region) === 'snapshot'
                  ? <img src={region.asset.previewDataUrl} alt={titleFor(region)} />
                  : <span className={`annotation-card-icon color-${region.asset.color ?? 'yellow'}`}>{annotationKind(region) === 'highlight' || annotationKind(region) === 'underline' ? <Highlighter size={22} /> : annotationKind(region) === 'zotero' ? <FileText size={22} /> : <MapPin size={22} />}</span>}
                <span className="saved-region-card-body">
                  <span className="saved-region-card-heading"><strong>{titleFor(region)}</strong><Pencil size={13} /></span>
                  <small>{t('common.page', { page: region.asset.anchor.pageOrSlide })} · {region.asset.id}</small>
                  {region.asset.selectedText && <span className="saved-region-annotation">{region.asset.selectedText}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="region-editor">
          <button type="button" className="editor-back" onClick={onCloseEditor}><ArrowLeft size={14} />{t('region.back')}</button>
          {activeKind === 'snapshot' && <img className="region-preview" src={active.asset.previewDataUrl} alt={t('region.previewAlt')} />}
          {(activeKind === 'highlight' || activeKind === 'underline') && <blockquote className={`highlight-evidence ${activeKind === 'underline' ? 'underline' : ''} color-${active.asset.color ?? 'yellow'}`}>{active.asset.selectedText}</blockquote>}
          {activeKind === 'zotero' && <div className="zotero-evidence"><span><FileText size={17} />{t('region.zoteroImported')}</span>{active.asset.selectedText && <blockquote>{active.asset.selectedText}</blockquote>}<small>{active.asset.externalKind} · {active.asset.externalKey}</small></div>}
          {activeKind === 'note' && <div className={`note-evidence color-${active.asset.color ?? 'yellow'}`}><MapPin size={18} />{t('region.pageNote')}</div>}
          <div className="region-source">{t('common.page', { page: active.asset.anchor.pageOrSlide })} · {active.asset.id}</div>
          <div className="annotation-tool-stack">
            <AnnotationToolAccordion title={t('region.learningNotes')} description={t('region.learningNotesHint')} icon={<NotebookPen size={17} />} open={openSection === 'notes'} onToggle={() => setOpenSection((value) => value === 'notes' ? null : 'notes')}>
              <label className="field"><span>{t('region.titleField')}</span><input value={draft.title} placeholder={t('region.titlePlaceholder')} onChange={(event) => updateDraft((value) => ({ ...value, title: event.target.value }))} /></label>
              <label className="field"><span>{t('region.annotation')}</span><textarea rows={4} value={draft.annotation} placeholder={t('region.annotationPlaceholder')} onChange={(event) => updateDraft((value) => ({ ...value, annotation: event.target.value }))} /></label>
              <label className="field"><span>{t('region.tags')}</span><input value={draft.tags} placeholder="experiment, method" onChange={(event) => updateDraft((value) => ({ ...value, tags: event.target.value }))} /></label>
              {activeKind !== 'snapshot' && <div className="field"><span>{t('region.color')}</span><div className="annotation-colors">{(['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray'] as AnnotationColor[]).map((color) => <button type="button" key={color} className={`color-${color} ${draft.color === color ? 'active' : ''}`} aria-label={color} onClick={() => updateDraft((value) => ({ ...value, color }))} />)}</div></div>}
            </AnnotationToolAccordion>
            <AnnotationToolAccordion title={t('region.exaResearch')} description={t('region.exaResearchHint')} icon={<BookOpen size={17} />} open={openSection === 'exa'} onToggle={() => setOpenSection((value) => value === 'exa' ? null : 'exa')}>
              <ExaSearchPanel key={active.note.id} context={exaContext} compact onConfigure={onConfigureExa} />
            </AnnotationToolAccordion>
            <AnnotationToolAccordion title={t('region.aiResearch')} description={t('region.aiResearchHint')} icon={<Bot size={17} />} open={openSection === 'ai'} onToggle={() => setOpenSection((value) => value === 'ai' ? null : 'ai')}>
              <AnnotationChat region={active} annotationContext={draft.annotation} conversation={draft.conversation} transientImages={transientImages} questionRequest={toolRequest?.regionId === active.note.id && toolRequest.tool === 'ai' ? { id: toolRequest.requestId, question: toolRequest.initialQuestion ?? '' } : undefined} onRemoveTransientImage={onRemoveTransientImage} onConversationChange={(conversation) => updateDraft((value) => ({ ...value, conversation }))} onAsk={onAsk} onCancelAsk={onCancelAsk} />
            </AnnotationToolAccordion>
          </div>
          <div className="editor-actions">
            <button type="button" className="button danger-ghost" disabled={busy} onClick={() => { if (editRef.current) editRef.current.saved = serializeDraft(draft); void onDelete(active) }}><Trash2 size={15} />{t('common.delete')}</button>
            <button type="button" className="button primary" disabled={busy} onClick={() => { if (editRef.current) editRef.current.saved = serializeDraft(draft); void onSave(active, draft) }}><Save size={15} />{t('region.save')}</button>
          </div>
        </div>
      )}</>}
      {contextMenu && <ContextActionMenu x={contextMenu.x} y={contextMenu.y} label={t('region.quickActions')} onDismiss={() => setContextMenu(undefined)} items={[
        { id: 'open', label: t('region.open'), icon: <Pencil size={15} />, onSelect: () => onSelect(contextMenu.region) },
        { id: 'delete', label: t('common.delete'), icon: <Trash2 size={15} />, tone: 'danger', separatorBefore: true, disabled: busy, onSelect: () => void onDelete(contextMenu.region) }
      ]} />}
    </div>
  )
}

function serializeDraft(draft: RegionDraft): string {
  return JSON.stringify({ ...draft, title: draft.title.trim(), annotation: draft.annotation.trim(), tags: draft.tags.trim() })
}
