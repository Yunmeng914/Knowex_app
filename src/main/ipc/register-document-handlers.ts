import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppServices } from '../app-services'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerDocumentHandlers({ documents, repository }: AppServices): void {
  registerTrustedHandler(IPC_CHANNELS.documentOpen, () => documents.openFromDialog())
  registerTrustedHandler(IPC_CHANNELS.documentOpenRecent, (_, documentId: unknown) => documents.openRecent(z.string().min(1).parse(documentId)))
  registerTrustedHandler(IPC_CHANNELS.documentList, () => repository.listDocuments())
}
