import type { AIConnectionPublic, AIConnectionTestPublic, AppLanguage, LocalToolDetectionPublic } from '@shared/domain/models'

export type EditorMode = 'create' | 'edit'

export function isLocalTransport(transport: string): boolean {
  return transport === 'codex-cli' || transport === 'claude-code-cli'
}

export function splitConnections(connections: AIConnectionPublic[]): { cloud: AIConnectionPublic[]; local: AIConnectionPublic[] } {
  return {
    cloud: connections.filter((connection) => !isLocalTransport(connection.transport)),
    local: connections.filter((connection) => isLocalTransport(connection.transport))
  }
}

export function editorTitle(mode: EditorMode, providerLabel: string, language: AppLanguage): string {
  if (mode === 'edit') return language === 'en-US' ? 'Edit AI connection' : '编辑 AI 连接'
  return language === 'en-US' ? `Add ${providerLabel} connection` : `添加 ${providerLabel} 连接`
}

export function capabilityText(capabilities: AIConnectionPublic['capabilities'], language: AppLanguage): string {
  if (capabilities.vision) return language === 'en-US' ? 'Supports text, screenshots, and image input' : '支持文本、截图和图片输入'
  return language === 'en-US' ? 'Text only' : '仅支持文本'
}

export function localStatusText(status: string | undefined, language: AppLanguage): string | undefined {
  if (!status) return undefined
  const zh: Record<string, string> = {
    available: '本机工具可用',
    'native-cli-available': '原生 CLI 可用',
    'winget-cli-available': 'WinGet CLI 可用',
    'npm-native-binary-available': 'npm 原生 CLI 可用',
    'npm-shim-detected': '检测到 npm 启动脚本',
    'not-installed': '未检测到本机工具',
    'invalid-path': '路径无效，请选择可直接运行的 .exe 文件',
    'launch-failed': '本机工具无法启动',
    'version-unsupported': '本机工具版本不支持',
    'not-authenticated': '本机工具尚未登录',
    unavailable: '本机工具暂不可用',
    unknown: '本机工具状态待检测',
    'executable-found-validation-failed': '原生可执行文件验证失败',
    'desktop-app-detected-cli-not-available': '检测到 Codex 桌面应用，但尚未检测到 Codex CLI'
  }
  const en: Record<string, string> = {
    available: 'Local tool available',
    'native-cli-available': 'Native CLI available',
    'winget-cli-available': 'WinGet CLI available',
    'npm-native-binary-available': 'npm native CLI available',
    'npm-shim-detected': 'npm launcher script detected',
    'not-installed': 'Local tool not found',
    'invalid-path': 'Invalid path. Choose a directly executable .exe file.',
    'launch-failed': 'Local tool could not start',
    'version-unsupported': 'Local tool version is unsupported',
    'not-authenticated': 'Local tool is not signed in',
    unavailable: 'Local tool unavailable',
    unknown: 'Local tool status unknown',
    'executable-found-validation-failed': 'Native executable validation failed',
    'desktop-app-detected-cli-not-available': 'Codex desktop app detected, but Codex CLI was not found'
  }
  return (language === 'en-US' ? en : zh)[status] ?? status
}

export function localDetectionMessage(detection: LocalToolDetectionPublic | undefined, fallback: string, language: AppLanguage): string {
  if (!detection) return fallback
  if (detection.status === 'invalid-path') {
    return language === 'en-US'
      ? 'Detected a Windows launcher script, not a directly executable .exe. Choose the real executable file.'
      : '检测到的可能是 Windows 启动脚本，不是可直接运行的 .exe。请选择真实可执行文件。'
  }
  if (detection.status === 'desktop-app-detected-cli-not-available') {
    return language === 'en-US'
      ? 'Codex desktop app was detected, but Codex CLI is not available. The desktop app and CLI are separate clients; install Codex CLI separately.'
      : '检测到 Codex 桌面应用，但尚未检测到 Codex CLI。桌面应用与 CLI 是不同客户端；请单独安装 CLI。'
  }
  if (detection.status === 'npm-shim-detected') {
    return language === 'en-US'
      ? 'Claude Code Windows launcher script was detected, but no native executable was found. Knowex will not run .cmd or .ps1 through a shell.'
      : '检测到 Claude Code 的 Windows 启动脚本，但尚未找到可直接安全运行的原生可执行文件。Knowex 不会通过 Shell 执行 .cmd 或 .ps1。'
  }
  if (detection.status === 'not-authenticated') {
    return language === 'en-US'
      ? 'Claude Code CLI is installed, but sign-in is not complete. Sign in from a terminal; Knowex does not read or save CLI tokens.'
      : 'Claude Code CLI 已安装，但尚未完成登录。请先在终端运行 Claude Code 并完成认证。Knowex 不读取或保存 CLI Token。'
  }
  if (detection.status === 'version-unsupported') {
    return language === 'en-US'
      ? 'This Claude Code version lacks the non-interactive or JSON output mode Knowex needs. Upgrade and detect again.'
      : '当前 Claude Code 版本缺少 Knowex 所需的非交互或结构化输出能力。请升级后重新检测。'
  }
  if (detection.tool === 'claude-code' && detection.status === 'not-installed') {
    return language === 'en-US'
      ? 'Claude Code CLI was not detected. Install it from a terminal, for example: winget install Anthropic.ClaudeCode. Then run claude --version, claude doctor, and sign in before detecting again.'
      : '尚未检测到 Claude Code CLI。请先在终端安装，例如：winget install Anthropic.ClaudeCode。安装后运行 claude --version、claude doctor，并完成登录后再重新检测。'
  }
  if (detection.status === 'native-cli-available' || detection.status === 'winget-cli-available' || detection.status === 'npm-native-binary-available') {
    return language === 'en-US'
      ? 'Claude Code CLI is detected and can run. Sign-in is managed by Claude Code.'
      : 'Claude Code CLI 已检测并可运行。登录状态由 Claude Code 自身管理。'
  }
  if (detection.installed) {
    const label = language === 'en-US' ? 'Detected' : '已检测到'
    return `${label}${detection.version ? ` · ${detection.version}` : ''}`
  }
  return detection.message || fallback
}

export function testResultTitle(result: AIConnectionTestPublic, language: AppLanguage): string {
  if (result.success) return language === 'en-US' ? 'Connection text test passed' : '连接文本测试成功'
  return language === 'en-US' ? 'Connection text test failed' : '连接文本测试失败'
}

export function testSaveReminder(mode: EditorMode, language: AppLanguage): string {
  if (mode === 'edit') {
    return language === 'en-US'
      ? 'Testing does not save your changes. Click Save connection to keep this configuration.'
      : '测试不会自动保存你的修改。请点击“保存连接”完成配置。'
  }
  return language === 'en-US'
    ? 'Testing does not save this connection. Click Save connection to finish setup.'
    : '测试不会自动保存该连接。请点击“保存连接”完成配置。'
}

export function testScopeNote(language: AppLanguage): string {
  return language === 'en-US'
    ? 'The test checks text connectivity only. It does not verify image capability.'
    : '测试只验证文本连通性，不代表图片能力已经通过测试。'
}

export function lastTextTestLabel(test: AIConnectionTestPublic | undefined, language: AppLanguage): string | undefined {
  if (!test) return undefined
  const time = formatCheckedAt(test.checkedAt, language)
  const status = test.success
    ? (language === 'en-US' ? 'passed' : '成功')
    : (language === 'en-US' ? 'failed' : '失败')
  return language === 'en-US' ? `Last text test: ${time} ${status}` : `上次文本测试：${time} ${status}`
}

export function formatCheckedAt(checkedAt: string | undefined, language: AppLanguage): string {
  if (!checkedAt) return language === 'en-US' ? 'unknown time' : '未知时间'
  const date = new Date(checkedAt)
  if (Number.isNaN(date.getTime())) return language === 'en-US' ? 'unknown time' : '未知时间'
  return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

export interface ErrorAdvice {
  title: string
  body: string
}

export function errorAdvice(errorCode: string | undefined, message: string | undefined, language: AppLanguage): ErrorAdvice | undefined {
  const haystack = `${errorCode ?? ''} ${message ?? ''}`.toLowerCase()
  const minimax = haystack.includes('minimax')
  if (minimax && (haystack.includes('authentication_failed') || /\b40[13]\b/.test(haystack) || haystack.includes('permission'))) {
    return language === 'en-US'
      ? { title: 'MiniMax authentication or account permission failed.', body: 'Check the API key, Mainland China/international service region, and whether the key belongs to the correct quota plan.' }
      : { title: 'MiniMax 认证或账户权限失败。', body: '请检查 API Key、中国大陆/国际服务区域，以及当前 Key 所属的额度体系。' }
  }
  if (minimax && (haystack.includes('404') || haystack.includes('not reachable') || haystack.includes('endpoint'))) {
    return language === 'en-US'
      ? { title: 'MiniMax endpoint is not reachable.', body: 'Check the service region and API root URL. Use /v1 as the Base URL, not the full chat endpoint.' }
      : { title: '无法访问 MiniMax 接口。', body: '请检查服务区域和 API 根地址。Base URL 应填写 /v1 根地址，不要填写完整聊天 endpoint。' }
  }
  if (minimax && (haystack.includes('unknown model') || haystack.includes('model_not_found'))) {
    return language === 'en-US'
      ? { title: 'The MiniMax model name is unavailable.', body: 'Detect available models again. Do not enter the provider name “minimax” as the model.' }
      : { title: '当前 MiniMax 模型名称不可用。', body: '请重新检测可用模型，不要把厂商名称 “minimax” 填成模型名。' }
  }
  if (minimax && (haystack.includes('rate_limited') || haystack.includes('429'))) {
    return language === 'en-US'
      ? { title: 'MiniMax quota or rate limit was reached.', body: 'Check balance, package quota, and request frequency.' }
      : { title: 'MiniMax 额度或调用频率受限。', body: '请检查余额、套餐额度和调用频率。' }
  }
  const localAuth = haystack.includes('local_tool_not_authenticated') || haystack.includes('not-authenticated') || haystack.includes('not authenticated') || haystack.includes('not logged in')
  const cloudAuth = haystack.includes('authentication_failed') || haystack.includes('missing_api_key') || /\b40[13]\b/.test(haystack)
  if (localAuth) {
    return language === 'en-US'
      ? { title: 'Local tool is not signed in.', body: 'Sign in from a terminal first. Knowex does not read or save CLI tokens.' }
      : { title: '本机工具尚未完成认证。', body: '请先在终端完成登录。Knowex 不读取或保存 CLI Token。' }
  }
  if (cloudAuth) {
    return language === 'en-US'
      ? { title: 'Authentication failed.', body: 'Check the API key, account access, and whether the endpoint matches this provider.' }
      : { title: '认证失败。', body: '请检查 API Key、账户权限，以及接口地址是否与服务商匹配。' }
  }
  if (haystack.includes('rate_limited') || haystack.includes('429')) {
    return language === 'en-US'
      ? { title: 'The request is rate limited.', body: 'Wait and try again, or check the account balance, quota, and rate limits.' }
      : { title: '请求过于频繁或账户额度受限。', body: '请稍后重试，并检查账户余额、调用额度或频率限制。' }
  }
  if (haystack.includes('request_timeout') || haystack.includes('local_tool_timeout') || haystack.includes('timeout') || haystack.includes('time_out')) {
    return language === 'en-US'
      ? { title: 'The request timed out.', body: 'Check the network, endpoint, provider status, or whether the local CLI is stuck.' }
      : { title: '请求超时。', body: '请检查网络、接口地址、服务商状态，或确认本机 CLI 没有卡住。' }
  }
  if (haystack.includes('network_error')) {
    return language === 'en-US'
      ? { title: 'Could not reach the service.', body: 'Check the network, proxy, firewall, and endpoint URL.' }
      : { title: '无法连接到服务。', body: '请检查网络、代理、防火墙和接口地址。' }
  }
  if (haystack.includes('image_not_supported') || haystack.includes('unsupported_capability')) {
    return language === 'en-US'
      ? { title: 'This connection only supports text.', body: 'Switch to a connection that supports screenshots and image input.' }
      : { title: '当前连接仅支持文本。', body: '请切换到支持截图和图片输入的连接。' }
  }
  if (haystack.includes('local_tool_invalid_path') || haystack.includes('unsafe_executable_path')) {
    return language === 'en-US'
      ? { title: 'Knowex cannot use this file.', body: 'Choose a real .exe file. Do not choose .cmd, .bat, .ps1, a directory, or a command with arguments.' }
      : { title: '无法使用该文件。', body: '请选择真实的 .exe 文件，不要选择 .cmd、.bat、.ps1、目录或附带参数的命令。' }
  }
  if (haystack.includes('local_tool_not_installed')) {
    return language === 'en-US'
      ? { title: 'Local tool was not found.', body: 'Confirm from a terminal that the tool is installed and can run normally.' }
      : { title: '未检测到该本机工具。', body: '请先在终端确认工具已经安装并且能够正常运行。' }
  }
  if (haystack.includes('model_required') || haystack.includes('missing_model')) {
    return language === 'en-US'
      ? { title: 'No model is selected.', body: 'Detect available models first, or enter a model name manually.' }
      : { title: '尚未选择模型。', body: '请先检测可用模型，或手动输入模型名称。' }
  }
  if (haystack.includes('unknown model') || haystack.includes('model_not_found')) {
    return language === 'en-US'
      ? { title: 'The model name is invalid.', body: 'Detect available models again, or choose a correct model manually.' }
      : { title: '当前模型名称无效。', body: '请重新检测可用模型，或手动选择正确的模型。' }
  }
  if (haystack.includes('model_list_unavailable') || haystack.includes('no_chat_model_found')) {
    return language === 'en-US'
      ? { title: 'Could not load the model list.', body: 'You can still enter the model name manually.' }
      : { title: '无法自动获取模型列表。', body: '你仍然可以手动输入模型名称。' }
  }
  if (haystack.includes('invalid_response') || haystack.includes('empty_response') || haystack.includes('response_parse_error') || haystack.includes('model')) {
    return language === 'en-US'
      ? { title: 'The model or API protocol may not match.', body: 'Check the model name, provider permission, and endpoint URL.' }
      : { title: '模型或接口协议可能不匹配。', body: '请检查模型名称、服务商权限和接口地址。' }
  }
  return undefined
}

export function safeProviderMessage(message: string): string {
  return message
    .replace(/authorization\s*:\s*bearer\s+\S+/gi, 'Authorization header hidden')
    .replace(/x-api-key\s*:\s*\S+/gi, 'x-api-key header hidden')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[hidden key]')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, '[user-profile]')
    .slice(0, 300)
}

export function deleteConnectionCopy(connection: AIConnectionPublic, totalConnections: number, language: AppLanguage): { title: string; paragraphs: string[] } {
  const isLocal = isLocalTransport(connection.transport)
  const isLast = totalConnections <= 1
  const paragraphs = language === 'en-US'
    ? [
        isLocal
          ? 'This only removes the local tool connection from Knowex. Knowex does not save CLI tokens, so the tool sign-in state is not changed.'
          : 'This removes the connection configuration and its locally encrypted API key from Knowex.',
        'This action cannot be undone.'
      ]
    : [
        isLocal
          ? '这只会删除 Knowex 中的本机工具连接配置。Knowex 不保存 CLI Token，因此不会影响该工具自身的登录状态。'
          : '这会删除 Knowex 中保存的连接配置和对应的本地加密 API Key。',
        '此操作无法撤销。'
      ]
  if (connection.active) {
    paragraphs.push(language === 'en-US'
      ? 'This is the current connection. After deletion, Knowex will switch to the next available connection.'
      : '这是当前使用的连接。删除后 Knowex 将自动切换到下一个可用连接。')
  }
  if (isLast) {
    paragraphs.push(language === 'en-US'
      ? 'This is the last AI connection. AI Q&A will be unavailable until you add a new connection.'
      : '这是最后一个 AI 连接。删除后，AI 问答将暂时不可用，直到你添加新的连接。')
  }
  return {
    title: language === 'en-US' ? `Delete "${connection.name}"?` : `删除“${connection.name}”？`,
    paragraphs
  }
}
