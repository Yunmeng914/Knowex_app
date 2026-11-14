import { useEffect, useMemo, useState } from 'react'
import type { AIConnectionPublic, AIConnectionTestPublic, AIModelDiscovery, AIModelPublic, AIProviderPresetPublic, AICapabilities, AIEndpointMode, AIProvider, AITransport, CapabilityVerificationPublic, ModelDiscoveryResult } from '@shared/domain/models'
import type { DiscoverAIModelsInput, SaveAIConnectionInput, TestAIConnectionInput } from '@shared/contracts/ipc'
import { useI18n } from '../../../i18n/I18nProvider'
import { AIConnectionTestResult } from './AIConnectionTestResult'
import type { EditorMode } from './ai-connection-ui'
import { capabilityText, editorTitle, errorAdvice, formatCheckedAt, safeProviderMessage, testScopeNote } from './ai-connection-ui'

interface Props {
  mode: EditorMode
  connection?: AIConnectionPublic
  draft?: Partial<AIConnectionPublic>
  presets: AIProviderPresetPublic[]
  busy: boolean
  testResult?: AIConnectionTestPublic
  onCancel(): void
  onSave(input: SaveAIConnectionInput): void
  onTest(input: TestAIConnectionInput): void
}

const emptyVerification: CapabilityVerificationPublic = {
  text: { status: 'not-tested' },
  image: { status: 'not-tested' }
}

const MINIMAX_REGION_URLS = {
  mainland: 'https://api.minimaxi.com/v1',
  international: 'https://api.minimax.io/v1'
} as const

const KIMI_REGION_URLS = {
  mainland: 'https://api.moonshot.cn/v1',
  international: 'https://api.moonshot.ai/v1'
} as const

type MiniMaxRegion = keyof typeof MINIMAX_REGION_URLS
type KimiRegion = keyof typeof KIMI_REGION_URLS

export function AIConnectionEditor({ mode, connection, draft, presets, busy, testResult, onCancel, onSave, onTest }: Props): React.JSX.Element {
  const { language } = useI18n()
  const text = language === 'en-US'
    ? {
        provider: 'Provider', name: 'Connection name', protocol: 'API protocol', baseUrl: 'Base URL', model: 'Model', optionalModel: 'Model (optional)',
        endpointMode: 'Address mode', baseUrlMode: 'Base URL', fullEndpointMode: 'Full endpoint',
        endpointModeHelp: 'Base URL mode lets Knowex append the standard protocol path. Full endpoint mode sends requests exactly to the endpoint you entered.',
        restoreBaseUrl: 'Restore recommended address',
        modelDiscovery: 'Model discovery', openaiModels: 'OpenAI-Compatible Models', anthropicModels: 'Anthropic Models',
        customModelsEndpoint: 'Custom model list URL', modelsUnsupported: 'Unsupported, enter manually',
        modelListEndpoint: 'Model List Endpoint', modelListUnsupportedHelp: 'This connection does not expose a model list. Enter the model ID manually.',
        clearKey: 'Clear saved key',
        clearKeyConfirm: 'Clear the saved API key for this connection? This cannot be undone.',
        key: 'API Key', keep: '(leave blank to keep current key)', keepPlaceholder: 'Leave blank to keep current key',
        enterKey: 'Enter API key', executablePath: 'Executable path',
        cliNoImage: 'Current local CLI connections support text only.',
        cliPathHelp: 'Choose a directly executable .exe file. For security, Knowex does not run .cmd, .bat, or .ps1 launcher scripts. Enter only a file path, without command arguments.',
        textCapability: 'Text requests enabled',
        imageDeclaration: 'Declare that this endpoint supports screenshots and image input',
        capabilityHelp: 'This only declares endpoint capability. The connection test checks text connectivity only and does not verify images.',
        discoverModels: 'Detect available models',
        detectHint: 'Detection may make a small provider API request. It will not save this connection.',
        modelNotDetected: 'No detected models yet.',
        recommended: 'recommended',
        textVerified: 'text verified',
        verifyImage: 'Test image capability',
        serviceRegion: 'Service region',
        minimaxMainland: 'Mainland China',
        minimaxInternational: 'International',
        minimaxKeyHelp: 'MiniMax pay-as-you-go API keys and Token Plan keys use different quota systems. Make sure the key, purchase platform, and selected service region match.',
        minimaxLegacyUrl: 'This connection uses an old MiniMax chat endpoint. Prefer the API root URL and choose a service region before saving.',
        verificationTitle: 'Capability verification',
        textStatus: 'Text',
        imageStatus: 'Image',
        cancel: 'Cancel', test: 'Test connection', save: 'Save connection'
      }
    : {
        provider: '厂商', name: '连接名称', protocol: '接口协议', baseUrl: 'Base URL', model: '模型', optionalModel: '模型（可选）',
        endpointMode: '地址模式', baseUrlMode: 'Base URL', fullEndpointMode: '完整 Endpoint',
        endpointModeHelp: 'Base URL 模式由 Knowex 追加标准协议路径；完整 Endpoint 模式会直接请求你填写的地址，不再追加路径。',
        restoreBaseUrl: '恢复推荐地址',
        modelDiscovery: '模型发现', openaiModels: 'OpenAI-Compatible Models', anthropicModels: 'Anthropic Models',
        customModelsEndpoint: '自定义模型列表地址', modelsUnsupported: '不支持，手动输入',
        modelListEndpoint: '模型列表 Endpoint', modelListUnsupportedHelp: '该连接不提供模型列表，请手动输入模型 ID。',
        clearKey: '清除已保存密钥',
        clearKeyConfirm: '确定清除这个连接已保存的 API Key？该操作无法撤销。',
        key: 'API Key', keep: '（留空则保留当前密钥）', keepPlaceholder: '留空则保留当前密钥',
        enterKey: '输入 API Key', executablePath: '可执行文件路径',
        cliNoImage: '当前本机 CLI 连接仅支持文本。',
        cliPathHelp: '请选择可直接执行的 .exe 文件。出于安全原因，Knowex 不运行 .cmd、.bat 或 .ps1 启动脚本。这里只能填写文件路径，不要附加命令参数。',
        textCapability: '已启用文本请求',
        imageDeclaration: '声明该接口支持截图和图片输入',
        capabilityHelp: '该选项只声明接口能力。“测试连接”只验证文本连通性，不代表图片能力已经通过测试。',
        discoverModels: '检测可用模型',
        detectHint: '检测可能产生极少量服务商 API 请求，不会自动保存该连接。',
        modelNotDetected: '尚未检测模型。',
        recommended: '推荐',
        textVerified: '文本已验证',
        verifyImage: '测试图片能力',
        serviceRegion: '服务区域',
        minimaxMainland: '中国大陆',
        minimaxInternational: '国际',
        minimaxKeyHelp: 'MiniMax 的按量付费 API Key 与 Token Plan Key 属于不同额度体系。请确保 Key、购买平台和所选服务区域一致。',
        minimaxLegacyUrl: '该连接使用旧的 MiniMax 聊天 endpoint。建议选择服务区域并保存 API 根地址。',
        verificationTitle: '能力验证',
        textStatus: '文本',
        imageStatus: '图片',
        cancel: '取消', test: '测试连接', save: '保存连接'
      }

  const firstPreset = presets[0] as AIProviderPresetPublic
  const source = connection ?? draft
  const initialPreset = presets.find((preset) => preset.provider === source?.provider) ?? firstPreset
  const [provider, setProvider] = useState<AIProvider>(initialPreset.provider)
  const [name, setName] = useState(source?.name ?? initialPreset.defaultName)
  const [transport, setTransport] = useState<AITransport>(source?.transport ?? initialPreset.defaultTransport)
  const [baseUrl, setBaseUrl] = useState(source?.baseUrl ?? initialPreset.defaultBaseUrl ?? '')
  const [baseUrlDirty, setBaseUrlDirty] = useState(Boolean(source?.baseUrl && source.baseUrl !== initialPreset.defaultBaseUrl))
  const [endpointMode, setEndpointMode] = useState<AIEndpointMode>(source?.endpointMode ?? 'base-url')
  const [minimaxRegion, setMinimaxRegion] = useState<MiniMaxRegion>(inferMiniMaxRegion(source?.baseUrl ?? initialPreset.defaultBaseUrl ?? ''))
  const [kimiRegion, setKimiRegion] = useState<KimiRegion>(inferKimiRegion(source?.baseUrl ?? initialPreset.defaultBaseUrl ?? ''))
  const [modelDiscovery, setModelDiscovery] = useState<AIModelDiscovery>(source?.modelDiscovery ?? initialPreset.modelDiscovery ?? 'unsupported')
  const [modelListEndpoint, setModelListEndpoint] = useState(source?.modelListEndpoint ?? '')
  const [executablePath, setExecutablePath] = useState(source?.executablePath ?? '')
  const [model, setModel] = useState(source?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [capabilities, setCapabilities] = useState<AICapabilities>(source?.capabilities ?? initialPreset.defaultCapabilities)
  const [verification, setVerification] = useState<CapabilityVerificationPublic>(source?.verification ?? emptyVerification)
  const [models, setModels] = useState<AIModelPublic[]>([])
  const [discovery, setDiscovery] = useState<ModelDiscoveryResult>()
  const [discovering, setDiscovering] = useState(false)
  const [verifyingImage, setVerifyingImage] = useState(false)

  const preset = useMemo(() => presets.find((item) => item.provider === provider) ?? firstPreset, [firstPreset, presets, provider])
  const isCustom = preset.custom
  const isLocal = Boolean(preset.localTool)
  const providerLabel = language === 'en-US' ? preset.label.enUS : preset.label.zhCN
  const freshKeyRequiredText = language === 'en-US'
    ? 'The API service address or protocol changed. Re-enter the API key to avoid sending an old key to the wrong service.'
    : '接口服务地址或协议已经改变。为防止密钥发送到错误服务，请重新输入 API Key。'
  const customRelayRiskText = language === 'en-US'
    ? 'Custom or relay endpoints receive the API key, annotation text, screenshots, current question, and chat history. Confirm this third-party address before saving.'
    : '自定义或中转站接口会收到 API Key、批注文本、截图、当前问题和历史。保存前请确认这个第三方地址可信。'
  const isMiniMax = provider === 'minimax'
  const isKimi = provider === 'kimi'
  const supportsModelSpecificImageTest = provider === 'minimax' || provider === 'glm'
  const canVerifyImage = Boolean(model.trim() && (capabilities.vision || supportsModelSpecificImageTest))
  const requiresFreshKey = !isLocal && mode === 'edit' && Boolean(connection?.configured) && !apiKey.trim() && credentialDestinationChanged(connection, {
    provider,
    transport,
    baseUrl,
    modelListEndpoint
  })
  const canDiscoverModels = !isLocal
    && modelDiscovery !== 'unsupported'
    && Boolean(name.trim() && baseUrl.trim())
    && (modelDiscovery !== 'custom-models-endpoint' || Boolean(modelListEndpoint.trim()))
    && !requiresFreshKey
  const canSubmit = Boolean(name.trim() && (isLocal ? executablePath.trim() : baseUrl.trim() && model.trim())) && !requiresFreshKey
  const cloudInput = (): DiscoverAIModelsInput => ({
    id: mode === 'edit' ? connection?.id : undefined,
    name: name.trim(),
    provider,
    transport,
    baseUrl: baseUrl.trim(),
    endpointMode,
    providerRegion: isMiniMax ? minimaxRegion : isKimi ? kimiRegion : undefined,
    modelDiscovery,
    modelListEndpoint: modelListEndpoint.trim() || undefined,
    model: model.trim() || undefined,
    apiKey: apiKey || undefined,
    capabilities,
    verification
  } as DiscoverAIModelsInput)

  useEffect(() => {
    if (mode === 'edit') return
    const draftMatchesProvider = draft?.provider === preset.provider
    setName(draftMatchesProvider ? draft?.name ?? preset.defaultName : preset.defaultName)
    setTransport(draftMatchesProvider ? draft?.transport ?? preset.defaultTransport : preset.defaultTransport)
    setBaseUrl(draftMatchesProvider ? draft?.baseUrl ?? preset.defaultBaseUrl ?? '' : preset.defaultBaseUrl ?? '')
    setBaseUrlDirty(Boolean(draftMatchesProvider && draft?.baseUrl && draft.baseUrl !== preset.defaultBaseUrl))
    setEndpointMode(draftMatchesProvider ? draft?.endpointMode ?? 'base-url' : 'base-url')
    setMinimaxRegion(inferMiniMaxRegion(draftMatchesProvider ? draft?.baseUrl ?? preset.defaultBaseUrl ?? '' : preset.defaultBaseUrl ?? ''))
    setKimiRegion(inferKimiRegion(draftMatchesProvider ? draft?.baseUrl ?? preset.defaultBaseUrl ?? '' : preset.defaultBaseUrl ?? ''))
    setModelDiscovery(draftMatchesProvider ? draft?.modelDiscovery ?? preset.modelDiscovery ?? 'unsupported' : preset.modelDiscovery ?? 'unsupported')
    setModelListEndpoint(draftMatchesProvider ? draft?.modelListEndpoint ?? '' : '')
    setExecutablePath(draftMatchesProvider ? draft?.executablePath ?? '' : '')
    setModel(draftMatchesProvider ? draft?.model ?? '' : '')
    setCapabilities(draftMatchesProvider ? draft?.capabilities ?? preset.defaultCapabilities : preset.defaultCapabilities)
    setVerification(draftMatchesProvider ? draft?.verification ?? emptyVerification : emptyVerification)
    setModels([])
    setDiscovery(undefined)
  }, [draft, mode, preset])

  const clearNetworkDerivedState = (): void => {
    setVerification(emptyVerification)
    setDiscovery(undefined)
    setModels([])
  }

  const changeMiniMaxRegion = (region: MiniMaxRegion): void => {
    setMinimaxRegion(region)
    if (!baseUrlDirty) setBaseUrl(MINIMAX_REGION_URLS[region])
    setEndpointMode('base-url')
    clearNetworkDerivedState()
  }

  const changeKimiRegion = (region: KimiRegion): void => {
    setKimiRegion(region)
    if (!baseUrlDirty) setBaseUrl(KIMI_REGION_URLS[region])
    setEndpointMode('base-url')
    clearNetworkDerivedState()
  }

  const restoreRecommendedBaseUrl = (): void => {
    const regionalUrl = isMiniMax ? MINIMAX_REGION_URLS[minimaxRegion] : isKimi ? KIMI_REGION_URLS[kimiRegion] : preset.defaultBaseUrl ?? ''
    setBaseUrl(regionalUrl)
    setBaseUrlDirty(false)
    setEndpointMode('base-url')
    clearNetworkDerivedState()
  }

  const input = (): SaveAIConnectionInput => {
    const common = {
      id: mode === 'edit' ? connection?.id : undefined,
      name: name.trim(),
      provider,
      transport,
      endpointMode,
      providerRegion: isMiniMax ? minimaxRegion : isKimi ? kimiRegion : undefined,
      modelDiscovery,
      modelListEndpoint: modelListEndpoint.trim() || undefined,
      model: model.trim() || undefined,
      capabilities,
      verification
    }
    if (isLocal) return { ...common, executablePath: executablePath.trim() } as SaveAIConnectionInput
    return { ...common, baseUrl: baseUrl.trim(), apiKey: apiKey || undefined } as SaveAIConnectionInput
  }

  const discoverModels = async (): Promise<void> => {
    setDiscovering(true)
    setDiscovery(undefined)
    try {
      const result = await window.knowex.ai.discoverModels(cloudInput())
      setDiscovery(result)
      setModels(result.models)
      if (result.recommendedModelId) {
        setModel(result.recommendedModelId)
        setCapabilities(capabilitiesForModel(capabilities, result.models.find((item) => item.id === result.recommendedModelId)))
      }
      if (result.verification) setVerification(result.verification)
    } catch (error) {
      setDiscovery({
        success: false,
        models: [],
        source: 'compatible-api',
        message: error instanceof Error ? error.message : 'Model discovery failed.'
      })
    } finally {
      setDiscovering(false)
    }
  }

  const verifyImage = async (): Promise<void> => {
    if (!model.trim()) return
    setVerifyingImage(true)
    try {
      const testCapabilities = supportsModelSpecificImageTest ? { ...capabilities, vision: true } : capabilities
      const result = await window.knowex.ai.verifyImageCapability({ ...cloudInput(), model: model.trim(), capabilities: testCapabilities } as Parameters<typeof window.knowex.ai.verifyImageCapability>[0])
      setVerification({
        text: verification.text,
        image: result.image
      })
      if (supportsModelSpecificImageTest) setCapabilities({ ...capabilities, vision: result.image.status === 'verified' })
    } catch (error) {
      setVerification({
        text: verification.text,
        image: {
          status: 'failed',
          checkedAt: new Date().toISOString(),
          model: model.trim(),
          message: error instanceof Error ? error.message : 'Image capability verification failed.'
        }
      })
    } finally {
      setVerifyingImage(false)
    }
  }

  const clearSavedKey = (): void => {
    if (!connection?.configured || isLocal) return
    if (!window.confirm(text.clearKeyConfirm)) return
    onSave({ ...input(), apiKey: undefined, clearApiKey: true } as SaveAIConnectionInput)
  }

  return (
    <div className="ai-editor">
      <div className="ai-editor-header">
        <h3>{editorTitle(mode, providerLabel, language)}</h3>
        <p>{language === 'en-US' ? preset.helpText.enUS : preset.helpText.zhCN}</p>
      </div>
      <label className="field"><span>{text.provider}</span>
        <select value={provider} disabled={mode === 'edit'} onChange={(event) => setProvider(event.target.value as AIProvider)}>
          {presets.map((item) => <option key={item.provider} value={item.provider}>{language === 'en-US' ? item.label.enUS : item.label.zhCN}</option>)}
        </select>
      </label>
      <label className="field"><span>{text.name}</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
      {isCustom && (
        <label className="field"><span>{text.protocol}</span>
          <select value={transport} onChange={(event) => { setTransport(event.target.value as AITransport); clearNetworkDerivedState() }}>
            <option value="openai-chat-completions">OpenAI Chat Completions</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic-messages">Anthropic Messages</option>
          </select>
        </label>
      )}
      {isLocal ? (
        <>
          <label className="field"><span>{text.executablePath}</span><input value={executablePath} maxLength={1024} onChange={(event) => setExecutablePath(event.target.value)} /></label>
          <p className="settings-help">{text.cliPathHelp}</p>
          <label className="field"><span>{text.optionalModel}</span><input value={model} placeholder={preset.modelPlaceholder} maxLength={160} onChange={(event) => setModel(event.target.value)} /></label>
          <p className="settings-help">{text.cliNoImage}</p>
        </>
      ) : (
        <>
          {isMiniMax && (
            <>
              <label className="field"><span>{text.serviceRegion}</span>
                <select value={minimaxRegion} onChange={(event) => changeMiniMaxRegion(event.target.value as MiniMaxRegion)}>
                  <option value="mainland">{text.minimaxMainland}</option>
                  <option value="international">{text.minimaxInternational}</option>
                </select>
              </label>
              <p className="settings-help">{text.minimaxKeyHelp}</p>
              {isLegacyMiniMaxUrl(baseUrl) && <p className="settings-help warning">{text.minimaxLegacyUrl}</p>}
            </>
          )}
          {isKimi && (
            <>
              <label className="field"><span>{language === 'en-US' ? 'Service region' : '服务区域'}</span>
                <select value={kimiRegion} onChange={(event) => changeKimiRegion(event.target.value as KimiRegion)}>
                  <option value="mainland">{language === 'en-US' ? 'Mainland China' : '中国大陆'}</option>
                  <option value="international">{language === 'en-US' ? 'International' : '国际'}</option>
                </select>
              </label>
              <p className="settings-help">{language === 'en-US' ? 'Kimi has separate Mainland China and international API domains. Pick the region that matches your Moonshot account and API key.' : 'Kimi 分为中国大陆和国际 API 域名，请选择与你的 Moonshot 账号和 API Key 对应的区域。'}</p>
            </>
          )}
          <label className="field"><span>{text.baseUrl}</span><input value={baseUrl} readOnly={!preset.baseUrlEditable && !isCustom} onChange={(event) => { setBaseUrl(event.target.value); setBaseUrlDirty(true); clearNetworkDerivedState() }} /></label>
          <div className="ai-inline-fields">
            <label className="field"><span>{text.endpointMode}</span>
              <select value={endpointMode} disabled={!isCustom} onChange={(event) => { setEndpointMode(event.target.value as AIEndpointMode); clearNetworkDerivedState() }}>
                <option value="base-url">{text.baseUrlMode}</option>
                <option value="full-endpoint">{text.fullEndpointMode}</option>
              </select>
            </label>
            {preset.defaultBaseUrl && <button type="button" className="button ai-inline-action" disabled={busy} onClick={restoreRecommendedBaseUrl}>{text.restoreBaseUrl}</button>}
          </div>
          <p className="settings-help">{text.endpointModeHelp}</p>
          {isCustom && <p className="settings-help warning">{customRelayRiskText}</p>}
          {isCustom && (
            <>
              <label className="field"><span>{text.modelDiscovery}</span>
                <select value={modelDiscovery} onChange={(event) => { setModelDiscovery(event.target.value as AIModelDiscovery); clearNetworkDerivedState() }}>
                  <option value="unsupported">{text.modelsUnsupported}</option>
                  <option value="openai-models">{text.openaiModels}</option>
                  <option value="anthropic-models">{text.anthropicModels}</option>
                  <option value="custom-models-endpoint">{text.customModelsEndpoint}</option>
                </select>
              </label>
              {modelDiscovery === 'custom-models-endpoint' && (
                <label className="field"><span>{text.modelListEndpoint}</span>
                  <input value={modelListEndpoint} maxLength={2048} onChange={(event) => { setModelListEndpoint(event.target.value); clearNetworkDerivedState() }} />
                </label>
              )}
              {modelDiscovery === 'unsupported' && <p className="settings-help">{text.modelListUnsupportedHelp}</p>}
            </>
          )}
          <label className="field"><span>{text.model}</span>
            <input value={model} list="ai-detected-models" placeholder={models.length ? text.modelNotDetected : preset.modelPlaceholder} maxLength={160} onChange={(event) => {
              const nextModel = event.target.value
              setModel(nextModel)
              setVerification(emptyVerification)
              setCapabilities(capabilitiesForModel(capabilities, models.find((item) => item.id === nextModel)))
            }} />
            <datalist id="ai-detected-models">
              {models.map((item) => <option key={item.id} value={item.id}>{modelOptionLabel(item, text.recommended, text.textVerified)}</option>)}
            </datalist>
          </label>
          {modelDiscovery !== 'unsupported' && <button type="button" className="button ai-inline-action" disabled={busy || discovering || !canDiscoverModels} onClick={() => void discoverModels()}>{discovering ? (language === 'en-US' ? 'Detecting...' : '检测中...') : text.discoverModels}</button>}
          {modelDiscovery !== 'unsupported' && <p className="settings-help">{text.detectHint}</p>}
          {discovery && <DiscoveryMessage result={discovery} language={language} />}
          <label className="field"><span>{text.key} {connection?.configured ? text.keep : ''}</span><input type="password" autoComplete="off" value={apiKey} placeholder={connection?.configured ? text.keepPlaceholder : text.enterKey} onChange={(event) => { setApiKey(event.target.value); clearNetworkDerivedState() }} /></label>
          {requiresFreshKey && <p className="settings-help warning">{freshKeyRequiredText}</p>}
          {connection?.configured && <button type="button" className="button danger-subtle ai-inline-action" disabled={busy} onClick={clearSavedKey}>{text.clearKey}</button>}
        </>
      )}
      {isCustom ? (
        <>
          <div className="ai-capabilities">
            <label className="checkbox-field"><input type="checkbox" checked={capabilities.text} onChange={(event) => { setCapabilities({ ...capabilities, text: event.target.checked }); clearNetworkDerivedState() }} />{text.textCapability}</label>
            <label className="checkbox-field"><input type="checkbox" checked={capabilities.vision} onChange={(event) => { setCapabilities({ ...capabilities, vision: event.target.checked }); clearNetworkDerivedState() }} />{text.imageDeclaration}</label>
          </div>
          <p className="settings-help">{text.capabilityHelp}</p>
        </>
      ) : (
        <p className="settings-help ai-capability-note">{capabilityText(capabilities, language)}. {testScopeNote(language)}</p>
      )}
      {!isLocal && (
        <div className="ai-verification-panel">
          <strong>{text.verificationTitle}</strong>
          <span>{text.textStatus}: {verificationStatusText(verification.text.status, language)}{verification.text.checkedAt ? ` · ${formatCheckedAt(verification.text.checkedAt, language)}` : ''}</span>
          <span>{text.imageStatus}: {verificationStatusText(verification.image.status, language)}{verification.image.checkedAt ? ` · ${formatCheckedAt(verification.image.checkedAt, language)}` : ''}</span>
          {verification.image.message && <small>{safeProviderMessage(verification.image.message)}</small>}
          <button type="button" className="button" disabled={busy || verifyingImage || !canVerifyImage} onClick={() => void verifyImage()}>{verifyingImage ? (language === 'en-US' ? 'Testing image...' : '图片测试中...') : text.verifyImage}</button>
        </div>
      )}
      <AIConnectionTestResult result={testResult} mode={mode} />
      <p className="settings-help ai-test-save-note">{testScopeNote(language)} {language === 'en-US' ? 'Detection and tests do not save the connection.' : '检测和测试不会自动保存连接。'}</p>
      <div className="dialog-actions">
        <button type="button" className="button" disabled={busy} onClick={onCancel}>{text.cancel}</button>
        <button type="button" className="button" disabled={busy || !canSubmit} onClick={() => onTest(input() as TestAIConnectionInput)}>{text.test}</button>
        <button type="button" className="button primary" disabled={busy || !canSubmit} onClick={() => onSave(input())}>{text.save}</button>
      </div>
    </div>
  )
}

function modelOptionLabel(model: AIModelPublic, recommended: string, textVerified: string): string {
  const labels = []
  if (model.recommended) labels.push(recommended)
  if (model.textTest?.status === 'verified') labels.push(textVerified)
  return labels.join(' · ')
}

function DiscoveryMessage({ result, language }: { result: ModelDiscoveryResult; language: 'zh-CN' | 'en-US' }): React.JSX.Element {
  const advice = errorAdvice(undefined, result.message, language)
  return (
    <div className={`ai-discovery-message ${result.success ? 'success' : 'failed'}`}>
      <strong>{result.message}</strong>
      {result.recommendedModelId && <small>{language === 'en-US' ? 'Recommended model' : '推荐模型'}: {result.recommendedModelId}</small>}
      {!result.success && <small>{advice?.body ?? (language === 'en-US' ? 'You can still enter the model name manually.' : '你仍然可以手动输入模型名称。')}</small>}
    </div>
  )
}

function verificationStatusText(status: string, language: 'zh-CN' | 'en-US'): string {
  const en: Record<string, string> = {
    verified: 'verified',
    unsupported: 'unsupported',
    failed: 'failed',
    'wrong-answer': 'wrong answer',
    'response-parse-error': 'parse error',
    timeout: 'timeout',
    'not-tested': 'not tested'
  }
  const zh: Record<string, string> = {
    verified: '已验证',
    unsupported: '不支持',
    failed: '失败',
    'wrong-answer': '答案不匹配',
    'response-parse-error': '解析失败',
    timeout: '超时',
    'not-tested': '尚未测试'
  }
  return (language === 'en-US' ? en : zh)[status] ?? status
}

function inferMiniMaxRegion(baseUrl: string): MiniMaxRegion {
  if (/api\.minimax\.io/i.test(baseUrl)) return 'international'
  return 'mainland'
}

function inferKimiRegion(baseUrl: string): KimiRegion {
  if (/api\.moonshot\.ai/i.test(baseUrl)) return 'international'
  return 'mainland'
}

function isLegacyMiniMaxUrl(baseUrl: string): boolean {
  return /api\.minimax\.chat/i.test(baseUrl) || /\/chat\/completions\/?$/i.test(baseUrl)
}

function capabilitiesForModel(current: AICapabilities, model: AIModelPublic | undefined): AICapabilities {
  if (model?.declaredCapabilities?.image === true) return { ...current, vision: true }
  if (model?.declaredCapabilities?.image === false) return { ...current, vision: false }
  return current
}

function credentialDestinationChanged(
  connection: AIConnectionPublic | undefined,
  next: { provider: AIProvider; transport: AITransport; baseUrl: string; modelListEndpoint: string }
): boolean {
  if (!connection || connection.provider === 'codex' || connection.provider === 'claude-code') return false
  return connection.provider !== next.provider
    || connection.transport !== next.transport
    || originOf(connection.baseUrl) !== originOf(next.baseUrl)
    || originOf(connection.modelListEndpoint) !== originOf(next.modelListEndpoint)
}

function originOf(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value)
    url.hostname = url.hostname.toLowerCase()
    return url.origin
  } catch {
    return undefined
  }
}
