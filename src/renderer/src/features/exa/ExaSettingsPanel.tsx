/** Self-contained Exa credential UI; only public configured state returns from the main process. */
import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle, Search, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExaConnectionTestPublic, ExaSettingsPublic } from '@shared/domain/models'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  onError(error: unknown): void
}

const EMPTY_SETTINGS: ExaSettingsPublic = { configured: false }

export function ExaSettingsPanel({ onError }: Props): React.JSX.Element {
  const { t, language } = useI18n()
  const [settings, setSettings] = useState(EMPTY_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<ExaConnectionTestPublic>()
  const [saved, setSaved] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  useEffect(() => {
    void window.knowex.exa.getSettings().then(setSettings).catch(onError)
  }, [])

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try { await task() } catch (error) { onError(error) } finally { setBusy(false) }
  }

  const save = (): void => {
    if (!apiKey.trim()) return
    void run(async () => {
      setSettings(await window.knowex.exa.saveSettings({ apiKey }))
      setApiKey('')
      setTest(undefined)
      setSaved(true)
    })
  }

  const clear = (): void => {
    setConfirmClearOpen(true)
  }

  const executeClear = (): void => {
    setConfirmClearOpen(false)
    void run(async () => {
      setSettings(await window.knowex.exa.saveSettings({ clearApiKey: true }))
      setApiKey('')
      setTest(undefined)
      setSaved(false)
    })
  }

  const testConnection = (): void => {
    void run(async () => {
      const result = await window.knowex.exa.testConnection()
      setTest(result)
      // Mirror the persisted record immediately instead of waiting for the panel to remount.
      setSettings((current) => ({ ...current, lastTest: result }))
    })
  }

  const visibleTest = test ?? settings.lastTest

  return (
    <section className="exa-settings-panel">
      <div className={`exa-settings-status ${settings.configured ? 'ready' : ''}`}>
        {settings.configured ? <ShieldCheck size={18} /> : <KeyRound size={18} />}
        <div>
          <strong>{settings.configured ? (language === 'en-US' ? 'API key securely stored' : 'API Key 已安全保存') : (language === 'en-US' ? 'Exa is not configured' : '尚未配置 Exa')}</strong>
          <small>{settings.updatedAt ? formatSavedAt(settings.updatedAt, language) : (language === 'en-US' ? 'No saved record yet' : '暂无保存记录')}</small>
        </div>
      </div>
      <div className="privacy-note"><KeyRound size={18} /><p>{t('exa.settings.privacy')}</p></div>
      <label className="field">
        <span>Exa API Key {settings.configured && t('settings.keyConfigured')}</span>
        <input type="password" autoComplete="off" value={apiKey} placeholder={settings.configured ? (language === 'en-US' ? 'Leave blank to keep saved key' : '留空以保留已保存的 Key') : 'exa-…'} onChange={(event) => { setApiKey(event.target.value); setSaved(false) }} />
      </label>
      <p className="settings-help">{t('exa.settings.freeHint')}</p>
      <div className="exa-settings-actions">
        <button type="button" className="button" disabled={busy} onClick={() => void window.knowex.exa.openSource('https://dashboard.exa.ai/api-keys').catch(onError)}><ExternalLink size={14} />{t('exa.settings.createKey')}</button>
        <span />
        {settings.configured && <button type="button" className="button danger-subtle" disabled={busy} onClick={clear}><Trash2 size={14} />{t('exa.settings.clear')}</button>}
        <button type="button" className="button" disabled={busy || !settings.configured} title={t('exa.settings.testCost')} onClick={testConnection}>{busy ? <LoaderCircle className="is-spinning" size={14} /> : <Search size={14} />}{t('exa.settings.test')}</button>
        <button type="button" className="button primary" disabled={busy || !apiKey.trim()} onClick={save}>{t('exa.settings.save')}</button>
      </div>
      {saved && <div className="exa-test-result success"><CheckCircle2 size={15} /><span>{language === 'en-US' ? 'Saved locally. The key will not be displayed again.' : '已保存到本机，API Key 之后不会回显。'}</span></div>}
      {visibleTest && <div className={`exa-test-result ${visibleTest.success ? 'success' : 'failed'}`}>{visibleTest.success ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}<span>{visibleTest.message}{visibleTest.latencyMs ? ` · ${visibleTest.latencyMs} ms` : ''} · {formatCheckedAt(visibleTest.checkedAt, language)}</span></div>}
      <ConfirmDialog
        open={confirmClearOpen}
        title={t('exa.settings.clear')}
        message={t('exa.settings.clearConfirm')}
        confirmLabel={t('exa.settings.clear')}
        busy={busy}
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={executeClear}
      />
    </section>
  )
}

function formatSavedAt(value: string, language: 'zh-CN' | 'en-US'): string {
  return `${language === 'en-US' ? 'Last saved' : '上次保存'} · ${formatDate(value, language)}`
}

function formatCheckedAt(value: string, language: 'zh-CN' | 'en-US'): string {
  return `${language === 'en-US' ? 'Checked' : '检查于'} ${formatDate(value, language)}`
}

function formatDate(value: string, language: 'zh-CN' | 'en-US'): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
