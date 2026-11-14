/**
 * Reusable high-frequency actions for newly selected document evidence.
 * It presents actions only; persistence and external calls remain with app and domain features.
 */
import { Bot, Copy, Languages, Search } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import type { EvidenceTool } from './evidence-workflow'

interface Props {
  onAction(tool: EvidenceTool): void
  onCopy(): void
  layout?: 'toolbar' | 'menu'
}

export function EvidenceQuickActions({ onAction, onCopy, layout = 'toolbar' }: Props): React.JSX.Element {
  const { t } = useI18n()
  return <div className={`evidence-quick-actions ${layout}`} role={layout === 'menu' ? undefined : 'group'}>
    <button type="button" role={layout === 'menu' ? 'menuitem' : undefined} onClick={() => onAction('exa')}><Search size={15} /><span>{t('evidence.exa')}</span></button>
    <button type="button" role={layout === 'menu' ? 'menuitem' : undefined} onClick={() => onAction('ai')}><Bot size={15} /><span>{t('evidence.ai')}</span></button>
    <button type="button" role={layout === 'menu' ? 'menuitem' : undefined} onClick={() => onAction('translate')}><Languages size={15} /><span>{t('evidence.translate')}</span></button>
    <button type="button" role={layout === 'menu' ? 'menuitem' : undefined} onClick={onCopy}><Copy size={15} /><span>{t('reader.copy')}</span></button>
  </div>
}
