import type { AIConnectionTestPublic } from '@shared/domain/models'
import { useI18n } from '../../../i18n/I18nProvider'
import type { EditorMode } from './ai-connection-ui'
import { errorAdvice, formatCheckedAt, safeProviderMessage, testResultTitle, testSaveReminder, testScopeNote } from './ai-connection-ui'

export function AIConnectionTestResult({ result, mode }: { result?: AIConnectionTestPublic; mode?: EditorMode }): React.JSX.Element | null {
  const { language } = useI18n()
  if (!result) return null
  const advice = errorAdvice(result.errorCode, result.message, language)
  const copyDiagnostics = (): void => {
    void navigator.clipboard?.writeText(JSON.stringify({
      success: result.success,
      errorCode: result.errorCode,
      provider: result.provider,
      transport: result.transport,
      model: result.model,
      endpointOrigin: result.endpointOrigin,
      latencyMs: result.latencyMs,
      checkedAt: result.checkedAt,
      message: safeProviderMessage(result.message)
    }, null, 2))
  }

  return (
    <div className={`ai-test-result ${result.success ? 'success' : 'failed'}`}>
      <strong>{testResultTitle(result, language)}</strong>
      <span>{safeProviderMessage(result.message)}</span>
      {advice && (
        <span className="ai-test-advice">
          <b>{advice.title}</b>
          {advice.body}
        </span>
      )}
      <small>
        {language === 'en-US' ? 'Checked' : '检查时间'}: {formatCheckedAt(result.checkedAt, language)}
        {result.model ? ` · ${language === 'en-US' ? 'Model' : '模型'}: ${result.model}` : ''}
        {result.endpointOrigin ? ` · Endpoint: ${result.endpointOrigin}` : ''}
        {typeof result.latencyMs === 'number' ? ` · ${result.latencyMs} ms` : ''}
      </small>
      <small>{testScopeNote(language)}</small>
      <button type="button" className="button ai-inline-action" onClick={copyDiagnostics}>
        {language === 'en-US' ? 'Copy sanitized diagnostics' : '复制脱敏诊断'}
      </button>
      {result.success && mode && <small>{testSaveReminder(mode, language)}</small>}
    </div>
  )
}
