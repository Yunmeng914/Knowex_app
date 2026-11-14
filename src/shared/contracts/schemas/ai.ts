import { z } from 'zod'

export const aiProviderSchema = z.enum(['openai', 'anthropic', 'deepseek', 'kimi', 'minimax', 'glm', 'custom', 'codex', 'claude-code'])

export const aiTransportSchema = z.enum(['openai-responses', 'openai-chat-completions', 'anthropic-messages', 'codex-cli', 'claude-code-cli'])

export const cloudAIProviderSchema = z.enum(['openai', 'anthropic', 'deepseek', 'kimi', 'minimax', 'glm', 'custom'])

export const cloudAITransportSchema = z.enum(['openai-responses', 'openai-chat-completions', 'anthropic-messages'])

export const localAIProviderSchema = z.enum(['codex', 'claude-code'])

export const localAITransportSchema = z.enum(['codex-cli', 'claude-code-cli'])

export const localToolKindSchema = z.enum(['codex', 'claude-code'])

export const aiCapabilitiesSchema = z.object({
  text: z.boolean(),
  vision: z.boolean(),
  streaming: z.boolean()
})

export const aiEndpointModeSchema = z.enum(['base-url', 'full-endpoint'])

const capabilityTextVerificationSchema = z.object({
  status: z.enum(['verified', 'failed', 'not-tested']),
  checkedAt: z.string().optional(),
  model: z.string().max(160).optional(),
  message: z.string().max(300).optional()
})

const capabilityImageVerificationSchema = z.object({
  status: z.enum(['verified', 'unsupported', 'failed', 'wrong-answer', 'response-parse-error', 'timeout', 'not-tested']),
  checkedAt: z.string().optional(),
  model: z.string().max(160).optional(),
  message: z.string().max(300).optional()
})

export const capabilityVerificationSchema = z.object({
  text: capabilityTextVerificationSchema,
  image: capabilityImageVerificationSchema
})

const endpointSchema = z.url().refine((value) => {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}, {
  message: 'AI endpoint must use HTTPS unless it is localhost.'
})

const aiModelDiscoverySchema = z.enum(['openai-models', 'anthropic-models', 'custom-models-endpoint', 'unsupported'])

const connectionIdSchema = z.string().trim().min(1).max(120)

const executablePathSchema = z.string().trim().min(1).max(1024).refine((value) => {
  if (/[<>"|?*\n\r]/.test(value)) return false
  if (/\s--?[\w-]+/.test(value)) return false
  if (/[;&|`]/.test(value)) return false
  return true
}, { message: 'Executable path must be a single local file path without command arguments.' })

export const saveAISettingsInputSchema = z.object({
  apiKey: z.string().max(4096).optional(),
  baseUrl: endpointSchema,
  model: z.string().min(1).max(120)
})

export type SaveAISettingsInput = z.infer<typeof saveAISettingsInputSchema>

const saveCloudAIConnectionInputSchema = z.object({
  id: connectionIdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  provider: cloudAIProviderSchema,
  transport: cloudAITransportSchema,
  baseUrl: endpointSchema.optional(),
  endpointMode: aiEndpointModeSchema.optional(),
  providerRegion: z.string().trim().min(1).max(60).optional(),
  modelDiscovery: aiModelDiscoverySchema.optional(),
  modelListEndpoint: endpointSchema.optional(),
  model: z.string().trim().min(1).max(160).optional(),
  apiKey: z.string().max(4096).optional(),
  clearApiKey: z.boolean().optional(),
  capabilities: aiCapabilitiesSchema.optional(),
  verification: capabilityVerificationSchema.optional()
}).strict()

const saveLocalAIConnectionInputSchema = z.object({
  id: connectionIdSchema.optional(),
  name: z.string().trim().min(1).max(80),
  provider: localAIProviderSchema,
  transport: localAITransportSchema,
  executablePath: executablePathSchema,
  model: z.string().trim().max(160).optional(),
  capabilities: aiCapabilitiesSchema.optional(),
  verification: capabilityVerificationSchema.optional()
}).strict().superRefine((input, context) => {
  if (input.provider === 'codex' && input.transport !== 'codex-cli') {
    context.addIssue({ code: 'custom', path: ['transport'], message: 'Codex connections must use codex-cli transport.' })
  }
  if (input.provider === 'claude-code' && input.transport !== 'claude-code-cli') {
    context.addIssue({ code: 'custom', path: ['transport'], message: 'Claude Code connections must use claude-code-cli transport.' })
  }
})

export const saveAIConnectionInputSchema = z.union([saveCloudAIConnectionInputSchema, saveLocalAIConnectionInputSchema])

export type SaveAIConnectionInput = z.infer<typeof saveAIConnectionInputSchema>

export const setActiveAIConnectionInputSchema = z.object({
  connectionId: connectionIdSchema
})

export type SetActiveAIConnectionInput = z.infer<typeof setActiveAIConnectionInputSchema>

export const deleteAIConnectionInputSchema = z.object({
  connectionId: connectionIdSchema
})

export type DeleteAIConnectionInput = z.infer<typeof deleteAIConnectionInputSchema>

export const testAIConnectionInputSchema = saveAIConnectionInputSchema

export type TestAIConnectionInput = z.infer<typeof testAIConnectionInputSchema>

export const discoverAIModelsInputSchema = saveCloudAIConnectionInputSchema

export type DiscoverAIModelsInput = z.infer<typeof discoverAIModelsInputSchema>

export const verifyAITextCapabilityInputSchema = saveCloudAIConnectionInputSchema.extend({
  model: z.string().trim().min(1).max(160)
})

export type VerifyAITextCapabilityInput = z.infer<typeof verifyAITextCapabilityInputSchema>

export const verifyAIImageCapabilityInputSchema = verifyAITextCapabilityInputSchema

export type VerifyAIImageCapabilityInput = z.infer<typeof verifyAIImageCapabilityInputSchema>

export const detectLocalToolsInputSchema = z.object({
  executablePaths: z.record(localToolKindSchema, executablePathSchema.optional()).optional()
}).optional()

export type DetectLocalToolsInput = z.infer<typeof detectLocalToolsInputSchema>

export const testLocalToolInputSchema = z.object({
  tool: localToolKindSchema,
  executablePath: executablePathSchema,
  model: z.string().trim().max(160).optional()
})

export type TestLocalToolInput = z.infer<typeof testLocalToolInputSchema>

export const cancelAIRequestInputSchema = z.object({
  requestId: z.string().trim().min(1).max(120)
})

export type CancelAIRequestInput = z.infer<typeof cancelAIRequestInputSchema>

export const askAIInputSchema = z.object({
  requestId: z.string().trim().min(1).max(120).optional(),
  regionId: z.string().min(1),
  question: z.string().min(1).max(20_000),
  annotationContext: z.string().max(20_000).optional(),
  includeRegionImage: z.boolean().optional(),
  imageDataUrls: z.array(z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(24_000_000)).max(10).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(100_000)
  })).max(40)
})

export type AskAIInput = z.infer<typeof askAIInputSchema>
