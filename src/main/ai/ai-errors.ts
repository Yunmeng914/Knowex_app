export type AIErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_BASE_URL'
  | 'INVALID_ENDPOINT'
  | 'MISSING_API_KEY'
  | 'MISSING_MODEL'
  | 'PERMISSION_DENIED'
  | 'ENDPOINT_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'UNSUPPORTED_CAPABILITY'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'RESPONSE_PARSE_ERROR'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN_ERROR'
  | 'CONNECTION_NOT_FOUND'
  | 'NO_ACTIVE_CONNECTION'
  | 'CREDENTIAL_MISSING'
  | 'UNSUPPORTED_TRANSPORT'
  | 'UNSUPPORTED_CAPABILITY'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'REQUEST_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_PROVIDER_ERROR'
  | 'MISSING_MODEL'
  | 'MODEL_LIST_UNAVAILABLE'
  | 'NO_CHAT_MODEL_FOUND'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_TEXT_TEST_FAILED'
  | 'IMAGE_TEST_FAILED'
  | 'LOCAL_TOOL_NOT_INSTALLED'
  | 'LOCAL_TOOL_SHIM_DETECTED'
  | 'LOCAL_TOOL_NATIVE_BINARY_NOT_FOUND'
  | 'LOCAL_TOOL_INVALID_PATH'
  | 'LOCAL_TOOL_LAUNCH_FAILED'
  | 'LOCAL_TOOL_NOT_AUTHENTICATED'
  | 'LOCAL_TOOL_DESKTOP_APP_DETECTED'
  | 'LOCAL_TOOL_VERSION_UNSUPPORTED'
  | 'LOCAL_TOOL_TIMEOUT'
  | 'LOCAL_TOOL_OUTPUT_TOO_LARGE'
  | 'LOCAL_TOOL_EMPTY_OUTPUT'
  | 'LOCAL_TOOL_INVALID_JSON'
  | 'LOCAL_TOOL_NETWORK_ERROR'
  | 'LOCAL_TOOL_AUTHORIZATION_ERROR'
  | 'LOCAL_TOOL_EXIT_ERROR'
  | 'REQUEST_CANCELLED'
  | 'TEMP_DIRECTORY_ERROR'
  | 'UNSAFE_EXECUTABLE_PATH'
  | 'THIRD_PARTY_ENDPOINT_CONFIRMATION_REQUIRED'
  | 'PRIVATE_NETWORK_ENDPOINT_BLOCKED'
  | 'REQUEST_BUDGET_EXCEEDED'

export interface AIErrorOptions extends ErrorOptions {
  retryable?: boolean
  provider?: string
  httpStatus?: number
  safeDetails?: string
  suggestedAction?: string
}

export class AIError extends Error {
  readonly userMessage: string
  readonly retryable: boolean
  readonly provider?: string
  readonly httpStatus?: number
  readonly safeDetails?: string
  readonly suggestedAction?: string

  constructor(
    readonly code: AIErrorCode,
    message: string,
    options?: AIErrorOptions
  ) {
    super(message, options)
    this.name = 'AIError'
    this.userMessage = message
    this.retryable = options?.retryable ?? defaultRetryable(code)
    this.provider = options?.provider
    this.httpStatus = options?.httpStatus
    this.safeDetails = options?.safeDetails
    this.suggestedAction = options?.suggestedAction
  }
}

export function providerErrorFromStatus(status: number, fallback: string): AIError {
  const safeFallback = sanitizeProviderMessage(fallback)
  if (/unknown model|model.*not found|invalid model/i.test(safeFallback)) return new AIError('MODEL_NOT_FOUND', 'The selected model is not available.', { httpStatus: status, safeDetails: safeFallback, suggestedAction: 'Fetch the model list or enter a valid model ID.' })
  if (status === 401) return new AIError('AUTHENTICATION_FAILED', 'API Key is invalid. Fill it in again and test the connection.', { httpStatus: status, suggestedAction: 'Replace the saved API key.' })
  if (status === 403) return new AIError('PERMISSION_DENIED', 'The account does not have permission to use this endpoint or model.', { httpStatus: status, safeDetails: safeFallback, suggestedAction: 'Check account access, service region, and model permission.' })
  if (status === 404) return new AIError('ENDPOINT_NOT_FOUND', 'The endpoint was not found. The Base URL or address mode may be wrong.', { httpStatus: status, safeDetails: safeFallback, suggestedAction: 'Check whether the address should include /v1 or use Full endpoint mode.' })
  if (status === 429) return new AIError('RATE_LIMITED', 'Requests are too frequent or quota is exhausted. Try again later.', { httpStatus: status, suggestedAction: 'Wait, then check account quota and rate limits.' })
  if (status === 408 || status === 504) return new AIError('TIMEOUT', 'The provider request timed out. Check the network, proxy, or Base URL.', { httpStatus: status, retryable: true })
  if (status >= 500) return new AIError('PROVIDER_ERROR', 'The provider returned a server error. Try again later.', { httpStatus: status, retryable: true, safeDetails: safeFallback })
  return new AIError('PROVIDER_ERROR', safeFallback || `The provider returned HTTP ${status}.`, { httpStatus: status, safeDetails: safeFallback })
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

export function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/authorization\s*:\s*bearer\s+\S+/gi, 'Authorization header hidden')
    .replace(/x-api-key\s*:\s*\S+/gi, 'x-api-key header hidden')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[hidden key]')
    .slice(0, 300)
}

function defaultRetryable(code: AIErrorCode): boolean {
  return code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'REQUEST_TIMEOUT' || code === 'RATE_LIMITED' || code === 'PROVIDER_ERROR' || code === 'PROVIDER_UNAVAILABLE'
}
