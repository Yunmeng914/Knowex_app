import { useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { toUserMessage } from '../errors'

export interface AppNotice {
  kind: 'error' | 'success'
  text: string
}

export function useNotice(): {
  notice?: AppNotice
  flash(kind: AppNotice['kind'], text: string): void
  showError(error: unknown): void
} {
  const { t } = useI18n()
  const [notice, setNotice] = useState<AppNotice>()
  const flash = (kind: AppNotice['kind'], text: string): void => {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice((value) => value?.text === text ? undefined : value), 4500)
  }
  return {
    notice,
    flash,
    showError: (error) => flash('error', toUserMessage(error, t('error.unknown')))
  }
}
