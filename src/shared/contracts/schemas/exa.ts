/**
 * Validates the complete renderer-to-main Exa surface before provider calls or URL opening.
 * Research context, follow-up history, and filters cross IPC only through this bounded contract.
 */
import { z } from 'zod'

const exaDomainSchema = z.string().trim().min(1).max(253).refine((value) => {
  // Exa accepts domains and domain paths, but never needs a scheme or credentials here.
  if (value.includes('://') || value.includes('@') || value.startsWith('/')) return false
  const hostname = value.split('/')[0]
  return hostname === 'localhost' || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)
}, { message: 'Use a domain such as arxiv.org, without a URL scheme.' })

const exaUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}, { message: 'Source URL must use HTTP or HTTPS.' })

export const saveExaSettingsInputSchema = z.object({
  apiKey: z.string().trim().max(4096).optional(),
  clearApiKey: z.boolean().optional()
}).strict()

export type SaveExaSettingsInput = z.infer<typeof saveExaSettingsInputSchema>

export const searchExaInputSchema = z.object({
  query: z.string().trim().min(2).max(2_000),
  mode: z.enum(['academic', 'web']).default('academic'),
  numResults: z.number().int().min(1).max(10).default(8),
  startPublishedDate: z.iso.datetime().optional(),
  endPublishedDate: z.iso.datetime().optional(),
  context: z.string().trim().max(6_000).optional(),
  history: z.array(z.string().trim().min(2).max(2_000)).max(8).optional(),
  language: z.enum(['any', 'zh', 'en', 'ja', 'de', 'fr', 'es']).optional(),
  includeDomains: z.array(exaDomainSchema).max(20).optional(),
  excludeDomains: z.array(exaDomainSchema).max(20).optional()
}).strict()

export type SearchExaInput = z.infer<typeof searchExaInputSchema>

export const getExaContentInputSchema = z.object({
  url: exaUrlSchema
}).strict()

export type GetExaContentInput = z.infer<typeof getExaContentInputSchema>

export const openExaSourceInputSchema = getExaContentInputSchema
export type OpenExaSourceInput = z.infer<typeof openExaSourceInputSchema>
