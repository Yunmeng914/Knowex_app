import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './channels'

describe('AI IPC channels', () => {
  it('does not expose a renderer channel for reading keys, secrets, or raw config', () => {
    const aiChannels = Object.values(IPC_CHANNELS).filter((channel) => channel.startsWith('ai:'))

    expect(aiChannels).toContain('ai:get-settings')
    expect(aiChannels.join(' ')).not.toMatch(/key|secret|credential|config/i)
  })
})
