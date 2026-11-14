import type { KnowexApi } from '../../shared/contracts/ipc'

declare global {
  interface Window {
    knowex: KnowexApi
  }
}

export {}
