import { dialog, shell } from 'electron'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppServices } from '../app-services'
import { documentNotePath } from '../notes/markdown-note-service'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerWorkspaceHandlers({ config, repository }: AppServices): void {
  registerTrustedHandler(IPC_CHANNELS.workspaceGet, async () => {
    const path = await config.getWorkspacePath()
    return { path, ready: Boolean(path) }
  })

  registerTrustedHandler(IPC_CHANNELS.workspaceChoose, async () => {
    const language = await config.getLanguage()
    const selection = await dialog.showOpenDialog({
      title: language === 'zh-CN' ? '选择 Knowex 工作区' : 'Choose a Knowex Workspace',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selection.canceled || !selection.filePaths[0]) {
      const path = await config.getWorkspacePath()
      return { path, ready: Boolean(path) }
    }
    await config.setWorkspacePath(selection.filePaths[0])
    await repository.ensureWorkspace()
    return { path: selection.filePaths[0], ready: true }
  })

  registerTrustedHandler(IPC_CHANNELS.workspacePaths, async (_, documentId: unknown) => {
    const workspacePath = await config.getWorkspacePath()
    const parsedDocumentId = documentId == null ? undefined : z.string().min(1).parse(documentId)
    const document = parsedDocumentId ? await repository.getDocument(parsedDocumentId).catch(() => undefined) : undefined
    return {
      workspacePath,
      notesDirectory: workspacePath ? join(workspacePath, 'notes') : null,
      temporaryDirectory: workspacePath ? join(workspacePath, '.knowex', 'tmp') : null,
      recycleBinIndexPath: workspacePath ? join(workspacePath, '.knowex', 'index.json') : null,
      documentNotePath: workspacePath && document ? documentNotePath(workspacePath, document) : null
    }
  })

  registerTrustedHandler(IPC_CHANNELS.workspaceOpen, async () => {
    const workspacePath = await repository.ensureWorkspace()
    const error = await shell.openPath(workspacePath)
    if (error) throw new Error(error)
  })

  registerTrustedHandler(IPC_CHANNELS.workspaceRevealNote, async (_, documentId: unknown) => {
    const id = z.string().min(1).parse(documentId)
    const workspacePath = await repository.ensureWorkspace()
    const document = await repository.getDocument(id)
    const notePath = documentNotePath(workspacePath, document)
    try {
      await access(notePath)
      shell.showItemInFolder(notePath)
    } catch {
      const error = await shell.openPath(join(workspacePath, 'notes'))
      if (error) throw new Error(error)
    }
  })
}
