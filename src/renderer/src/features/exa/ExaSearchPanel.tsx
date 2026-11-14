/**
 * Reusable compact Exa search surface for global and annotation-scoped retrieval.
 * It owns temporary results and filters; credentials, persistence, and provider mapping stay in main.
 */
import { BookOpen, ExternalLink, LoaderCircle, Quote, Search, Settings, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExaContentPublic, ExaLanguage, ExaSearchMode, ExaSearchPublic, ExaSourcePublic } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  context?: string
  initialQuery?: string
  compact?: boolean
  onConfigure(): void
}

const CURRENT_YEAR = new Date().getFullYear()

export function ExaSearchPanel({ context, initialQuery, compact = false, onConfigure }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [configured, setConfigured] = useState<boolean>()
  const [query, setQuery] = useState(initialQuery?.trim().slice(0, 2_000) ?? '')
  const [mode, setMode] = useState<ExaSearchMode>('academic')
  const [language, setLanguage] = useState<ExaLanguage>('any')
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [numResults, setNumResults] = useState(compact ? 5 : 8)
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<ExaSearchPublic>()
  const [contents, setContents] = useState<Record<string, ExaContentPublic>>({})
  const [expandedUrl, setExpandedUrl] = useState<string>()
  const [loadingUrl, setLoadingUrl] = useState<string>()
  const [error, setError] = useState<string>()

  const refreshConfiguration = (): void => {
    void window.knowex.exa.getSettings().then((settings) => setConfigured(settings.configured)).catch((reason) => setError(messageOf(reason)))
  }

  useEffect(() => {
    refreshConfiguration()
  }, [])

  const search = async (): Promise<void> => {
    const dates = yearDates(fromYear, toYear)
    if ('error' in dates) return setError(t('exa.yearError'))
    if (query.trim().length < 2 || searching) return
    setSearching(true)
    setError(undefined)
    try {
      setResult(await window.knowex.exa.search({ query: query.trim(), context: context?.trim().slice(0, 6_000) || undefined, mode, language, numResults, ...dates }))
      setContents({})
      setExpandedUrl(undefined)
    } catch (reason) { setError(messageOf(reason)) } finally { setSearching(false) }
  }

  const getContent = async (source: ExaSourcePublic): Promise<void> => {
    if (contents[source.url]) return setExpandedUrl((value) => value === source.url ? undefined : source.url)
    setLoadingUrl(source.url)
    setError(undefined)
    try {
      const content = await window.knowex.exa.getContent({ url: source.url })
      setContents((value) => ({ ...value, [source.url]: content }))
      setExpandedUrl(source.url)
    } catch (reason) { setError(messageOf(reason)) } finally { setLoadingUrl(undefined) }
  }

  if (configured === false) return <div className="exa-inline-setup"><Settings size={18} /><span>{t('exa.notConfigured')}</span><button type="button" className="button" onClick={onConfigure}>{t('exa.configure')}</button><button type="button" className="button" onClick={refreshConfiguration}>{t('exa.refreshConfiguration')}</button></div>

  return <div className={`exa-search-panel ${compact ? 'compact' : ''}`}>
    {context && <div className="exa-context-chip"><Quote size={13} /><span>{t('exa.usingCurrentEvidence')}</span></div>}
    <div className="exa-inline-composer">
      <textarea rows={compact ? 2 : 3} maxLength={2_000} value={query} placeholder={t('exa.quickPlaceholder')} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void search() } }} />
      <button type="button" className="icon-button primary" disabled={searching || query.trim().length < 2} title={t('exa.search')} onClick={() => void search()}>{searching ? <LoaderCircle className="is-spinning" size={16} /> : <Search size={16} />}</button>
    </div>
    <details className="exa-inline-filters">
      <summary><SlidersHorizontal size={14} />{t('exa.advancedFilters')}</summary>
      <div>
        <label><span>{t('exa.scope')}</span><select value={mode} onChange={(event) => setMode(event.target.value as ExaSearchMode)}><option value="academic">{t('exa.scopeAcademic')}</option><option value="web">{t('exa.scopeWeb')}</option></select></label>
        <label><span>{t('exa.language')}</span><select value={language} onChange={(event) => setLanguage(event.target.value as ExaLanguage)}><option value="any">{t('exa.languageAny')}</option><option value="zh">{t('exa.languageZh')}</option><option value="en">{t('exa.languageEn')}</option><option value="ja">{t('exa.languageJa')}</option><option value="de">{t('exa.languageDe')}</option><option value="fr">{t('exa.languageFr')}</option><option value="es">{t('exa.languageEs')}</option></select></label>
        <label><span>{t('exa.fromYear')}</span><input type="number" min="1900" max={CURRENT_YEAR + 1} value={fromYear} placeholder="2020" onChange={(event) => setFromYear(event.target.value)} /></label>
        <label><span>{t('exa.toYear')}</span><input type="number" min="1900" max={CURRENT_YEAR + 1} value={toYear} placeholder={String(CURRENT_YEAR)} onChange={(event) => setToYear(event.target.value)} /></label>
        <label><span>{t('exa.resultCount')}</span><select value={numResults} onChange={(event) => setNumResults(Number(event.target.value))}><option value={5}>5</option><option value={8}>8</option><option value={10}>10</option></select></label>
      </div>
      <small>{t('exa.languageHint')}</small>
    </details>
    {error && <div className="inline-error">{error}</div>}
    {result && <div className="exa-inline-status">{t('exa.results', { count: result.results.length })}</div>}
    <div className="exa-inline-results">
      {result?.results.map((source, index) => {
        const content = contents[source.url]
        return <article key={`${source.id}-${index}`}>
          <div className="exa-inline-source"><span>{index + 1}</span><div><small>{hostOf(source.url)}{source.publishedDate ? ` · ${formatDate(source.publishedDate)}` : ''}</small><strong>{source.title}</strong></div></div>
          {source.highlights.length > 0 && <div className="exa-inline-quotes"><span><Quote size={12} />{t('exa.originalQuotes')}</span>{source.highlights.slice(0, 2).map((quote, quoteIndex) => <blockquote key={quoteIndex}>{quote}</blockquote>)}</div>}
          <div className="exa-inline-actions"><button type="button" onClick={() => void window.knowex.exa.openSource(source.url).catch((reason) => setError(messageOf(reason)))}><ExternalLink size={13} />{t('exa.openOriginal')}</button><button type="button" disabled={loadingUrl === source.url} onClick={() => void getContent(source)}><BookOpen size={13} />{content ? (expandedUrl === source.url ? t('exa.collapseContent') : t('exa.showContent')) : t('exa.fetchContent')}</button></div>
          {content && expandedUrl === source.url && <pre className="exa-inline-content">{content.text}</pre>}
        </article>
      })}
    </div>
  </div>
}

function yearDates(fromYear: string, toYear: string): { startPublishedDate?: string; endPublishedDate?: string } | { error: true } {
  const from = fromYear ? Number(fromYear) : undefined
  const to = toYear ? Number(toYear) : undefined
  if ((from !== undefined && (!Number.isInteger(from) || from < 1900 || from > CURRENT_YEAR + 1)) || (to !== undefined && (!Number.isInteger(to) || to < 1900 || to > CURRENT_YEAR + 1)) || (from !== undefined && to !== undefined && from > to)) return { error: true }
  return { startPublishedDate: from ? new Date(Date.UTC(from, 0, 1)).toISOString() : undefined, endPublishedDate: to ? new Date(Date.UTC(to, 11, 31, 23, 59, 59, 999)).toISOString() : undefined }
}

function hostOf(value: string): string { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value } }
function formatDate(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString() }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error) }
