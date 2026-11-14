import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = [
  'src/main/ai/provider-presets.ts',
  'src/renderer/src/features/settings/ai/AIConnectionCard.tsx',
  'src/renderer/src/features/settings/ai/AIConnectionEditor.tsx',
  'src/renderer/src/features/settings/ai/AIConnectionsPanel.tsx',
  'src/renderer/src/features/settings/ai/AIConnectionTestResult.tsx',
  'src/renderer/src/features/settings/ai/DeleteConnectionDialog.tsx',
  'src/renderer/src/features/settings/ai/ai-connection-ui.ts'
]

const mojibakePatterns = [
  '\uFFFD',
  '\u951F',
  '\u95BF',
  '\u5A34',
  '\u9420',
  '\u7F01',
  '\u95C2',
  '\u8103',
  '\u8117',
  '\u8292\u20AC',
  '\u8302\u9A74\u9646',
  '\u6D63\u8DE8',
  '\u59AF\u2033',
  '\u6769\u70B4'
]

const requiredSafetyText = [
  '\u7B2C\u4E09\u65B9',
  'API Key',
  '\u83B7\u53D6\u6A21\u578B\u5217\u8868',
  '\u6D4B\u8BD5\u56FE\u7247\u80FD\u529B',
  '\u5F53\u524D\u4F7F\u7528',
  '\u6D4B\u8BD5\u5931\u8D25',
  '\u63A5\u53E3\u5730\u5740',
  '\u91CD\u65B0\u8F93\u5165'
]

describe('AI settings source encoding', () => {
  it('keeps AI security copy readable UTF-8 without known mojibake markers', () => {
    const combined = files.map((file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      for (const pattern of mojibakePatterns) expect(source, file).not.toContain(pattern)
      return source
    }).join('\n')

    for (const text of requiredSafetyText) expect(combined).toContain(text)
  })
})
