import { describe, expect, it } from 'vitest'
import { selectionRects } from './selection-geometry'

const stage = { left: 100, top: 50, width: 500, height: 800 }
const rect = (left: number, top: number, width: number, height = 16) => ({ left, top, right: left + width, bottom: top + height, width, height })

describe('selection geometry', () => {
  it('joins adjacent PDF text spans on the same visual line', () => {
    const result = selectionRects([rect(120, 80, 50), rect(173, 80.5, 60)], stage)
    expect(result).toHaveLength(1)
    expect(result[0].x).toBeCloseTo(0.04)
    expect(result[0].width).toBeCloseTo(0.226)
  })

  it('keeps separate lines and distant columns independent', () => {
    const result = selectionRects([rect(120, 80, 50), rect(400, 80, 50), rect(120, 104, 90)], stage)
    expect(result).toHaveLength(3)
  })
})
