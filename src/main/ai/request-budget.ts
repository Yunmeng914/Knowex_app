import { AIError } from './ai-errors'
import type { AIRequest } from './ai-types'

export const DEFAULT_AI_REQUEST_BUDGET = {
  maxHistoryMessages: 20,
  maxTotalTextChars: 120_000,
  maxImages: 3,
  maxDecodedImageBytes: 5_000_000,
  maxTotalDecodedImageBytes: 12_000_000,
  maxImagePixels: 12_000_000
} as const

export const TEST_AI_REQUEST_BUDGET = {
  maxHistoryMessages: 0,
  maxTotalTextChars: 10_000,
  maxImages: 1,
  maxDecodedImageBytes: 1_000_000,
  maxTotalDecodedImageBytes: 1_000_000,
  maxImagePixels: 1_000_000
} as const

export function assertAIRequestBudget(
  request: AIRequest,
  budget: AIRequestBudget = DEFAULT_AI_REQUEST_BUDGET
): void {
  const history = request.messages.slice(0, -1)
  if (history.length > budget.maxHistoryMessages) {
    throw new AIError('REQUEST_BUDGET_EXCEEDED', 'History is too long. Start a new conversation before asking again.', { retryable: false })
  }
  const totalTextChars = request.systemPrompt.length
    + request.evidenceText.length
    + request.messages.reduce((sum, message) => sum + message.content.length, 0)
  if (totalTextChars > budget.maxTotalTextChars) {
    throw new AIError('REQUEST_BUDGET_EXCEEDED', 'The current request exceeds the local safety limit.', { retryable: false })
  }
  if (request.images.length > budget.maxImages) {
    throw new AIError('REQUEST_BUDGET_EXCEEDED', 'Too many images are attached to this request.', { retryable: false })
  }

  let totalImageBytes = 0
  for (const image of request.images) {
    const bytes = decodePngDataUrl(image.dataUrl)
    totalImageBytes += bytes.byteLength
    if (bytes.byteLength > budget.maxDecodedImageBytes) {
      throw new AIError('REQUEST_BUDGET_EXCEEDED', 'An attached image is too large. Reduce the selected area and try again.', { retryable: false })
    }
    const pixels = readPngPixels(bytes)
    if (pixels > budget.maxImagePixels) {
      throw new AIError('REQUEST_BUDGET_EXCEEDED', 'An attached image has too many pixels. Reduce the selected area and try again.', { retryable: false })
    }
  }
  if (totalImageBytes > budget.maxTotalDecodedImageBytes) {
    throw new AIError('REQUEST_BUDGET_EXCEEDED', 'The attached images are too large together. Remove an image or reduce the selected area.', { retryable: false })
  }
}

export interface AIRequestBudget {
  maxHistoryMessages: number
  maxTotalTextChars: number
  maxImages: number
  maxDecodedImageBytes: number
  maxTotalDecodedImageBytes: number
  maxImagePixels: number
}

function decodePngDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl)
  if (!match) throw new AIError('REQUEST_BUDGET_EXCEEDED', 'Only PNG images can be sent to the AI provider.', { retryable: false })
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length < 24 || bytes.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) !== 0) {
    throw new AIError('REQUEST_BUDGET_EXCEEDED', 'Only valid PNG images can be sent to the AI provider.', { retryable: false })
  }
  return bytes
}

function readPngPixels(bytes: Buffer): number {
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  return width * height
}
