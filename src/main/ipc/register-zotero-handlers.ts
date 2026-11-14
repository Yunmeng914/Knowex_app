import { z } from 'zod'
import { saveZoteroSettingsInputSchema, saveZoteroSyncPreferenceInputSchema, zoteroOpenOptionsSchema } from '../../shared/contracts/ipc'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppServices } from '../app-services'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerZoteroHandlers({ config, regions, zotero, zoteroWeb }: AppServices): void {
  registerTrustedHandler(IPC_CHANNELS.zoteroCheck, () => zotero.checkConnection())
  registerTrustedHandler(IPC_CHANNELS.zoteroList, () => zotero.listAttachments())
  registerTrustedHandler(IPC_CHANNELS.zoteroOpen, async (_, key: unknown, options: unknown) => {
    const attachmentKey = z.string().min(1).parse(key)
    const parsedOptions = zoteroOpenOptionsSchema.parse(options)
    const result = await zotero.openAttachment(attachmentKey)
    let importedCount = 0
    let exportedCount = 0
    if (parsedOptions.importAnnotations) {
      const imported = await zotero.listImportedRecords(attachmentKey, result.document.zoteroParentItemKey)
      importedCount = await regions.importZotero(result.document.id, imported)
    }
    if (parsedOptions.exportKnowex) exportedCount = await zoteroWeb.exportDocument(result.document.id)
    return { result, importedCount, exportedCount }
  })
  registerTrustedHandler(IPC_CHANNELS.zoteroSyncPreferenceGet, (_, key: unknown) => config.getZoteroSyncPreference(z.string().regex(/^[A-Z0-9]{8}$/i).parse(key)))
  registerTrustedHandler(IPC_CHANNELS.zoteroSyncPreferenceSave, (_, input: unknown) => config.saveZoteroSyncPreference(saveZoteroSyncPreferenceInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.zoteroGetSettings, () => config.getZoteroSettings())
  registerTrustedHandler(IPC_CHANNELS.zoteroSaveSettings, (_, input: unknown) => config.saveZoteroSettings(saveZoteroSettingsInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.zoteroExport, (_, documentId: unknown) => zoteroWeb.exportDocument(z.string().min(1).parse(documentId)))
}
