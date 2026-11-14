import { useEffect, useRef, useState } from 'react'
import type { OpenDocumentResult, ZoteroAttachment, ZoteroConnectionStatus, ZoteroOpenOptions, ZoteroWebSettingsPublic } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'
import { toUserMessage } from '../errors'
import type { AppNotice } from './useNotice'

interface Options {
  webSettings: ZoteroWebSettingsPublic
  loadResult(result: OpenDocumentResult): Promise<void>
  flash(kind: AppNotice['kind'], text: string): void
  autoSync: boolean
}

export function useZoteroIntegration({ webSettings, loadResult, flash, autoSync }: Options) {
  const { t } = useI18n()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<ZoteroConnectionStatus>()
  const [attachments, setAttachments] = useState<ZoteroAttachment[]>([])
  const [pendingAttachment, setPendingAttachment] = useState<ZoteroAttachment>()
  const [pendingOptions, setPendingOptions] = useState<ZoteroOpenOptions>({ importAnnotations: true, exportKnowex: false })
  const [preferenceScope, setPreferenceScope] = useState<'default' | 'item'>('default')
  const syncing = useRef(false)
  const initialized = useRef(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const nextStatus = await window.knowex.zotero.check()
      setStatus(nextStatus)
      setAttachments(nextStatus.state === 'ready' ? await window.knowex.zotero.list() : [])
    } catch (reason) {
      setStatus({ state: 'error', message: t('notice.zoteroFailed') })
      setError(toUserMessage(reason, t('error.unknown')))
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!autoSync) return
    let cancelled = false
    const sync = async (): Promise<void> => {
      if (syncing.current || document.hidden) return
      syncing.current = true
      try {
        const nextStatus = await window.knowex.zotero.check()
        if (nextStatus.state !== 'ready' || cancelled) return
        const next = await window.knowex.zotero.list()
        if (cancelled) return
        setStatus(nextStatus)
        setAttachments((current) => {
          if (initialized.current) {
            const known = new Set(current.map((item) => item.key))
            const added = next.filter((item) => !known.has(item.key)).length
            if (added) flash('success', t('notice.zoteroAutoSynced', { count: added }))
          }
          initialized.current = true
          return next
        })
      } catch {
        // Background sync stays quiet; the Zotero dialog provides diagnostics on demand.
      } finally { syncing.current = false }
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 20_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [autoSync])

  const show = (): void => {
    setDialogOpen(true)
    setStatus(undefined)
    void load()
  }

  const openAttachment = async (attachment: ZoteroAttachment, options: ZoteroOpenOptions): Promise<void> => {
    setLoading(true)
    try {
      const opened = await window.knowex.zotero.open(attachment.key, options)
      await loadResult(opened.result)
      setPendingAttachment(undefined)
      if (opened.importedCount || opened.exportedCount) flash('success', t('notice.zoteroSyncDone', { imported: opened.importedCount, exported: opened.exportedCount }))
    } catch (reason) {
      const message = toUserMessage(reason, t('error.unknown'))
      setError(message)
      flash('error', message)
    } finally { setLoading(false) }
  }

  const prepare = async (attachment: ZoteroAttachment): Promise<void> => {
    setDialogOpen(false)
    setLoading(true)
    try {
      const preference = await window.knowex.zotero.getSyncPreference(attachment.key)
      if (preference.configured && (!preference.options.exportKnowex || webSettings.configured)) {
        setLoading(false)
        await openAttachment(attachment, preference.options)
        return
      }
      setPendingAttachment(attachment)
      setPendingOptions(preference.options)
      setPreferenceScope('default')
    } catch (reason) {
      const message = toUserMessage(reason, t('error.unknown'))
      setError(message)
      flash('error', message)
    } finally { setLoading(false) }
  }

  const configure = async (attachment: ZoteroAttachment): Promise<void> => {
    setDialogOpen(false)
    try {
      const preference = await window.knowex.zotero.getSyncPreference(attachment.key)
      setPendingAttachment(attachment)
      setPendingOptions(preference.options)
      setPreferenceScope('item')
    } catch (reason) { flash('error', toUserMessage(reason, t('error.unknown'))) }
  }

  const open = async (options: ZoteroOpenOptions): Promise<void> => {
    if (!pendingAttachment) return
    try {
      await window.knowex.zotero.saveSyncPreference({ attachmentKey: pendingAttachment.key, options, scope: preferenceScope })
      await openAttachment(pendingAttachment, options)
    } catch (reason) {
      const message = toUserMessage(reason, t('error.unknown'))
      setError(message)
      flash('error', message)
    }
  }

  return {
    dialogOpen, setDialogOpen, loading, error, status, attachments, pendingAttachment, pendingOptions, preferenceScope, setPendingAttachment,
    webConfigured: webSettings.configured, load, show, prepare, configure, open
  }
}
