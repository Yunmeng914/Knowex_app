import type { AITransport } from '../../../shared/domain/models'
import type { AIConnectorContext, AIRequest, AIResponse } from '../ai-types'

export interface AIConnector {
  readonly transport: AITransport
  ask(request: AIRequest, context: AIConnectorContext): Promise<AIResponse>
}
