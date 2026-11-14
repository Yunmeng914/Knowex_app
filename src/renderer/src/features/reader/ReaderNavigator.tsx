import { FileText, LayoutGrid, List, MessageSquareText, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { RegionRecord } from '@shared/domain/models'
import { annotationKind } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { fuzzyMatch } from './fuzzy-search'

type NavigatorTab = 'pages' | 'annotations' | 'outline' | 'search'
interface OutlineEntry { title: string; page?: number; depth: number }
interface SearchResult { page: number; excerpt: string; terms: string[]; exact: boolean }

interface Props {
  document: pdfjs.PDFDocumentProxy
  activePage: number
  regions: RegionRecord[]
  onPageChange(page: number): void
  onRegionClick(id: string): void
  onSearchMatches(matches: Record<number, string[]>): void
}

function PageThumbnail({ document, page, active, onClick }: { document: pdfjs.PDFDocumentProxy; page: number; active: boolean; onClick(): void }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let task: pdfjs.RenderTask | undefined
    let cancelled = false
    void document.getPage(page).then((pdfPage) => {
      if (cancelled || !canvasRef.current) return
      const natural = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: 126 / natural.width })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      if (!context) return
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      task = pdfPage.render({ canvas, canvasContext: context, viewport })
      void task.promise.catch(() => undefined)
    })
    return () => { cancelled = true; task?.cancel() }
  }, [document, page])
  return <button type="button" className={`page-thumbnail ${active ? 'active' : ''}`} onClick={onClick}><canvas ref={canvasRef} /><span>{page}</span></button>
}

async function outlineEntries(document: pdfjs.PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await document.getOutline()
  if (!outline) return []
  const entries: OutlineEntry[] = []
  const visit = async (items: Awaited<ReturnType<typeof document.getOutline>>, depth: number): Promise<void> => {
    if (!items) return
    for (const item of items) {
      let destination = item.dest
      if (typeof destination === 'string') destination = await document.getDestination(destination)
      let page: number | undefined
      if (Array.isArray(destination) && destination[0]) {
        try { page = (await document.getPageIndex(destination[0])) + 1 } catch { page = undefined }
      }
      entries.push({ title: item.title || '—', page, depth })
      await visit(item.items, depth + 1)
    }
  }
  await visit(outline, 0)
  return entries
}

export function ReaderNavigator({ document, activePage, regions, onPageChange, onRegionClick, onSearchMatches }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<NavigatorTab>('pages')
  const [outline, setOutline] = useState<OutlineEntry[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const annotationTitle = (region: RegionRecord): string => {
    const kind = annotationKind(region)
    if (kind === 'highlight') return t('region.highlight')
    if (kind === 'underline') return t('region.underline')
    if (kind === 'note') return t('region.note')
    if (kind === 'zotero') return t('region.zotero')
    return t('region.untitled')
  }

  useEffect(() => { void outlineEntries(document).then(setOutline) }, [document])

  const search = async (): Promise<void> => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) { setResults([]); onSearchMatches({}); return }
    setSearching(true)
    const found: SearchResult[] = []
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await (await document.getPage(page)).getTextContent()
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ')
      const match = fuzzyMatch(text, needle)
      if (match.matched) found.push({ page, excerpt: text.slice(Math.max(0, match.index - 52), Math.min(text.length, match.index + Math.max(needle.length, 20) + 90)), terms: match.terms, exact: match.exact })
    }
    setResults(found)
    onSearchMatches(Object.fromEntries(found.map((result) => [result.page, result.terms])))
    setSearching(false)
  }

  return (
    <aside className="reader-navigator">
      <div className="navigator-tabs" role="tablist">
        <button type="button" className={tab === 'pages' ? 'active' : ''} title={t('reader.thumbnails')} onClick={() => setTab('pages')}><LayoutGrid size={17} /></button>
        <button type="button" className={tab === 'annotations' ? 'active' : ''} title={t('region.title')} onClick={() => setTab('annotations')}><MessageSquareText size={17} /></button>
        <button type="button" className={tab === 'outline' ? 'active' : ''} title={t('reader.outline')} onClick={() => setTab('outline')}><List size={17} /></button>
        <button type="button" className={tab === 'search' ? 'active' : ''} title={t('reader.search')} onClick={() => setTab('search')}><Search size={17} /></button>
      </div>
      <div className="navigator-content">
        {tab === 'pages' && <div className="thumbnail-list">{Array.from({ length: document.numPages }, (_, index) => <PageThumbnail key={index + 1} document={document} page={index + 1} active={activePage === index + 1} onClick={() => onPageChange(index + 1)} />)}</div>}
        {tab === 'annotations' && <div className="navigator-list">{regions.length === 0 ? <p>{t('region.emptyTitle')}</p> : regions.map((region) => <button type="button" key={region.note.id} onClick={() => { onPageChange(region.asset.anchor.pageOrSlide); onRegionClick(region.note.id) }}><FileText size={14} /><span><strong>{region.note.title || annotationTitle(region)}</strong><small>{t('common.page', { page: region.asset.anchor.pageOrSlide })} · {region.asset.selectedText?.slice(0, 72)}</small></span></button>)}</div>}
        {tab === 'outline' && <div className="navigator-list outline-list">{outline.length === 0 ? <p>{t('reader.noOutline')}</p> : outline.map((item, index) => <button type="button" key={`${item.title}-${index}`} disabled={!item.page} style={{ paddingLeft: 9 + item.depth * 13 }} onClick={() => item.page && onPageChange(item.page)}><span><strong>{item.title}</strong>{item.page && <small>{t('common.page', { page: item.page })}</small>}</span></button>)}</div>}
        {tab === 'search' && <div className="navigator-search"><form onSubmit={(event) => { event.preventDefault(); void search() }}><input value={query} autoFocus placeholder={t('reader.searchDocument')} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) { setResults([]); onSearchMatches({}) } }} /><button type="submit"><Search size={15} /></button></form>{searching ? <p>{t('reader.searching')}</p> : <div className="navigator-list">{results.map((result) => <button type="button" key={result.page} onClick={() => onPageChange(result.page)}><span><strong>{t('common.page', { page: result.page })}{!result.exact && <em>{t('reader.fuzzyMatch')}</em>}</strong><small>{highlightExcerpt(result.excerpt, result.terms)}</small></span></button>)}</div>}</div>}
      </div>
    </aside>
  )
}

function highlightExcerpt(excerpt: string, terms: string[]): React.ReactNode[] {
  if (!terms.length) return [excerpt]
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return excerpt.split(pattern).map((part, index) => terms.some((term) => part.toLocaleLowerCase() === term.toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)
}
