/**
 * Shared renderer workflow types for moving document evidence into annotation tools.
 * Reader and capture features emit these intents; the app layer opens the matching annotation section.
 */
export type EvidenceTool = 'exa' | 'ai' | 'translate'

export interface AnnotationToolRequest {
  requestId: string
  regionId: string
  tool: Exclude<EvidenceTool, 'translate'>
  initialQuestion?: string
}
