import type { AskAIInput } from '../../shared/contracts/ipc'
import { AIService } from './ai-service'

export interface VisionChatProvider {
  ask(input: AskAIInput): Promise<string>
}

/**
 * Compatibility adapter for older imports. New code should depend on AIService.
 */
export class OpenAIResponsesProvider implements VisionChatProvider {
  constructor(private readonly service: AIService) {}

  ask(input: AskAIInput): Promise<string> {
    return this.service.ask(input)
  }
}
