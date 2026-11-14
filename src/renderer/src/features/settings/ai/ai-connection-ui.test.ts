/** Verifies renderer-only connection grouping and user-facing status copy without invoking providers. */
import { describe, expect, it } from 'vitest'
import type { AIConnectionPublic, AIConnectionTestPublic } from '@shared/domain/models'
import { capabilityText, deleteConnectionCopy, editorTitle, errorAdvice, isLocalTransport, lastTextTestLabel, localDetectionMessage, safeProviderMessage, splitConnections, testSaveReminder } from './ai-connection-ui'

const auditTime = '2026-07-29T08:30:00.000Z'

const cloudConnection: AIConnectionPublic = {
  id: 'cloud-1',
  name: 'OpenAI',
  provider: 'openai',
  transport: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1/responses',
  model: 'gpt-test',
  configured: true,
  active: true,
  capabilities: { text: true, vision: true, streaming: false },
  createdAt: auditTime,
  updatedAt: auditTime
}

const localConnection: AIConnectionPublic = {
  id: 'local-1',
  name: 'Claude Code CLI',
  provider: 'claude-code',
  transport: 'claude-code-cli',
  executablePath: 'C:\\Tools\\claude.exe',
  localToolVersion: '2.1.163',
  configured: true,
  active: false,
  capabilities: { text: true, vision: false, streaming: false },
  createdAt: auditTime,
  updatedAt: auditTime
}

const testResult: AIConnectionTestPublic = {
  success: true,
  provider: 'openai',
  transport: 'openai-responses',
  model: 'gpt-test',
  message: 'Connection test succeeded.',
  latencyMs: 24,
  checkedAt: '2026-07-29T08:35:00.000Z'
}

describe('AI connection UI helpers', () => {
  it('distinguishes create and edit titles for local CLI connections', () => {
    expect(editorTitle('create', 'Codex CLI', 'en-US')).toBe('Add Codex CLI connection')
    expect(editorTitle('edit', 'Codex CLI', 'en-US')).toBe('Edit AI connection')
  })

  it('keeps cloud and local connections in separate groups', () => {
    const grouped = splitConnections([cloudConnection, localConnection])
    expect(grouped.cloud).toEqual([cloudConnection])
    expect(grouped.local).toEqual([localConnection])
    expect(isLocalTransport(localConnection.transport)).toBe(true)
  })

  it('explains that successful tests do not save create or edit forms', () => {
    expect(testSaveReminder('create', 'en-US')).toContain('does not save this connection')
    expect(testSaveReminder('edit', 'en-US')).toContain('does not save your changes')
  })

  it('adds actionable advice for common errors', () => {
    expect(errorAdvice('AUTHENTICATION_FAILED', '', 'en-US')?.body).toContain('API key')
    expect(errorAdvice('UNSUPPORTED_CAPABILITY', '', 'en-US')?.body).toContain('supports screenshots')
    expect(errorAdvice('LOCAL_TOOL_INVALID_PATH', '', 'en-US')?.body).toContain('.exe')
    expect(errorAdvice('LOCAL_TOOL_NOT_AUTHENTICATED', '', 'en-US')?.body).toContain('terminal')
    expect(errorAdvice('MISSING_MODEL', '', 'en-US')?.body).toContain('Detect available models')
    expect(errorAdvice(undefined, "invalid params, unknown model 'minimax' (2013)", 'en-US')?.body).toContain('Detect available models')
    expect(errorAdvice('AUTHENTICATION_FAILED', 'MiniMax permission failed', 'en-US')?.body).toContain('service region')
    expect(errorAdvice('MODEL_NOT_FOUND', "MiniMax unknown model 'minimax'", 'en-US')?.body).toContain('provider name')
    expect(errorAdvice('MODEL_LIST_UNAVAILABLE', 'MiniMax endpoint is not reachable', 'en-US')?.body).toContain('/v1')
  })

  it('does not repeat obvious sensitive values from provider messages', () => {
    const message = safeProviderMessage('Authorization: Bearer test-key-not-real')
    expect(message).not.toContain('test-key-not-real')
    expect(message).toContain('Authorization header hidden')
  })

  it('uses separate delete copy for cloud, CLI, active, and last connections', () => {
    expect(deleteConnectionCopy(cloudConnection, 2, 'en-US').paragraphs.join(' ')).toContain('encrypted API key')
    expect(deleteConnectionCopy(localConnection, 2, 'en-US').paragraphs.join(' ')).not.toContain('API key')
    expect(deleteConnectionCopy(cloudConnection, 2, 'en-US').paragraphs.join(' ')).toContain('current connection')
    expect(deleteConnectionCopy(cloudConnection, 1, 'en-US').paragraphs.join(' ')).toContain('last AI connection')
  })

  it('labels image capability as declared support and last tests as text tests', () => {
    expect(capabilityText(cloudConnection.capabilities, 'en-US')).toContain('image input')
    expect(capabilityText(localConnection.capabilities, 'en-US')).toBe('Text only')
    expect(lastTextTestLabel(testResult, 'en-US')).toContain('Last text test')
  })

  it('explains invalid Windows launcher detections without enabling unsafe shims', () => {
    const message = localDetectionMessage({
      tool: 'claude-code',
      installed: false,
      executablePath: 'C:\\Users\\User\\AppData\\Local\\Microsoft\\WindowsApps\\claude.cmd',
      status: 'invalid-path',
      message: 'Claude Code CLI path is not valid.',
      checkedAt: '2026-07-29T08:35:00.000Z'
    }, 'Unavailable', 'en-US')
    expect(message).toContain('.exe')
    expect(message).toContain('launcher script')
  })

  it('explains Codex desktop app detections as not being Codex CLI', () => {
    const message = localDetectionMessage({
      tool: 'codex',
      installed: false,
      executablePath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe',
      status: 'desktop-app-detected-cli-not-available',
      message: 'Codex desktop app was detected.',
      checkedAt: '2026-07-29T08:35:00.000Z'
    }, 'Unavailable', 'en-US')
    expect(message).toContain('Codex desktop app')
    expect(message).toContain('Codex CLI')
    expect(message).toContain('separate clients')
  })
})
