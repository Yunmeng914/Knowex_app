/**
 * Express application factory for Knowex Web Edition.
 *
 * Mounts validated `/api/*` endpoints backed by the existing Knowex domain
 * services (`createAppServices`) plus Vite middleware in dev or static SPA
 * assets from `dist/client` in production.
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ZodError, z } from 'zod'
import type { OpenDocumentResult, ZoteroOpenResult } from '../shared/domain/models'
import {
  askAIInputSchema,
  cancelAIRequestInputSchema,
  createMarkupInputSchema,
  createRegionInputSchema,
  deleteAIConnectionInputSchema,
  detectLocalToolsInputSchema,
  discoverAIModelsInputSchema,
  getExaContentInputSchema,
  languageSchema,
  openExaSourceInputSchema,
  saveAIConnectionInputSchema,
  saveAISettingsInputSchema,
  saveAppSettingsInputSchema,
  saveExaSettingsInputSchema,
  saveZoteroSettingsInputSchema,
  saveZoteroSyncPreferenceInputSchema,
  searchExaInputSchema,
  setActiveAIConnectionInputSchema,
  testAIConnectionInputSchema,
  testLocalToolInputSchema,
  updateRegionInputSchema,
  verifyAIImageCapabilityInputSchema,
  verifyAITextCapabilityInputSchema,
  zoteroOpenOptionsSchema
} from '../shared/contracts/ipc'
import { createAppServices, type AppServices } from '../main/app-services'
import { ConfigStore } from '../main/storage/config-store'
import { WebWorkspaceManager } from './workspace-manager'

export interface CreateWebAppOptions {
  dataDir?: string
  isProduction?: boolean
}

export interface WebAppInstance {
  app: express.Express
  services: AppServices
  workspaces: WebWorkspaceManager
  dispose(): Promise<void>
}

interface SerializedOpenDocumentResult {
  document: OpenDocumentResult['document']
  bytesBase64: string
  regions: OpenDocumentResult['regions']
}

export async function createWebApp(options: CreateWebAppOptions = {}): Promise<WebAppInstance> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production'
  const config = new ConfigStore(options.dataDir ? { dataDir: options.dataDir } : {})
  const services = createAppServices(config)
  const workspaces = new WebWorkspaceManager(services)

  await workspaces.ensureInitialized()
  await services.maintenance.start()

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '35mb' }))

  // Health probe for container startup checks
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'web', version: '0.7.0' })
  })

  // --- Workspace & Note Export ---
  app.get('/api/workspace', asyncHandler(async (_req, res) => {
    res.json(await workspaces.getStatus())
  }))

  app.get('/api/workspaces', asyncHandler(async (_req, res) => {
    res.json(await workspaces.listWorkspaces())
  }))

  app.post('/api/workspaces/select', asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(64) }).parse(req.body)
    res.json(await workspaces.selectWorkspace(name))
  }))

  app.get('/api/workspace/paths', asyncHandler(async (req, res) => {
    const documentId = typeof req.query.documentId === 'string' && req.query.documentId.trim()
      ? req.query.documentId.trim()
      : undefined
    res.json(await workspaces.getPaths(documentId))
  }))

  app.get('/api/workspace/note', asyncHandler(async (req, res) => {
    const documentId = z.string().min(1).parse(req.query.documentId)
    res.json(await workspaces.readNoteMarkdown(documentId))
  }))

  app.get('/api/workspace/export', asyncHandler(async (_req, res) => {
    res.json(await workspaces.exportWorkspaceNotes())
  }))

  // --- Documents ---
  app.get('/api/documents', asyncHandler(async (_req, res) => {
    res.json(await services.repository.listDocuments())
  }))

  app.post('/api/documents/sample', asyncHandler(async (_req, res) => {
    res.json(serializeOpenResult(await workspaces.openSampleDocument()))
  }))

  app.post(
    '/api/documents/upload',
    express.raw({ type: 'application/octet-stream', limit: '105mb' }),
    asyncHandler(async (req, res) => {
      const encodedName = req.header('x-knowex-filename')
      const filename = encodedName ? decodeURIComponent(encodedName) : 'document.pdf'
      const body = req.body
      if (!Buffer.isBuffer(body)) {
        res.status(400).json({ error: 'Expected raw document bytes in request body.' })
        return
      }
      const result = await services.documents.importUploaded({
        filename,
        bytes: new Uint8Array(body)
      })
      res.json(serializeOpenResult(result))
    })
  )

  app.get('/api/documents/:id/open', asyncHandler(async (req, res) => {
    const documentId = z.string().min(1).parse(paramString(req.params.id))
    const result = await services.documents.openRecent(documentId)
    res.json(serializeOpenResult(result))
  }))

  // --- Regions & Trash ---
  app.get('/api/regions', asyncHandler(async (req, res) => {
    const documentId = z.string().min(1).parse(req.query.documentId)
    res.json(await services.regions.list(documentId))
  }))

  app.post('/api/regions', asyncHandler(async (req, res) => {
    const input = createRegionInputSchema.parse(req.body)
    res.json(await services.regions.create(input))
  }))

  app.post('/api/regions/markup', asyncHandler(async (req, res) => {
    const input = createMarkupInputSchema.parse(req.body)
    res.json(await services.regions.createMarkup(input))
  }))

  app.patch('/api/regions/:id', asyncHandler(async (req, res) => {
    const regionId = z.string().min(1).parse(paramString(req.params.id))
    const input = updateRegionInputSchema.parse({ ...req.body, regionId })
    res.json(await services.regions.update(input))
  }))

  app.delete('/api/regions/:id', asyncHandler(async (req, res) => {
    const regionId = z.string().min(1).parse(paramString(req.params.id))
    await services.regions.delete(regionId)
    res.json({ ok: true })
  }))

  app.get('/api/regions/trash', asyncHandler(async (req, res) => {
    const documentId = typeof req.query.documentId === 'string' && req.query.documentId.trim()
      ? req.query.documentId.trim()
      : undefined
    res.json(await services.regions.listTrash(documentId))
  }))

  app.post('/api/regions/:id/restore', asyncHandler(async (req, res) => {
    const regionId = z.string().min(1).parse(paramString(req.params.id))
    res.json(await services.regions.restore(regionId))
  }))

  app.delete('/api/regions/:id/purge', asyncHandler(async (req, res) => {
    const regionId = z.string().min(1).parse(paramString(req.params.id))
    await services.regions.purge(regionId)
    res.json({ ok: true })
  }))

  // --- AI Connections & Q&A ---
  app.get('/api/ai/settings', asyncHandler(async (_req, res) => {
    res.json(await services.aiConnections.getSettings())
  }))

  app.get('/api/ai/presets', asyncHandler(async (_req, res) => {
    res.json(services.aiConnections.getProviderPresets())
  }))

  app.post('/api/ai/settings', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.saveLegacyOpenAISettings(saveAISettingsInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/connections', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.saveConnection(saveAIConnectionInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/connections/active', asyncHandler(async (req, res) => {
    const { connectionId } = setActiveAIConnectionInputSchema.parse(req.body)
    res.json(await services.aiConnections.setActiveConnection(connectionId))
  }))

  app.delete('/api/ai/connections/:id', asyncHandler(async (req, res) => {
    const { connectionId } = deleteAIConnectionInputSchema.parse({ connectionId: paramString(req.params.id) })
    res.json(await services.aiConnections.deleteConnection(connectionId))
  }))

  app.post('/api/ai/connections/test', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.testConnection(testAIConnectionInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/models/discover', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.discoverModels(discoverAIModelsInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/verify/text', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.verifyTextCapability(verifyAITextCapabilityInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/verify/image', asyncHandler(async (req, res) => {
    res.json(await services.aiConnections.verifyImageCapability(verifyAIImageCapabilityInputSchema.parse(req.body)))
  }))

  app.post('/api/ai/local-tools/detect', asyncHandler(async (req, res) => {
    const parsed = detectLocalToolsInputSchema.parse(req.body)
    res.json(await services.localTools.detectAll(parsed?.executablePaths))
  }))

  app.post('/api/ai/local-tools/test', asyncHandler(async (req, res) => {
    const parsed = testLocalToolInputSchema.parse(req.body)
    const result = await services.aiConnections.testConnection({
      name: parsed.tool === 'codex' ? 'Codex CLI' : 'Claude Code CLI',
      provider: parsed.tool === 'codex' ? 'codex' : 'claude-code',
      transport: parsed.tool === 'codex' ? 'codex-cli' : 'claude-code-cli',
      executablePath: parsed.executablePath,
      model: parsed.model,
      capabilities: { text: true, vision: false, streaming: false }
    })
    res.json({
      success: result.success,
      tool: parsed.tool,
      executablePath: parsed.executablePath,
      message: result.message,
      errorCode: result.errorCode,
      latencyMs: result.latencyMs,
      checkedAt: result.checkedAt
    })
  }))

  app.post('/api/ai/ask', asyncHandler(async (req, res) => {
    const answer = await services.ai.ask(askAIInputSchema.parse(req.body))
    res.json({ answer })
  }))

  app.post('/api/ai/cancel', asyncHandler(async (req, res) => {
    const { requestId } = cancelAIRequestInputSchema.parse(req.body)
    res.json(services.ai.cancel(requestId))
  }))

  // --- Exa Academic Search ---
  app.get('/api/exa/settings', asyncHandler(async (_req, res) => {
    res.json(await services.exa.getSettings())
  }))

  app.post('/api/exa/settings', asyncHandler(async (req, res) => {
    res.json(await services.exa.saveSettings(saveExaSettingsInputSchema.parse(req.body)))
  }))

  app.post('/api/exa/test', asyncHandler(async (_req, res) => {
    res.json(await services.exa.testConnection())
  }))

  app.post('/api/exa/search', asyncHandler(async (req, res) => {
    res.json(await services.exa.search(searchExaInputSchema.parse(req.body)))
  }))

  app.post('/api/exa/content', asyncHandler(async (req, res) => {
    res.json(await services.exa.getContent(getExaContentInputSchema.parse(req.body)))
  }))

  app.post('/api/exa/open-source', asyncHandler(async (req, res) => {
    const { url } = openExaSourceInputSchema.parse(req.body)
    res.json(await services.exa.openSource(url))
  }))

  // --- Preferences, Onboarding & Language ---
  app.get('/api/preferences', asyncHandler(async (_req, res) => {
    res.json(await config.getAppSettings())
  }))

  app.put('/api/preferences', asyncHandler(async (req, res) => {
    const settings = saveAppSettingsInputSchema.parse(req.body)
    res.json(await config.saveAppSettings(settings))
  }))

  app.get('/api/onboarding', asyncHandler(async (_req, res) => {
    res.json(await config.getOnboardingStatus())
  }))

  app.post('/api/onboarding/complete', asyncHandler(async (_req, res) => {
    res.json(await config.completeOnboarding())
  }))

  app.get('/api/language', asyncHandler(async (_req, res) => {
    res.json({ language: await config.getLanguage() })
  }))

  app.put('/api/language', asyncHandler(async (req, res) => {
    const { language } = z.object({ language: languageSchema }).parse(req.body)
    await config.setLanguage(language)
    res.json({ language })
  }))

  // --- Zotero ---
  app.get('/api/zotero/check', asyncHandler(async (_req, res) => {
    res.json(await services.zotero.checkConnection())
  }))

  app.get('/api/zotero/list', asyncHandler(async (_req, res) => {
    res.json(await services.zotero.listAttachments())
  }))

  app.post('/api/zotero/open', asyncHandler(async (req, res) => {
    const { key, options: openOptions } = z.object({
      key: z.string().min(1),
      options: zoteroOpenOptionsSchema
    }).parse(req.body)
    const result = await services.zotero.openAttachment(key)
    let importedCount = 0
    let exportedCount = 0
    if (openOptions.importAnnotations) {
      const imported = await services.zotero.listImportedRecords(key, result.document.zoteroParentItemKey)
      importedCount = await services.regions.importZotero(result.document.id, imported)
    }
    if (openOptions.exportKnowex) {
      exportedCount = await services.zoteroWeb.exportDocument(result.document.id)
    }
    const payload: Omit<ZoteroOpenResult, 'result'> & { result: SerializedOpenDocumentResult } = {
      result: serializeOpenResult(result),
      importedCount,
      exportedCount
    }
    res.json(payload)
  }))

  app.get('/api/zotero/sync-preference/:key', asyncHandler(async (req, res) => {
    const key = z.string().regex(/^[A-Z0-9]{8}$/i).parse(paramString(req.params.key))
    res.json(await config.getZoteroSyncPreference(key))
  }))

  app.put('/api/zotero/sync-preference', asyncHandler(async (req, res) => {
    res.json(await config.saveZoteroSyncPreference(saveZoteroSyncPreferenceInputSchema.parse(req.body)))
  }))

  app.get('/api/zotero/settings', asyncHandler(async (_req, res) => {
    res.json(await config.getZoteroSettings())
  }))

  app.put('/api/zotero/settings', asyncHandler(async (req, res) => {
    res.json(await config.saveZoteroSettings(saveZoteroSettingsInputSchema.parse(req.body)))
  }))

  app.post('/api/zotero/export', asyncHandler(async (req, res) => {
    const { documentId } = z.object({ documentId: z.string().min(1) }).parse(req.body)
    const count = await services.zoteroWeb.exportDocument(documentId)
    res.json({ count })
  }))

  // Structured API error handler (never leaks raw stack traces or credentials)
  app.use('/api', (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      res.status(400).json({ error: issue?.message || 'Invalid request input.' })
      return
    }
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    res.status(400).json({ error: message })
  })

  // Frontend serving: Vite middleware in development, static built assets in production.
  let viteClose: (() => Promise<void>) | undefined
  if (!isProduction) {
    const { createServer } = await import('vite')
    const vite = await createServer({
      configFile: resolve('vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    })
    app.use(vite.middlewares)
    viteClose = () => vite.close()
  } else {
    const clientDir = resolve('dist/client')
    app.use(express.static(clientDir))
    app.get(/^(?!\/api(?:\/|$)).*/, async (_req, res) => {
      const html = await readFile(resolve(clientDir, 'index.html'), 'utf8')
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html)
    })
  }

  return {
    app,
    services,
    workspaces,
    dispose: async () => {
      await services.maintenance.dispose()
      if (viteClose) await viteClose()
    }
  }
}

function serializeOpenResult(result: OpenDocumentResult): SerializedOpenDocumentResult {
  return {
    document: result.document,
    bytesBase64: Buffer.from(result.bytes).toString('base64'),
    regions: result.regions
  }
}

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next)
  }
}
