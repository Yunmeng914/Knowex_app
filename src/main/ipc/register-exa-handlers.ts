/** Narrow Exa IPC composition: trust-check, validate, then delegate without business logic. */
import { getExaContentInputSchema, openExaSourceInputSchema, saveExaSettingsInputSchema, searchExaInputSchema } from '../../shared/contracts/ipc'
import { IPC_CHANNELS } from '../../shared/contracts/channels'
import type { AppServices } from '../app-services'
import { registerTrustedHandler } from './trusted-ipc-sender'

export function registerExaHandlers({ exa }: AppServices): void {
  registerTrustedHandler(IPC_CHANNELS.exaGetSettings, () => exa.getSettings())
  registerTrustedHandler(IPC_CHANNELS.exaSaveSettings, (_, input: unknown) => exa.saveSettings(saveExaSettingsInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.exaTestConnection, () => exa.testConnection())
  registerTrustedHandler(IPC_CHANNELS.exaSearch, (_, input: unknown) => exa.search(searchExaInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.exaGetContent, (_, input: unknown) => exa.getContent(getExaContentInputSchema.parse(input)))
  registerTrustedHandler(IPC_CHANNELS.exaOpenSource, (_, input: unknown) => {
    const { url } = openExaSourceInputSchema.parse(input)
    return exa.openSource(url)
  })
}
