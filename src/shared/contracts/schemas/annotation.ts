import { z } from 'zod'
import type { AnnotationColor } from '../../domain/models'

export const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1)
})

export const createRegionInputSchema = z.object({
  documentId: z.string().min(1),
  pageOrSlide: z.number().int().positive(),
  rect: normalizedRectSchema,
  zoomAtCapture: z.number().positive(),
  pngDataUrl: z.string().startsWith('data:image/png;base64,')
})

export type CreateRegionInput = z.infer<typeof createRegionInputSchema>

export const createMarkupInputSchema = z.object({
  kind: z.enum(['highlight', 'underline', 'note']),
  documentId: z.string().min(1),
  pageOrSlide: z.number().int().positive(),
  rect: normalizedRectSchema,
  rects: z.array(normalizedRectSchema).max(100).optional(),
  zoomAtCapture: z.number().positive(),
  selectedText: z.string().max(50_000).optional(),
  color: z.enum(['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray']) satisfies z.ZodType<AnnotationColor>
})

export type CreateMarkupInput = z.infer<typeof createMarkupInputSchema>

export const updateRegionInputSchema = z.object({
  regionId: z.string().min(1),
  title: z.string().max(200),
  annotation: z.string().max(20_000),
  tags: z.array(z.string().min(1).max(64)).max(32),
  color: z.enum(['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray']).optional(),
  conversation: z.array(z.object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(100_000),
    createdAt: z.string().min(1)
  })).max(100)
})

export type UpdateRegionInput = z.infer<typeof updateRegionInputSchema>
