/** Lists cloud and local AI connections while delegating editing, testing, and deletion to focused components. */
import { Plus, RefreshCcw, ShieldCheck, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AIConnectionPublic, AIConnectionTestPublic, AIProviderPresetPublic, AISettingsPublic, LocalToolDetectionPublic } from '@shared/domain/models'
import type { SaveAIConnectionInput, TestAIConnectionInput } from '@shared/contracts/ipc'
import { useI18n } from '../../../i18n/I18nProvider'
import { AIConnectionCard } from './AIConnectionCard'
import { AIConnectionEditor } from './AIConnectionEditor'
import { DeleteConnectionDialog } from './DeleteConnectionDialog'
import { capabilityText, isLocalTransport, localDetectionMessage, splitConnections, type EditorMode } from './ai-connection-ui'

interface Props {
  settings: AISettingsPublic
  presets: AIProviderPresetPublic[]
  onSettingsChanged(settings: AISettingsPublic): void
  onError(error: unknown): void
}

type EditorState =
  | { mode: 'create'; draft?: Partial<AIConnectionPublic> }
  | { mode: 'edit'; connection: AIConnectionPublic }

export function AIConnectionsPanel({ settings, presets, onSettingsChanged, onError }: Props): React.JSX.Element {
  const { language } = useI18n()
  const text = language === 'en-US'
    ? {
        title: 'Connection overview', body: 'Each saved connection keeps its configuration time and latest test result.',
        add: 'Add connection', localTitle: 'Local tool detection', detect: 'Re-detect', addTool: 'Add',
        unavailable: 'Unavailable',
        security: 'Knowex runs local tools in isolated temporary folders. CLI sign-in stays managed by the CLI; Knowex does not read or save CLI tokens.',
        emptyTitle: 'No AI connection configured',
        emptyBody: 'Add your first cloud API or local CLI connection. API keys are encrypted locally and never shown again.',
        currentTitle: 'Current connection',
        noCurrentTitle: 'No active AI connection',
        noCurrentBody: 'Add a cloud API or local tool connection before using AI Q&A.',
        cloudGroup: 'Cloud API',
        localGroup: 'Local tools',
        noCloud: 'No cloud API connections yet.',
        noLocal: 'No local tool connections yet.',
        onlyText: 'text only'
      }
    : {
        title: '连接总览', body: '每条已保存连接都会保留配置时间和最近一次测试结果。',
        add: '添加连接', localTitle: '本机工具检测', detect: '重新检测', addTool: '添加',
        unavailable: '不可用',
        security: 'Knowex 在隔离临时目录中运行本机工具。CLI 登录状态由 CLI 自身管理；Knowex 不读取或保存 CLI Token。',
        emptyTitle: '当前尚未配置 AI 连接',
        emptyBody: '添加第一个云端 API 或本机 CLI 连接。API Key 会在本机加密保存，之后不会回显。',
        currentTitle: '当前使用',
        noCurrentTitle: '当前没有可用的 AI 连接',
        noCurrentBody: '添加一个云端 API 或本机工具后才能使用 AI 问答。',
        cloudGroup: '云端 API',
        localGroup: '本机工具',
        noCloud: '尚未添加云端 API 连接。',
        noLocal: '尚未添加本机工具连接。',
        onlyText: '仅文本'
      }

  const [editing, setEditing] = useState<EditorState>()
  const [deleting, setDeleting] = useState<AIConnectionPublic>()
  const [busy, setBusy] = useState(false)
  const [testResult, setTestResult] = useState<AIConnectionTestPublic>()
  const [localDetections, setLocalDetections] = useState<LocalToolDetectionPublic[]>([])
  const grouped = splitConnections(settings.connections)
  const activeConnection = settings.connections.find((connection) => connection.active)

  useEffect(() => {
    void detectLocalTools()
  }, [])

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try { await operation() }
    catch (error) { onError(error) }
    finally { setBusy(false) }
  }

  const testConnection = async (input: TestAIConnectionInput): Promise<AIConnectionTestPublic | undefined> => {
    setBusy(true)
    try {
      const result = await window.knowex.ai.testConnection(input)
      setTestResult(result)
      const refreshed = await window.knowex.ai.getSettings()
      onSettingsChanged(refreshed)
      return result
    } catch (error) {
      onError(error)
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const detectLocalTools = async (): Promise<void> => {
    setBusy(true)
    try { setLocalDetections(await window.knowex.ai.detectLocalTools()) }
    catch (error) { onError(error) }
    finally { setBusy(false) }
  }

  const addLocal = (preset: AIProviderPresetPublic, detection?: LocalToolDetectionPublic): void => {
    setEditing({
      mode: 'create',
      draft: {
        name: preset.defaultName,
        provider: preset.provider,
        transport: preset.defaultTransport,
        executablePath: detection?.executablePath,
        model: '',
        configured: Boolean(detection?.executablePath),
        active: false,
        capabilities: { ...preset.defaultCapabilities },
        localToolVersion: detection?.version,
        localToolStatus: detection?.status
      }
    })
    setTestResult(undefined)
  }

  if (editing) {
    const mode: EditorMode = editing.mode
    return (
      <AIConnectionEditor
        mode={mode}
        connection={editing.mode === 'edit' ? editing.connection : undefined}
        draft={editing.mode === 'create' ? editing.draft : undefined}
        presets={presets}
        busy={busy}
        testResult={testResult}
        onCancel={() => { setEditing(undefined); setTestResult(undefined) }}
        onTest={(input) => void testConnection(input)}
        onSave={(input: SaveAIConnectionInput) => void run(async () => {
          onSettingsChanged(await window.knowex.ai.saveConnection(input))
          setEditing(undefined)
          setTestResult(undefined)
        })}
      />
    )
  }

  return (
    <section className="ai-connections-panel">
      <div className="ai-panel-header">
        <div>
          <h3>{text.title}</h3>
          <p>{text.body}</p>
        </div>
        <button type="button" className="button primary" disabled={busy || presets.length === 0} onClick={() => { setEditing({ mode: 'create' }); setTestResult(undefined) }}><Plus size={15} />{text.add}</button>
      </div>

      <CurrentConnectionSummary connection={activeConnection} providerLabel={activeConnection ? providerLabel(activeConnection.provider, presets, language) : undefined} language={language} text={text} />

      {settings.connections.length === 0 && (
        <div className="ai-empty-state">
          <ShieldCheck size={28} />
          <strong>{text.emptyTitle}</strong>
          <p>{text.emptyBody}</p>
        </div>
      )}

      <ConnectionGroup title={text.cloudGroup} empty={text.noCloud}>
        {grouped.cloud.map((connection) => renderCard(connection))}
      </ConnectionGroup>

      <ConnectionGroup title={text.localGroup} empty={text.noLocal}>
        {grouped.local.map((connection) => renderCard(connection))}
      </ConnectionGroup>

      <div className="ai-local-tools">
        <div className="ai-local-tools-heading">
          <strong><Terminal size={14} />{text.localTitle}</strong>
          <button type="button" className="button" disabled={busy} onClick={() => void detectLocalTools()}><RefreshCcw size={14} />{text.detect}</button>
        </div>
        <p>{text.security}</p>
        <div className="ai-local-tool-list">
          {presets.filter((preset) => preset.localTool).map((preset) => {
            const detection = localDetections.find((item) => item.tool === preset.localTool)
            return (
              <div className="ai-local-tool-row" key={preset.provider}>
                <span>{language === 'en-US' ? preset.label.enUS : preset.label.zhCN}</span>
                <small>{localDetectionMessage(detection, text.unavailable, language)}</small>
                <button type="button" className="button" disabled={busy || !detection?.executablePath || isBlockedLocalDetection(detection.status)} onClick={() => addLocal(preset, detection)}>{text.addTool}</button>
              </div>
            )
          })}
        </div>
      </div>

      <DeleteConnectionDialog
        connection={deleting}
        totalConnections={settings.connections.length}
        busy={busy}
        onCancel={() => setDeleting(undefined)}
        onConfirm={(connectionId) => void run(async () => {
          onSettingsChanged(await window.knowex.ai.deleteConnection(connectionId))
          setDeleting(undefined)
        })}
      />
    </section>
  )

  function renderCard(connection: AIConnectionPublic): React.JSX.Element {
    return (
      <AIConnectionCard
        key={connection.id}
        connection={connection}
        providerLabel={providerLabel(connection.provider, presets, language)}
        busy={busy}
        onEdit={(next) => { setEditing({ mode: 'edit', connection: next }); setTestResult(undefined) }}
        onDelete={setDeleting}
        onSetActive={(connectionId) => void run(async () => onSettingsChanged(await window.knowex.ai.setActiveConnection(connectionId)))}
        onTest={(next) => void testConnection(connectionToTestInput(next))}
      />
    )
  }
}

function CurrentConnectionSummary({ connection, providerLabel, language, text }: { connection?: AIConnectionPublic; providerLabel?: string; language: 'zh-CN' | 'en-US'; text: Record<string, string> }): React.JSX.Element {
  if (!connection) {
    return (
      <div className="ai-current-summary empty">
        <span>{text.currentTitle}</span>
        <strong>{text.noCurrentTitle}</strong>
        <p>{text.noCurrentBody}</p>
      </div>
    )
  }
  const isLocal = isLocalTransport(connection.transport)
  const connectionKind = isLocal ? text.localGroup : text.cloudGroup
  const modelOrVersion = connection.model || connection.localToolVersion
  return (
    <div className="ai-current-summary">
      <span>{text.currentTitle}</span>
      <strong>{connection.name}</strong>
      <p>
        {providerLabel ?? connection.provider}
        {modelOrVersion ? ` · ${modelOrVersion}` : ''}
        {' · '}{connectionKind}
        {' · '}{capabilityText(connection.capabilities, language)}
      </p>
    </div>
  )
}

function ConnectionGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }): React.JSX.Element {
  const items = Array.isArray(children) ? children.filter(Boolean) : children
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items
  return (
    <div className="ai-connection-group">
      <h4>{title}</h4>
      {isEmpty ? <p className="ai-group-empty">{empty}</p> : <div className="ai-connection-list">{items}</div>}
    </div>
  )
}

function isBlockedLocalDetection(status: string | undefined): boolean {
  return status === 'invalid-path'
    || status === 'desktop-app-detected-cli-not-available'
    || status === 'npm-shim-detected'
    || status === 'executable-found-validation-failed'
    || status === 'version-unsupported'
}

function providerLabel(provider: string, presets: AIProviderPresetPublic[], language: string): string {
  const preset = presets.find((item) => item.provider === provider)
  if (!preset) return provider
  return language === 'en-US' ? preset.label.enUS : preset.label.zhCN
}

function connectionToTestInput(connection: AIConnectionPublic): TestAIConnectionInput {
  if (connection.transport === 'codex-cli' || connection.transport === 'claude-code-cli') {
    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      transport: connection.transport,
      executablePath: connection.executablePath ?? '',
      model: connection.model,
      capabilities: connection.capabilities
    } as TestAIConnectionInput
  }
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    transport: connection.transport,
    baseUrl: connection.baseUrl,
    endpointMode: connection.endpointMode,
    model: connection.model,
    capabilities: connection.capabilities
  } as TestAIConnectionInput
}
