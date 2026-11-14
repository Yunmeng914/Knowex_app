import { describe, expect, it } from 'vitest'
import { resolveAIEndpoint, type AIEndpointMode, type AIEndpointOperation } from './endpoint-resolver'
import type { AIProvider, AITransport } from '../../shared/domain/models'

interface Case {
  name: string
  baseUrl: string
  provider?: AIProvider
  transport: AITransport
  operation: AIEndpointOperation
  endpointMode?: AIEndpointMode
  expected?: string
  rejects?: boolean
}

const cases: Case[] = [
  {
    name: 'OpenAI Responses root appends v1 responses',
    baseUrl: 'https://api.openai.com',
    transport: 'openai-responses',
    operation: 'responses',
    expected: 'https://api.openai.com/v1/responses'
  },
  {
    name: 'OpenAI Responses v1 appends responses once',
    baseUrl: 'https://api.openai.com/v1/',
    transport: 'openai-responses',
    operation: 'responses',
    expected: 'https://api.openai.com/v1/responses'
  },
  {
    name: 'OpenAI Responses full endpoint is unchanged',
    baseUrl: 'https://proxy.example.com/openai/v1/responses?debug=1',
    transport: 'openai-responses',
    operation: 'responses',
    endpointMode: 'full-endpoint',
    expected: 'https://proxy.example.com/openai/v1/responses'
  },
  {
    name: 'Chat root appends v1 chat completions',
    baseUrl: 'https://example.com/',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://example.com/v1/chat/completions'
  },
  {
    name: 'DeepSeek chat root uses the current official path without v1',
    baseUrl: 'https://api.deepseek.com',
    provider: 'deepseek',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://api.deepseek.com/chat/completions'
  },
  {
    name: 'Chat v1 does not duplicate v1',
    baseUrl: 'https://example.com/v1',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://example.com/v1/chat/completions'
  },
  {
    name: 'Chat full endpoint does not append twice',
    baseUrl: 'https://example.com/v1/chat/completions',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    endpointMode: 'full-endpoint',
    expected: 'https://example.com/v1/chat/completions'
  },
  {
    name: 'Chat keeps provider path version prefixes',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  },
  {
    name: 'Anthropic root appends v1 messages',
    baseUrl: 'https://api.anthropic.com',
    transport: 'anthropic-messages',
    operation: 'messages',
    expected: 'https://api.anthropic.com/v1/messages'
  },
  {
    name: 'Anthropic v1 appends messages once',
    baseUrl: 'https://api.anthropic.com/v1/',
    transport: 'anthropic-messages',
    operation: 'messages',
    expected: 'https://api.anthropic.com/v1/messages'
  },
  {
    name: 'Models derives from chat endpoint in Base URL mode',
    baseUrl: 'https://example.com/v1/chat/completions',
    transport: 'openai-chat-completions',
    operation: 'models',
    expected: 'https://example.com/v1/models'
  },
  {
    name: 'DeepSeek model list root uses the current official path without v1',
    baseUrl: 'https://api.deepseek.com',
    provider: 'deepseek',
    transport: 'openai-chat-completions',
    operation: 'models',
    expected: 'https://api.deepseek.com/models'
  },
  {
    name: 'Models reject full chat endpoints in full endpoint mode',
    baseUrl: 'https://example.com/v1/chat/completions',
    transport: 'openai-chat-completions',
    operation: 'models',
    endpointMode: 'full-endpoint',
    rejects: true
  },
  {
    name: 'Models reject full responses endpoints in full endpoint mode',
    baseUrl: 'https://example.com/v1/responses',
    transport: 'openai-responses',
    operation: 'models',
    endpointMode: 'full-endpoint',
    rejects: true
  },
  {
    name: 'Models derives from Anthropic messages endpoint',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    transport: 'anthropic-messages',
    operation: 'models',
    expected: 'https://api.anthropic.com/v1/models'
  },
  {
    name: 'Reverse proxy path prefix is kept',
    baseUrl: 'https://proxy.example.com/team/a/v1/',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://proxy.example.com/team/a/v1/chat/completions'
  },
  {
    name: 'Non-secret query is stripped before path resolution',
    baseUrl: 'https://example.com/root/v1/?trace=1',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://example.com/root/v1/chat/completions'
  },
  {
    name: 'Fragments are rejected',
    baseUrl: 'https://example.com/root/v1/#frag',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    rejects: true
  },
  {
    name: 'Trailing slashes do not duplicate paths',
    baseUrl: 'https://example.com/root/v1///',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    expected: 'https://example.com/root/v1/chat/completions'
  },
  {
    name: 'Full endpoint rejects API roots',
    baseUrl: 'https://example.com/v1',
    transport: 'openai-chat-completions',
    operation: 'chat-completions',
    endpointMode: 'full-endpoint',
    rejects: true
  }
]

describe('resolveAIEndpoint', () => {
  it.each(cases)('$name', (item) => {
    const run = (): string => resolveAIEndpoint(item)
    if (item.rejects) expect(run).toThrow()
    else expect(run()).toBe(item.expected)
  })
})
