import type { AIRequest } from './ai-types'

export function serializeCliPrompt(request: AIRequest): string {
  const history = request.messages.slice(0, -1)
  const current = request.messages.at(-1)?.content ?? request.evidenceText
  const sections = [
    section('SYSTEM INSTRUCTION', request.systemPrompt),
    section('ANNOTATION EVIDENCE', request.evidenceText),
    section('CHAT HISTORY', history.length ? history.map((message, index) => `${index + 1}. ${message.role.toUpperCase()}\n${message.content}`).join('\n\n') : '(none)'),
    section('CURRENT USER QUESTION', current),
    section('OUTPUT REQUIREMENTS', [
      'Return only the answer text for the user.',
      'Do not modify files.',
      'Do not execute code or commands.',
      'Do not read unrelated directories.',
      'Do not include internal runtime details.',
      'Do not output ANSI control characters.'
    ].join('\n'))
  ]
  return sections.join('\n\n')
}

function section(title: string, body: string): string {
  return `<<<KNOWEX_${title.replace(/\s+/g, '_')}>>>\n${body}\n<<<END_KNOWEX_${title.replace(/\s+/g, '_')}>>>`
}
