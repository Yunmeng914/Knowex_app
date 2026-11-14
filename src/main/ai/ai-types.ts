import type { AITransport } from '../../shared/domain/models'
import type { StoredAIConnection } from '../storage/config-store'

export interface AIImageInput {
  mimeType: 'image/png'
  dataUrl: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIRequest {
  systemPrompt: string
  evidenceText: string
  messages: AIMessage[]
  images: AIImageInput[]
}

export interface AIResponse {
  text: string
  providerRequestId?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

export interface AIConnectionTestResult {
  ok: boolean
  message: string
}

export interface AIConnectorContext {
  connection: StoredAIConnection
  apiKey?: string
  signal?: AbortSignal
}

export interface AIConnectorRegistration {
  transport: AITransport
}
