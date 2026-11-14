import { describe, expect, it } from 'vitest'
import { isPrivateOrMetadataEndpoint } from './endpoint-policy'

describe('private network endpoint checks', () => {
  it('classifies localhost, RFC1918, link-local, multicast, unspecified, and metadata hosts as private', () => {
    for (const host of ['localhost', 'app.localhost', '0.0.0.0', '10.0.0.8', '172.20.0.1', '192.168.0.2', '169.254.1.1', '224.0.0.1', '169.254.169.254', '::', '::1', 'fd00::1', 'ff02::1']) {
      expect(isPrivateOrMetadataEndpoint(host)).toBe(true)
    }
  })
})
