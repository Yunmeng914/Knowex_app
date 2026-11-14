/** Compact connection summary; exposes configuration and audit metadata but never credential values. */
import { CheckCircle2, Clock3, Edit3, Image, KeyRound, PlayCircle, Star, Terminal, Trash2, Type } from 'lucide-react'
import type { AIConnectionPublic } from '@shared/domain/models'
import { useI18n } from '../../../i18n/I18nProvider'
import { capabilityText, isLocalTransport, lastTextTestLabel, localStatusText } from './ai-connection-ui'

interface Props {
  connection: AIConnectionPublic
  providerLabel: string
  busy: boolean
  onEdit(connection: AIConnectionPublic): void
  onDelete(connection: AIConnectionPublic): void
  onSetActive(connectionId: string): void
  onTest(connection: AIConnectionPublic): void
}

export function AIConnectionCard({ connection, providerLabel, busy, onEdit, onDelete, onSetActive, onTest }: Props): React.JSX.Element {
  const { language } = useI18n()
  const text = language === 'en-US'
    ? { current: 'Current', noModel: 'No model', keyReady: 'API key configured', keyMissing: 'API key missing', localReady: 'Local tool configured', localMissing: 'Executable missing', cloud: 'Cloud API', local: 'Local tool', text: 'Text requests', setCurrent: 'Set current', test: 'Test', edit: 'Edit', delete: 'Delete' }
    : { current: '当前使用', noModel: '未填写模型', keyReady: 'API Key 已配置', keyMissing: '缺少 API Key', localReady: '本机工具已配置', localMissing: '缺少可执行文件', cloud: '云端 API', local: '本机工具', text: '文本请求', setCurrent: '设为当前', test: '测试', edit: '编辑', delete: '删除' }
  const isLocal = isLocalTransport(connection.transport)
  const lastTest = lastTextTestLabel(connection.lastTest, language)
  return (
    <article className={`ai-connection-card ${connection.active ? 'active' : ''}`}>
      <div className="ai-card-main">
        <div>
          <h4 title={connection.name}>{connection.name}</h4>
          <p title={connection.model || connection.localToolVersion || undefined}>{providerLabel} · {connection.model || connection.localToolVersion || text.noModel}</p>
        </div>
        {connection.active && <span className="ai-status-badge"><Star size={13} /> {text.current}</span>}
      </div>
      <div className="ai-card-meta">
        <span>{isLocal ? <Terminal size={13} /> : <KeyRound size={13} />} {connection.configured ? (isLocal ? text.localReady : text.keyReady) : (isLocal ? text.localMissing : text.keyMissing)}</span>
        <span><Terminal size={13} /> {isLocal ? text.local : text.cloud}</span>
        {isLocal && connection.localToolStatus && <span><CheckCircle2 size={13} /> {localStatusText(connection.localToolStatus, language)}</span>}
        <span><Type size={13} /> {text.text}</span>
        <span><Image size={13} /> {capabilityText(connection.capabilities, language)}</span>
        <span><Type size={13} /> {verificationLabel('text', connection.verification?.text.status, language)}</span>
        <span><Image size={13} /> {verificationLabel('image', connection.verification?.image.status, language)}</span>
        {lastTest && <span><CheckCircle2 size={13} /> {lastTest}</span>}
      </div>
      <p className="ai-card-audit"><Clock3 size={11} /> {formatUpdatedAt(connection.updatedAt, language)}</p>
      <div className="ai-card-actions">
        {!connection.active && <button type="button" className="button" disabled={busy} onClick={() => onSetActive(connection.id)}><Star size={14} />{text.setCurrent}</button>}
        <button type="button" className="button" disabled={busy} onClick={() => onTest(connection)}><PlayCircle size={14} />{text.test}</button>
        <button type="button" className="button" disabled={busy} onClick={() => onEdit(connection)}><Edit3 size={14} />{text.edit}</button>
        <button type="button" className="button danger-subtle" disabled={busy} onClick={() => onDelete(connection)}><Trash2 size={14} />{text.delete}</button>
      </div>
    </article>
  )
}

function formatUpdatedAt(value: string, language: 'zh-CN' | 'en-US'): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const label = language === 'en-US' ? 'Configuration updated' : '配置更新'
  return `${label} · ${new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`
}

function verificationLabel(kind: 'text' | 'image', status: string | undefined, language: 'zh-CN' | 'en-US'): string {
  const normalized = status ?? 'not-tested'
  const en: Record<string, string> = {
    verified: kind === 'text' ? 'Text verified' : 'Image verified',
    unsupported: 'Image unsupported',
    failed: kind === 'text' ? 'Text test failed' : 'Image test failed',
    'wrong-answer': 'Image wrong answer',
    'response-parse-error': 'Image parse error',
    timeout: 'Image timeout',
    'not-tested': kind === 'text' ? 'Text not tested' : 'Image not tested'
  }
  const zh: Record<string, string> = {
    verified: kind === 'text' ? '文本已验证' : '图片已验证',
    unsupported: '图片不支持',
    failed: kind === 'text' ? '文本测试失败' : '图片测试失败',
    'wrong-answer': '图片答案不匹配',
    'response-parse-error': '图片解析失败',
    timeout: '图片测试超时',
    'not-tested': kind === 'text' ? '文本尚未测试' : '图片尚未测试'
  }
  return (language === 'en-US' ? en : zh)[normalized] ?? normalized
}
