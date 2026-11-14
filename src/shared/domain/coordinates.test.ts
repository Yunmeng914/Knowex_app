import { describe, expect, it } from 'vitest'
import { denormalizeRect, rectFromPoints } from './coordinates'

describe('region coordinates', () => {
  it('normalizes a reverse drag', () => {
    expect(rectFromPoints({ x: 80, y: 90 }, { x: 20, y: 10 }, 100, 100)).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6,
      height: 0.8
    })
  })

  it('denormalizes for an arbitrary viewport', () => {
    expect(denormalizeRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 800, 1000)).toEqual({
      x: 80,
      y: 200,
      width: 240,
      height: 400
    })
  })
})
