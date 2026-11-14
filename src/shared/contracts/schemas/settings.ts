import { z } from 'zod'

export const languageSchema = z.enum(['zh-CN', 'en-US'])

export const saveAppSettingsInputSchema = z.object({
  captureShortcut: z.string().trim().min(1).max(64),
  cleanupTempOnExit: z.boolean(),
  zoteroAutoSync: z.boolean(),
  confirmAnnotationDelete: z.boolean()
})

export type SaveAppSettingsInput = z.infer<typeof saveAppSettingsInputSchema>
