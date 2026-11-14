import { z } from 'zod'
import type { SaveZoteroSyncPreferenceInput, ZoteroOpenOptions } from '../../domain/models'

export const zoteroOpenOptionsSchema = z.object({
  importAnnotations: z.boolean(),
  exportKnowex: z.boolean()
}) satisfies z.ZodType<ZoteroOpenOptions>

export const saveZoteroSyncPreferenceInputSchema = z.object({
  attachmentKey: z.string().regex(/^[A-Z0-9]{8}$/i),
  options: zoteroOpenOptionsSchema,
  scope: z.enum(['default', 'item'])
}) satisfies z.ZodType<SaveZoteroSyncPreferenceInput>

export const saveZoteroSettingsInputSchema = z.object({
  userId: z.string().regex(/^\d+$/, 'Zotero user ID must contain digits only.'),
  apiKey: z.string().max(512).optional()
})

export type SaveZoteroSettingsInput = z.infer<typeof saveZoteroSettingsInputSchema>
