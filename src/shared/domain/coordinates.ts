import type { NormalizedRect } from './models'

export interface Point {
  x: number
  y: number
}

export function rectFromPoints(start: Point, end: Point, width: number, height: number): NormalizedRect {
  if (width <= 0 || height <= 0) {
    throw new Error('Capture surface must have positive dimensions.')
  }

  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)

  return {
    x: clamp(left / width),
    y: clamp(top / height),
    width: clamp((right - left) / width),
    height: clamp((bottom - top) / height)
  }
}

export function denormalizeRect(rect: NormalizedRect, width: number, height: number): NormalizedRect {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
