import type { AskAIInput } from '../../shared/contracts/ipc'
import { annotationKind } from '../../shared/domain/models'
import { LocalAssetStore } from '../assets/local-asset-store'
import { WorkspaceRepository } from '../storage/workspace-repository'
import type { AIImageInput, AIRequest } from './ai-types'

const SYSTEM_PROMPT = 'You are a research reading assistant. Analyze only the supplied annotation evidence and the user question. Distinguish source evidence from inference, preserve mathematical and scientific nuance, and answer in the language used by the user.'

export class PromptBuilder {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly assets: LocalAssetStore
  ) {}

  async build(input: AskAIInput): Promise<AIRequest> {
    const region = await this.repository.getRegion(input.regionId)
    const kind = annotationKind(region)
    const evidenceText = kind === 'snapshot'
      ? `Reader note: ${input.annotationContext || region.note.annotation || '(none)'}`
      : `Evidence from the document annotation:\nSelected text: ${region.asset.selectedText || '(none)'}\nReader note: ${input.annotationContext || region.note.annotation || '(none)'}\nPage: ${region.asset.anchor.pageOrSlide}`
    const currentMessageText = kind === 'snapshot'
      ? `Reader note: ${input.annotationContext || region.note.annotation || '(none)'}\n\nCurrent question: ${input.question}`
      : `Evidence from the document annotation:\nSelected text: ${region.asset.selectedText || '(none)'}\nReader note: ${input.annotationContext || region.note.annotation || '(none)'}\nPage: ${region.asset.anchor.pageOrSlide}\n\nCurrent question: ${input.question}`
    const images: AIImageInput[] = []
    if (kind === 'snapshot' && input.includeRegionImage !== false) {
      images.push({ mimeType: 'image/png' as const, dataUrl: await this.assets.readDataUrl(region.asset) })
    }
    for (const dataUrl of input.imageDataUrls ?? []) {
      images.push({ mimeType: 'image/png' as const, dataUrl })
    }

    return {
      systemPrompt: SYSTEM_PROMPT,
      evidenceText,
      messages: [...input.history, { role: 'user', content: currentMessageText }],
      images
    }
  }
}
