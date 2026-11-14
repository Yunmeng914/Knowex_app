import type { AITransport } from '../../shared/domain/models'
import { AIError } from './ai-errors'
import type { AIConnector } from './connectors/ai-connector'

export class ProviderRegistry {
  private readonly connectors = new Map<AITransport, AIConnector>()

  register(connector: AIConnector): void {
    this.connectors.set(connector.transport, connector)
  }

  get(transport: AITransport): AIConnector {
    const connector = this.connectors.get(transport)
    if (!connector) {
      throw new AIError('UNSUPPORTED_TRANSPORT', `No AI connector is registered for transport: ${transport}.`)
    }
    return connector
  }
}
