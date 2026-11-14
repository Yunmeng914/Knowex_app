import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { AIError } from './ai-errors'
import type { AIImageInput } from './ai-types'
import type { CapabilityVerificationPublic } from '../../shared/domain/models'

const WIDTH = 256
const HEIGHT = 256
const PNG_SIGNATURE = 'iVBORw0KGgo'
const VISION_TEST_ASSET_PATH = join('resources', 'ai-test', 'knowex-vision-test-black-dots.png')

let cachedDataUrl: string | undefined

export const VISION_TEST_PROMPT = '请观察图片，只返回 JSON，不要添加 Markdown 或解释。字段为 black_dots、left_side_dots、center_dot，分别表示黑点总数、左侧黑点数、中间黑点数。'

export function createVisionTestImage(): AIImageInput {
  return {
    mimeType: 'image/png',
    dataUrl: getVisionTestImageDataUrl()
  }
}

export function getVisionTestImageDataUrl(): string {
  if (!cachedDataUrl) cachedDataUrl = `data:image/png;base64,${readVisionTestPng().toString('base64')}`
  return cachedDataUrl
}

export function parseVisionTestAnswer(answer: string): { status: CapabilityVerificationPublic['image']['status']; message: string } {
  const trimmed = answer.trim()
  if (!trimmed) return { status: 'response-parse-error', message: 'The model returned an empty image test answer.' }

  const jsonText = extractJsonObject(trimmed)
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const blackDots = readCount(parsed.black_dots ?? parsed.blackDots ?? parsed.total_black_dots ?? parsed.totalBlackDots ?? parsed.total ?? parsed.dots)
      const leftSideDots = readCount(parsed.left_side_dots ?? parsed.leftSideDots ?? parsed.left_dots ?? parsed.leftDots ?? parsed.left)
      const centerDot = readCount(parsed.center_dot ?? parsed.centerDot ?? parsed.middle_dot ?? parsed.middleDot ?? parsed.center ?? parsed.middle)
      if (blackDots === 3 && leftSideDots === 2 && centerDot === 1) return { status: 'verified', message: 'Image capability verified.' }
      return { status: 'wrong-answer', message: 'The model returned JSON, but did not identify the three black dots with two on the left and one in the center.' }
    } catch {
      const fallback = parseTextFallback(trimmed)
      if (fallback) return fallback
      return { status: 'response-parse-error', message: 'The model did not return valid JSON for the image test.' }
    }
  }

  return parseTextFallback(trimmed) ?? {
    status: 'response-parse-error',
    message: 'The model did not return JSON or a recognizable three-black-dot answer.'
  }
}

export function isVisionTestPngDataUrl(value: string): boolean {
  return value.startsWith(`data:image/png;base64,${PNG_SIGNATURE}`)
}

function parseTextFallback(value: string): { status: CapabilityVerificationPublic['image']['status']; message: string } | undefined {
  const normalized = value.trim().toLowerCase()
  const hasBlackDots = hasBlack(normalized) && hasDot(normalized)
  const hasTotal = hasCountWord(normalized, 3)
  const hasLeft = hasLeftWord(normalized) && hasCountWord(normalized, 2)
  const hasCenter = hasCenterWord(normalized) && hasCountWord(normalized, 1)
  if (hasBlackDots && hasTotal && hasLeft && hasCenter) return { status: 'verified', message: 'Image capability verified.' }
  if (hasBlackDots || hasTotal || hasLeft || hasCenter) return { status: 'wrong-answer', message: 'The model identified only part of the black-dot layout.' }
  return undefined
}

function extractJsonObject(value: string): string | undefined {
  const withoutFence = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  return withoutFence.slice(start, end + 1)
}

function readCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (/^3\b/.test(normalized) || normalized.includes('three') || normalized.includes('三个') || normalized === '三') return 3
  if (/^2\b/.test(normalized) || normalized.includes('two') || normalized.includes('两个') || normalized.includes('两') || normalized === '二') return 2
  if (/^1\b/.test(normalized) || normalized.includes('one') || normalized.includes('一个') || normalized === '一') return 1
  return undefined
}

function hasCountWord(value: string, count: 1 | 2 | 3): boolean {
  if (count === 3) return /\b3\b/.test(value) || value.includes('three') || value.includes('三个') || value.includes('三')
  if (count === 2) return /\b2\b/.test(value) || value.includes('two') || value.includes('两个') || value.includes('两') || value.includes('二')
  return /\b1\b/.test(value) || value.includes('one') || value.includes('一个') || value.includes('一')
}

function hasBlack(value: string): boolean {
  return value.includes('black') || value.includes('黑色') || value.includes('黑')
}

function hasDot(value: string): boolean {
  return value.includes('dot') || value.includes('point') || value.includes('circle') || value.includes('黑点') || value.includes('点') || value.includes('圆点')
}

function hasLeftWord(value: string): boolean {
  return value.includes('left') || value.includes('左侧') || value.includes('左边')
}

function hasCenterWord(value: string): boolean {
  return value.includes('center') || value.includes('middle') || value.includes('中间') || value.includes('中央')
}

function readVisionTestPng(): Buffer {
  for (const candidate of visionTestAssetCandidates()) {
    try {
      return readFileSync(candidate)
    } catch {
      // Keep the image test usable in stripped test/build environments.
    }
  }
  return generateBlackDotsPng()
}

function visionTestAssetCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  return [
    join(process.cwd(), VISION_TEST_ASSET_PATH),
    join(moduleDir, '..', '..', VISION_TEST_ASSET_PATH),
    join(moduleDir, '..', '..', '..', VISION_TEST_ASSET_PATH)
  ]
}

function generateBlackDotsPng(): Buffer {
  const rawRows: number[] = []
  const dots = [
    { x: 26, y: 27, radius: 8 },
    { x: 63, y: 63, radius: 8 },
    { x: 128, y: 128, radius: 8 }
  ]
  for (let y = 0; y < HEIGHT; y += 1) {
    rawRows.push(0)
    for (let x = 0; x < WIDTH; x += 1) {
      const black = dots.some((dot) => Math.hypot(x - dot.x, y - dot.y) <= dot.radius)
      rawRows.push(black ? 0 : 255, black ? 0 : 255, black ? 0 : 255, 255)
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([uint32(WIDTH), uint32(HEIGHT), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('IDAT', deflateSync(Buffer.from(rawRows))),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))])
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function missingVisionTestAssetError(cause?: unknown): AIError {
  return new AIError('PROVIDER_ERROR', 'The built-in image capability test asset could not be generated.', {
    cause,
    retryable: false,
    suggestedAction: 'Reinstall Knowex or run the application integrity check.'
  })
}
