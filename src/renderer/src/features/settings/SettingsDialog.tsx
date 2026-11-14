/**
 * Composes settings as category navigation plus focused panes.
 * Provider editors stay isolated, and the renderer receives non-secret status metadata only.
 */
import { Bot, BookOpen, CheckCircle2, KeyRound, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AIProviderPresetPublic, AISettingsPublic, AppLanguage, AppSettingsPublic, ZoteroWebSettingsPublic } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { ExaSettingsPanel } from '../exa/ExaSettingsPanel'
import { AIConnectionsPanel } from './ai/AIConnectionsPanel'

interface Props {
  open: boolean
  initialSection?: SettingsSection
  settings: AISettingsPublic
  providerPresets: AIProviderPresetPublic[]
  zoteroSettings: ZoteroWebSettingsPublic
  appSettings: AppSettingsPublic
  onClose(): void
  onAISettingsChanged(settings: AISettingsPublic): void
  onSaveZotero(input: { userId: string; apiKey?: string }): Promise<void>
  onSaveApp(input: AppSettingsPublic): Promise<void>
  onError(error: unknown): void
}

type SettingsSection = 'general' | 'ai' | 'exa' | 'zotero'
type SaveReceipt = 'general' | 'zotero'

export function SettingsDialog({ open, initialSection = 'general', settings, providerPresets, zoteroSettings, appSettings, onClose, onAISettingsChanged, onSaveZotero, onSaveApp, onError }: Props): React.JSX.Element | null {
  const { t, language, setLanguage } = useI18n()
  const text = copy(language)
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<SaveReceipt>()
  const [zoteroUserId, setZoteroUserId] = useState(zoteroSettings.userId)
  const [zoteroApiKey, setZoteroApiKey] = useState('')
  const [captureShortcut, setCaptureShortcut] = useState(appSettings.captureShortcut)
  const [cleanupTempOnExit, setCleanupTempOnExit] = useState(appSettings.cleanupTempOnExit)
  const [zoteroAutoSync, setZoteroAutoSync] = useState(appSettings.zoteroAutoSync)
  const [confirmAnnotationDelete, setConfirmAnnotationDelete] = useState(appSettings.confirmAnnotationDelete)
  const configuredAI = settings.connections.filter((connection) => connection.configured).length

  useEffect(() => {
    if (!open) return
    setSection(initialSection)
    setZoteroUserId(zoteroSettings.userId)
    setZoteroApiKey('')
    setCaptureShortcut(appSettings.captureShortcut)
    setCleanupTempOnExit(appSettings.cleanupTempOnExit)
    setZoteroAutoSync(appSettings.zoteroAutoSync)
    setConfirmAnnotationDelete(appSettings.confirmAnnotationDelete)
    setReceipt(undefined)
    // Only initialize on open; successful saves update parent props while this dialog must keep its receipt visible.
  }, [open, initialSection])

  if (!open) return null

  const saveGeneral = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSaveApp({ captureShortcut, cleanupTempOnExit, zoteroAutoSync, confirmAnnotationDelete })
      setReceipt('general')
    } finally {
      setSaving(false)
    }
  }

  const saveZotero = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSaveZotero({ userId: zoteroUserId, apiKey: zoteroApiKey || undefined })
      setZoteroApiKey('')
      setReceipt('zotero')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <div><span>{text.preferences}</span><h2 id="settings-title">{t('settings.title')}</h2><p>{text.subtitle}</p></div>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label={text.navigation}>
            <SettingsNavButton active={section === 'general'} icon={<SlidersHorizontal size={17} />} label={text.general} detail={text.generalDetail} onClick={() => setSection('general')} />
            <SettingsNavButton active={section === 'ai'} icon={<Bot size={17} />} label={text.ai} detail={configuredAI ? text.connections(configuredAI) : text.notConfigured} ready={configuredAI > 0} onClick={() => setSection('ai')} />
            <SettingsNavButton active={section === 'exa'} icon={<Search size={17} />} label={text.exa} detail={text.searchDetail} onClick={() => setSection('exa')} />
            <SettingsNavButton active={section === 'zotero'} icon={<BookOpen size={17} />} label={text.zotero} detail={zoteroSettings.configured ? text.savedLocally : text.notConfigured} ready={zoteroSettings.configured} onClick={() => setSection('zotero')} />
            <div className="settings-nav-security"><KeyRound size={15} /><span>{text.security}</span></div>
          </nav>

          <main className="settings-content">
            {section === 'general' && (
              <SettingsPane title={text.general} description={text.generalDescription}>
                <div className="settings-card">
                  <div className="settings-card-heading"><div><h3>{t('settings.interface')}</h3><p>{text.interfaceDescription}</p></div></div>
                  <label className="field settings-control"><span>{t('settings.language')}</span><select value={language} onChange={(event) => void setLanguage(event.target.value as AppLanguage)}><option value="zh-CN">{t('settings.chinese')}</option><option value="en-US">{t('settings.english')}</option></select></label>
                </div>
                <div className="settings-card">
                  <div className="settings-card-heading"><div><h3>{t('settings.capture')}</h3><p>{text.captureDescription}</p></div></div>
                  <label className="field settings-control"><span>{t('settings.captureShortcut')}</span><input value={captureShortcut} placeholder="CommandOrControl+Alt+K" onChange={(event) => { setCaptureShortcut(event.target.value); setReceipt(undefined) }} /></label>
                  <p className="settings-help">{t('settings.captureShortcutHint')}</p>
                  <div className="settings-toggle-list">
                    <label className="checkbox-field"><input type="checkbox" checked={cleanupTempOnExit} onChange={(event) => { setCleanupTempOnExit(event.target.checked); setReceipt(undefined) }} /><span>{t('settings.cleanupTemp')}</span></label>
                    <label className="checkbox-field"><input type="checkbox" checked={zoteroAutoSync} onChange={(event) => { setZoteroAutoSync(event.target.checked); setReceipt(undefined) }} /><span>{t('settings.zoteroAutoSync')}</span></label>
                    <label className="checkbox-field"><input type="checkbox" checked={confirmAnnotationDelete} onChange={(event) => { setConfirmAnnotationDelete(event.target.checked); setReceipt(undefined) }} /><span>{t('settings.confirmAnnotationDelete')}</span></label>
                  </div>
                </div>
                <PaneActions saved={receipt === 'general'} savedText={text.saved} saving={saving} disabled={!captureShortcut.trim()} saveText={t('settings.save')} onSave={() => void saveGeneral()} />
              </SettingsPane>
            )}

            {section === 'ai' && (
              <SettingsPane title={text.ai} description={text.aiDescription}>
                <div className="settings-steps" aria-label={text.setupGuide}>
                  <span><b>1</b>{text.stepProvider}</span><i />
                  <span><b>2</b>{text.stepSave}</span><i />
                  <span><b>3</b>{text.stepTest}</span>
                </div>
                <AIConnectionsPanel settings={settings} presets={providerPresets} onSettingsChanged={onAISettingsChanged} onError={onError} />
              </SettingsPane>
            )}

            {section === 'exa' && <SettingsPane title={text.exa} description={text.exaDescription}><ExaSettingsPanel onError={onError} /></SettingsPane>}

            {section === 'zotero' && (
              <SettingsPane title={text.zotero} description={text.zoteroDescription}>
                <ConnectionReceipt configured={zoteroSettings.configured} updatedAt={zoteroSettings.updatedAt} language={language} configuredText={text.credentialSaved} missingText={text.credentialMissing} />
                <div className="settings-card">
                  <div className="privacy-note"><KeyRound size={18} /><p>{t('settings.zoteroWriteHint')}</p></div>
                  <label className="field settings-control"><span>{t('settings.zoteroUserId')}</span><input inputMode="numeric" value={zoteroUserId} placeholder="1234567" onChange={(event) => { setZoteroUserId(event.target.value.replace(/\D/g, '')); setReceipt(undefined) }} /></label>
                  <label className="field settings-control"><span>Zotero Web API Key</span><input type="password" autoComplete="off" value={zoteroApiKey} placeholder={zoteroSettings.configured ? text.leaveBlank : text.enterKey} onChange={(event) => { setZoteroApiKey(event.target.value); setReceipt(undefined) }} /></label>
                  <p className="settings-help">{t('settings.zoteroKeyHelp')} <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noreferrer">zotero.org/settings/keys</a></p>
                </div>
                <PaneActions saved={receipt === 'zotero'} savedText={text.saved} saving={saving} disabled={!zoteroUserId.trim() || (!zoteroSettings.configured && !zoteroApiKey.trim())} saveText={text.saveZotero} onSave={() => void saveZotero()} />
              </SettingsPane>
            )}
          </main>
        </div>
      </section>
    </div>
  )
}

function SettingsNavButton({ active, icon, label, detail, ready, onClick }: { active: boolean; icon: React.ReactNode; label: string; detail: string; ready?: boolean; onClick(): void }): React.JSX.Element {
  return <button type="button" className={`settings-nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}><span className="settings-nav-icon">{icon}</span><span><strong>{label}</strong><small>{detail}</small></span>{ready && <CheckCircle2 className="settings-nav-ready" size={14} />}</button>
}

function SettingsPane({ title, description, children }: { title: string; description: string; children: React.ReactNode }): React.JSX.Element {
  return <section className="settings-pane"><div className="settings-pane-header"><h2>{title}</h2><p>{description}</p></div>{children}</section>
}

function PaneActions({ saved, savedText, saving, disabled, saveText, onSave }: { saved: boolean; savedText: string; saving: boolean; disabled: boolean; saveText: string; onSave(): void }): React.JSX.Element {
  return <div className="settings-pane-actions">{saved && <span className="settings-saved" role="status"><CheckCircle2 size={15} />{savedText}</span>}<button type="button" className="button primary" disabled={saving || disabled} onClick={onSave}>{saving ? '…' : saveText}</button></div>
}

function ConnectionReceipt({ configured, updatedAt, language, configuredText, missingText }: { configured: boolean; updatedAt?: string; language: AppLanguage; configuredText: string; missingText: string }): React.JSX.Element {
  return <div className={`settings-receipt ${configured ? 'ready' : ''}`}><span className="settings-receipt-icon">{configured ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}</span><div><strong>{configured ? configuredText : missingText}</strong><small>{updatedAt ? formatTimestamp(updatedAt, language) : (language === 'en-US' ? 'No saved record yet' : '暂无保存记录')}</small></div></div>
}

function formatTimestamp(value: string, language: AppLanguage): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${language === 'en-US' ? 'Last saved' : '上次保存'} · ${new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`
}

function copy(language: AppLanguage) {
  if (language === 'en-US') return {
    preferences: 'KNOWEX PREFERENCES', subtitle: 'Choose a category. Changes and connection records stay visible where they belong.', navigation: 'Settings categories',
    general: 'General', generalDetail: 'Language, capture & behavior', generalDescription: 'Keep everyday behavior predictable and easy to adjust.', interfaceDescription: 'Choose the language used throughout Knowex.', captureDescription: 'Configure capture and background behavior.',
    ai: 'AI connections', aiDescription: 'Connect cloud APIs or local CLI tools. Saved credentials and test history are shown per connection.', connections: (count: number) => `${count} configured`,
    exa: 'Exa search', searchDetail: 'Academic web search', exaDescription: 'Configure the independent academic search service and verify it explicitly.',
    zotero: 'Zotero', zoteroDescription: 'Configure only the Web API credential used for explicit write-back. Local reading remains separate.',
    notConfigured: 'Needs configuration', savedLocally: 'Credential stored', security: 'API keys are encrypted locally and never displayed again.', setupGuide: 'Connection setup guide', stepProvider: 'Choose provider', stepSave: 'Save securely', stepTest: 'Run a test',
    saved: 'Saved locally', credentialSaved: 'Credential securely stored', credentialMissing: 'Write-back not configured', leaveBlank: 'Leave blank to keep saved key', enterKey: 'Enter API key', saveZotero: 'Save Zotero credential'
  }
  return {
    preferences: 'KNOWEX 偏好设置', subtitle: '按类别设置；保存状态和连接记录会留在对应页面中。', navigation: '设置分类',
    general: '通用', generalDetail: '语言、截屏与使用习惯', generalDescription: '管理日常使用行为，让操作保持可预期。', interfaceDescription: '选择 Knowex 全局使用的界面语言。', captureDescription: '设置截屏入口、临时文件和自动检查行为。',
    ai: 'AI 连接', aiDescription: '连接云端 API 或本机 CLI；每条连接都会显示密钥状态、更新时间与测试记录。', connections: (count: number) => `已配置 ${count} 个`,
    exa: 'Exa 搜索', searchDetail: '独立的学术网页检索', exaDescription: '配置独立的学术搜索服务；只有明确点击时才会保存或测试。',
    zotero: 'Zotero', zoteroDescription: '这里只配置显式回写所需的 Web API 凭据；本地只读访问与它相互独立。',
    notConfigured: '需要配置', savedLocally: '凭据已保存', security: 'API Key 仅在本机加密保存，之后不会回显。', setupGuide: '连接配置指引', stepProvider: '选择服务商', stepSave: '安全保存', stepTest: '执行测试',
    saved: '已保存到本机', credentialSaved: '凭据已安全保存', credentialMissing: '尚未配置回写', leaveBlank: '留空以保留已保存的 Key', enterKey: '输入 API Key', saveZotero: '保存 Zotero 凭据'
  }
}
