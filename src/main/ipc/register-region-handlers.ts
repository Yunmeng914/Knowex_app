import { z } from 'zod'
import { createMarkupInputSchema, createRegionInputSchema, updateRegionInputSchema } from '../../shared/contracts/ipc'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppServices } from '../app-services'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerRegionHandlers({ regions }: AppServices): void {
  registerTrustedHandler(IPC_CHANNELS.regionCreate, (_, input: unknown) => regions.create(createRegionInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.regionCreateMarkup, (_, input: unknown) => regions.createMarkup(createMarkupInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.regionUpdate, (_, input: unknown) => regions.update(updateRegionInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.regionDelete, (_, regionId: unknown) => regions.delete(z.string().min(1).parse(regionId)))
  registerTrustedHandler(IPC_CHANNELS.regionList, (_, documentId: unknown) => regions.list(z.string().min(1).parse(documentId)))
  registerTrustedHandler(IPC_CHANNELS.regionTrashList, (_, documentId: unknown) => regions.listTrash(documentId == null ? undefined : z.string().min(1).parse(documentId)))
  registerTrustedHandler(IPC_CHANNELS.regionRestore, (_, regionId: unknown) => regions.restore(z.string().min(1).parse(regionId)))
  registerTrustedHandler(IPC_CHANNELS.regionPurge, (_, regionId: unknown) => regions.purge(z.string().min(1).parse(regionId)))
}
