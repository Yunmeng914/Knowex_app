import type { NormalizedRect } from '@shared/domain/models'

interface PixelRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface StageRect {
  left: number
  top: number
  width: number
  height: number
}

export function selectionRects(rects: PixelRect[], stage: StageRect): NormalizedRect[] {
  const fragments = rects
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: PixelRect[] = []

  for (const fragment of fragments) {
    const line = lines.at(-1)
    if (line && sameLine(line, fragment) && fragment.left - line.right <= Math.max(line.height, fragment.height) * 2.5) {
      line.left = Math.min(line.left, fragment.left)
      line.top = Math.min(line.top, fragment.top)
      line.right = Math.max(line.right, fragment.right)
      line.bottom = Math.max(line.bottom, fragment.bottom)
      line.width = line.right - line.left
      line.height = line.bottom - line.top
    } else {
      lines.push({ ...fragment })
    }
  }

  return lines.map((rect) => ({
    x: clamp((rect.left - stage.left) / stage.width),
    y: clamp((rect.top - stage.top) / stage.height),
    width: Math.max(0.001, Math.min(1, rect.width / stage.width)),
    height: Math.max(0.001, Math.min(1, rect.height / stage.height))
  })).filter((rect) => rect.x < 1 && rect.y < 1)
}

function sameLine(a: PixelRect, b: PixelRect): boolean {
  const overlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return overlap / Math.max(1, Math.min(a.height, b.height)) >= 0.55
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
