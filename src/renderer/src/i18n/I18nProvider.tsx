import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AppLanguage } from '@shared/domain/models'
import { enUS, zhCN, type TranslationKey } from './translations'

type Values = Record<string, string | number>

interface I18nValue {
  language: AppLanguage
  setLanguage(language: AppLanguage): Promise<void>
  t(key: TranslationKey, values?: Values): string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [language, setLanguageState] = useState<AppLanguage>('zh-CN')

  useEffect(() => {
    void window.knowex.language.get().then(setLanguageState)
    return window.knowex.language.onChanged(setLanguageState)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage: async (nextLanguage) => {
      setLanguageState(nextLanguage)
      await window.knowex.language.set(nextLanguage)
    },
    t: (key, values) => {
      const dictionary = language === 'en-US' ? enUS : zhCN
      let text = dictionary[key]
      for (const [name, replacement] of Object.entries(values ?? {})) {
        text = text.replaceAll(`{${name}}`, String(replacement))
      }
      return text
    }
  }), [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('I18nProvider is missing.')
  return value
}
