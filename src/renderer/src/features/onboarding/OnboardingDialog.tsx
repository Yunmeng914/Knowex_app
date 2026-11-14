/**
 * First-run guide for the minimum viable setup: local storage, core reading
 * behavior, and capture shortcut. Optional services such as Zotero and Exa are
 * configured only when the user opens those features, keeping onboarding short.
 */
import { CheckCircle2, ChevronLeft, ChevronRight, FolderOpen, Highlighter, Keyboard, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  open: boolean
  workspaceReady: boolean
  captureShortcut: string
  isUpdate: boolean
  onChooseWorkspace(): void
  onSaveShortcut(shortcut: string): Promise<void>
  onFinish(): void
}

export function OnboardingDialog(props: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [shortcut, setShortcut] = useState(props.captureShortcut)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (props.open) { setStep(0); setShortcut(props.captureShortcut) } }, [props.open, props.captureShortcut])
  if (!props.open) return null
  const pages = [
    <div className="onboarding-page" key="workspace"><div className="onboarding-icon"><FolderOpen size={28} /></div><h3>{t('onboarding.workspaceTitle')}</h3><p>{t('onboarding.workspaceBody')}</p><button type="button" className={`button ${props.workspaceReady ? '' : 'primary'}`} onClick={props.onChooseWorkspace}>{props.workspaceReady ? <CheckCircle2 size={16} /> : <FolderOpen size={16} />}{props.workspaceReady ? t('onboarding.workspaceReady') : t('app.chooseWorkspace')}</button></div>,
    <div className="onboarding-page" key="reading"><div className="onboarding-icon"><Highlighter size={28} /></div><h3>{t('onboarding.readTitle')}</h3><ul><li>{t('onboarding.read1')}</li><li>{t('onboarding.read2')}</li><li>{t('onboarding.read3')}</li></ul><div className="onboarding-privacy"><ShieldCheck size={18} /><span>{t('onboarding.privacy')}</span></div></div>,
    <div className="onboarding-page" key="shortcuts"><div className="onboarding-icon"><Keyboard size={28} /></div><h3>{t(props.isUpdate ? 'onboarding.shortcutUpdateTitle' : 'onboarding.shortcutTitle')}</h3><p>{t('onboarding.shortcutBody')}</p><label className="field onboarding-shortcut"><span>{t('settings.captureShortcut')}</span><input value={shortcut} onChange={(event) => setShortcut(event.target.value)} /></label><div className="shortcut-presets">{['CommandOrControl+Alt+K', 'Alt+Shift+S', 'CommandOrControl+Shift+K'].map((value) => <button type="button" key={value} onClick={() => setShortcut(value)}>{value}</button>)}</div><small className="shortcut-warning">{t('onboarding.shortcutWarning')}</small><ul><li>{t('onboarding.systemCapture')}</li><li>{t('onboarding.knowexCapture')}</li></ul></div>
  ]
  return (
    <div className="dialog-backdrop onboarding-backdrop">
      <section className="dialog onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button type="button" className="onboarding-close" title={t('onboarding.skip')} aria-label={t('onboarding.skip')} onClick={props.onFinish}><X size={18} /></button>
        <div className="onboarding-brand"><span>K</span><div><strong id="onboarding-title">Knowex</strong><small>{t('onboarding.subtitle')}</small></div></div>
        <div className="onboarding-progress">{pages.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
        {pages[step]}
        <div className="onboarding-actions"><button type="button" className="button" disabled={step === 0 || saving} onClick={() => setStep((value) => value - 1)}><ChevronLeft size={15} />{t('onboarding.previous')}</button>{step < pages.length - 1 ? <button type="button" className="button primary" disabled={step === 0 && !props.workspaceReady} onClick={() => setStep((value) => value + 1)}>{t('onboarding.next')}<ChevronRight size={15} /></button> : <button type="button" className="button primary" disabled={saving || !shortcut.trim()} onClick={async () => { setSaving(true); try { await props.onSaveShortcut(shortcut.trim()); props.onFinish() } finally { setSaving(false) } }}>{t('onboarding.finish')}</button>}</div>
      </section>
    </div>
  )
}
