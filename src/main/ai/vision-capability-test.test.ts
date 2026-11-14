import { describe, expect, it } from 'vitest'
import { createVisionTestImage, getVisionTestImageDataUrl, isVisionTestPngDataUrl, parseVisionTestAnswer } from './vision-capability-test'

describe('vision capability test helpers', () => {
  it('returns a deterministic PNG data URL for the built-in black-dot test asset', () => {
    const image = createVisionTestImage()

    expect(image.mimeType).toBe('image/png')
    expect(isVisionTestPngDataUrl(image.dataUrl)).toBe(true)
    expect(image.dataUrl).toBe(getVisionTestImageDataUrl())
    expect(Buffer.from(image.dataUrl.split(',')[1], 'base64').byteLength).toBeGreaterThan(50)
  })

  it.each([
    ['English JSON', '{"black_dots":3,"left_side_dots":2,"center_dot":1}', 'verified'],
    ['Chinese JSON strings', '{"black_dots":"三个","left_side_dots":"两个","center_dot":"一个"}', 'verified'],
    ['Markdown JSON', '```json\n{"blackDots":3,"leftSideDots":2,"centerDot":1}\n```', 'verified'],
    ['Alternative JSON names', '{"total_black_dots":3,"left_dots":2,"middle_dot":1}', 'verified'],
    ['Extra explanation after JSON', '{"total":3,"left":2,"middle":1}\nThe image is simple.', 'verified'],
    ['English fallback text', 'There are three black dots: two on the left and one in the center.', 'verified'],
    ['Chinese fallback text', '图中有三个黑点，左边两个，中间一个。', 'verified'],
    ['Wrong total', '{"black_dots":2,"left_side_dots":2,"center_dot":1}', 'wrong-answer'],
    ['Wrong left count', '{"black_dots":3,"left_side_dots":1,"center_dot":1}', 'wrong-answer'],
    ['Only one property', 'three black dots', 'wrong-answer'],
    ['Empty answer', '', 'response-parse-error']
  ])('parses %s image answers', (_name, answer, status) => {
    expect(parseVisionTestAnswer(answer).status).toBe(status)
  })
})
