# Knowex 云端 AI API 接入可用性专项审计报告（修正版）

修正时间：2026-08-02
范围：仅云端 API Provider。Codex CLI、Claude Code CLI、MiniMax、GLM、CredentialStore、ConfigStore 不在本轮修复范围内。
真实 API Key：未使用。真实付费请求：未执行。所有真实厂商验证仍标记为 `NOT RUN`。

## 1. 总体结论

当前云端 API 架构处于 **Implemented + Mock Verified 部分通过** 状态，但正式发布前仍需要真实 UI/API Release Gate。

本轮纠偏后结论：

1. Kimi `.cn` 不是错误地址。Kimi 存在中国大陆和国际两个区域：
   - 中国大陆：`https://api.moonshot.cn/v1`
   - 国际：`https://api.moonshot.ai/v1`
2. 原 `CLOUD-003` 从“默认地址错误/P1”修正为“缺少国内/国际区域说明或区域选择/P2”。
3. 原 `CLOUD-008` 从代码 Bug 列表移出，改为正式验收 Release Gate：未做真实 UI 检查不能发布，但它本身不是代码缺陷。
4. DeepSeek 官方 OpenAI-compatible Base URL 已修正为 `https://api.deepseek.com`，最终构造 `https://api.deepseek.com/chat/completions` 和 `https://api.deepseek.com/models`，不再错误拼接 `/v1`。
5. DeepSeek 当前模型提示已改为 `deepseek-v4-flash` / `deepseek-v4-pro`；`deepseek-chat` / `deepseek-reasoner` 不再作为当前模型示例、默认值或测试 fixture。
6. OpenAI `gpt-5.4-mini` 经官方文档确认存在；不因“模型不存在”删除，但 UI placeholder 已弱化为优先获取模型列表。
7. OpenAI Responses 历史消息问题真实存在，且已在本轮最小修复中处理。

## 2. 当前架构

```text
Settings UI
→ Preload
→ IPC + Zod
→ AIConnectionService / AIService
→ CredentialStore
→ ModelDiscoveryService
→ ProviderRegistry
→ Connector
→ Provider API
```

## 3. Provider 矩阵

| Provider | Implemented | Mock Verified | Real Verified | 备注 |
|---|---|---|---|---|
| OpenAI Responses | PASS | PASS | NOT RUN | 历史消息映射已在本轮修复 |
| Anthropic Messages | PASS | PASS | NOT RUN | 未使用真实 Key 验证 |
| DeepSeek | PASS | PASS | NOT RUN | Base URL 与当前模型提示已修正，最终模型以 `/models` 或用户明确输入为准 |
| Kimi | PASS | PASS | NOT RUN | `.cn` 保留；本轮补充中国大陆/国际区域选择 |
| MiniMax | PASS | PASS | NOT RUN | 本轮未修改 |
| GLM / 智谱 | PASS | PASS | NOT RUN | 本轮未修改 |
| Custom OpenAI-Compatible | PASS | PASS | NOT RUN | 本轮未修改 |

## 4. URL 与协议矩阵

| Provider | Transport | 当前/默认地址 | Chat endpoint | Models endpoint | 状态 |
|---|---|---|---|---|---|
| OpenAI | `openai-responses` | `https://api.openai.com/v1/responses` | 直接 POST Responses endpoint | `https://api.openai.com/v1/models` | PARTIAL，未真实验证 |
| Anthropic | `anthropic-messages` | `https://api.anthropic.com/v1/messages` | 直接 POST Messages endpoint | `https://api.anthropic.com/v1/models` | PARTIAL，未真实验证 |
| DeepSeek | `openai-chat-completions` | `https://api.deepseek.com` | append `/chat/completions` without `/v1` | append `/models` without `/v1` | PASS，未真实验证 |
| Kimi China | `openai-chat-completions` | `https://api.moonshot.cn/v1` | append `/chat/completions` | append `/models` | PARTIAL，未真实验证 |
| Kimi International | `openai-chat-completions` | `https://api.moonshot.ai/v1` | append `/chat/completions` | append `/models` | PARTIAL，未真实验证 |
| MiniMax China | `openai-chat-completions` | `https://api.minimaxi.com/v1` | append `/chat/completions` | append `/models` | 未改动 |
| MiniMax International | `openai-chat-completions` | `https://api.minimax.io/v1` | append `/chat/completions` | append `/models` | 未改动 |
| GLM / 智谱 | `openai-chat-completions` | `https://open.bigmodel.cn/api/paas/v4/` | append `/chat/completions` | append `/models` | 未改动 |
| Custom | 用户选择 | 用户输入 | root 或 full endpoint normalize | strip chat suffix 或 append `/models` | 未改动 |

## 5. 模型发现矩阵

| Provider | 模型为空 | 推荐逻辑 | 手动回退 | Real Verified |
|---|---|---|---|---|
| OpenAI | 保存/测试前阻止 | preset hints + `/models` candidates | PASS | NOT RUN |
| Anthropic | 保存/测试前阻止 | preset hints + `/models` candidates | PASS | NOT RUN |
| DeepSeek | 保存/测试前阻止 | 当前示例为 `deepseek-v4-flash` / `deepseek-v4-pro`；hint 优先匹配实际返回的 DeepSeek v4 candidates | PASS | NOT RUN |
| Kimi | 保存/测试前阻止 | `moonshot-v1-8k` hint + `/models` candidates | PASS | NOT RUN |
| MiniMax | 保存/测试前阻止 | M3/M2.x hints | PASS | NOT RUN |
| GLM / 智谱 | 保存/测试前阻止 | GLM 5.x/4.7 hints | PASS | NOT RUN |
| Custom | 保存/测试前阻止 | parsed candidates | PASS | NOT RUN |

## 6. 能力测试矩阵

| Provider | 文本能力 | 图片能力 | Real Verified |
|---|---|---|---|
| OpenAI | Mock Verified | Mock Verified | NOT RUN |
| Anthropic | Mock Verified | Mock Verified | NOT RUN |
| DeepSeek | Mock Verified | Text-only block by capability | NOT RUN |
| Kimi | Mock Verified | Text-only block by capability | NOT RUN |
| MiniMax | Mock Verified | Model-specific verification path exists | NOT RUN |
| GLM / 智谱 | Mock Verified | Model-specific verification path exists | NOT RUN |
| Custom | Mock Verified | Depends on user declaration/verification | NOT RUN |

## 7. 安全检查

本轮未发现新的密钥安全问题：

- Renderer 仍不能读取明文 Key。
- Renderer 仍不能读取密文或 `encryptedSecrets`。
- 本轮未修改 `CredentialStore`。
- 本轮未修改 `ConfigStore`。
- 本轮未使用真实 API Key。
- 本轮未执行真实付费请求。

## 8. 问题清单

| ID | 严重级别 | Provider/模块 | 当前问题 | 纠偏/修复状态 | 证据 | 建议 |
| -- | ---- | -------- | ---- | ---- | ---- | -- |
| CLOUD-001 | P1 | OpenAI Responses | 历史 `AIRequest.messages` 未映射到 Responses input | 已修复 | `src/main/ai/connectors/openai-responses-connector.ts` | 正式验收时真实验证多轮问答 |
| CLOUD-002 | P1 | DeepSeek | 官方 Base URL 与当前模型示例已过期，可能生成错误 `/v1` 地址并提示弃用模型 | 已修正 | `src/main/ai/provider-presets.ts`、`src/main/ai/endpoint-resolver.ts`、`src/main/ai/model-discovery-service.ts` | 真实模型仍以 `/models` 返回或用户手动输入为准 |
| CLOUD-003 | P2 | Kimi | 缺少中国大陆/国际区域说明或选择 | 已最小修正 | `src/renderer/src/features/settings/ai/AIConnectionEditor.tsx` | `.cn` 保留，不静默迁移旧连接 |
| CLOUD-004 | P2 | Custom | Base URL root 与 full endpoint 文案仍可能混淆 | 未修复 | `src/main/ai/provider-presets.ts` | 后续 UI 文案优化 |
| CLOUD-005 | P2 | Model Discovery | 模型发现可能产生少量验证请求，费用提示仍需真实 UI 检查 | 未修复 | `src/renderer/src/features/settings/ai/AIConnectionEditor.tsx` | Release Gate 中检查 |
| CLOUD-006 | P2 | MiniMax | 旧 URL 仅提示不迁移 | 未修复，本轮不改 MiniMax | `AIConnectionEditor.tsx` | 后续按 MiniMax 专项处理 |
| CLOUD-007 | P2 | Error Diagnosis | 真实 401/403/404/429/余额/地区错误未全量真实验证 | 未修复 | connector tests | 真实验收时补厂商失败场景 |

## 9. Release Gate

当前状态：`READY FOR REAL-API VERIFICATION`。自动化、Mock 与构建验证已通过；真实厂商 Key 小额连通性验证仍为 `NOT RUN`，因此不得标记为 `READY FOR RELEASE`。

这些不是代码 Bug，但正式发布前必须完成：

1. 使用真实 UI 逐 Provider 走完添加、发现模型、文本测试、图片测试、保存、设为当前、实际问答、重启、删除。
2. 所有未使用真实 Key 的 Provider，`Real Verified` 必须保持 `NOT RUN`。
3. 检查打包版 Windows 应用中的中文文案是否真实无乱码。
4. 检查配置文件无明文 Key，且 Renderer 无法获得密文。

## 10. 本轮最小修复计划状态

| 修改文件 | 目的 | 状态 |
|---|---|---|
| `src/main/ai/connectors/openai-responses-connector.ts` | 映射历史 user/assistant/system/developer 消息，当前 evidence/images 作为当前 user message | 已完成 |
| `src/main/ai/connectors/openai-responses-connector.test.ts` | 增加 Responses 历史、图片、重复问题、空历史、解析回归测试 | 已完成 |
| `src/main/ai/provider-presets.ts` | DeepSeek Base URL 改为官方 root，模型示例改为 v4 flash/pro；OpenAI placeholder 弱化为优先获取模型列表 | 已完成 |
| `src/main/ai/endpoint-resolver.ts` | DeepSeek chat/models endpoint 不再自动插入 `/v1` | 已完成 |
| `src/main/ai/model-discovery-service.ts` | DeepSeek 推荐 hint 以 v4 flash/pro 和实际返回候选为准，避免固定旧别名 | 已完成 |
| `src/main/ai/provider-presets.test.ts` | 覆盖 DeepSeek Base URL、当前模型示例、旧模型名防回归 | 已完成 |
| `src/renderer/src/features/settings/ai/AIConnectionEditor.tsx` | 为 Kimi 增加中国大陆/国际区域选择，不迁移旧连接 | 已完成 |

## 11. 人工真实测试清单

所有项目仍需人工真实验证：

| Provider | 模型发现 | 文本测试 | 图片测试 | 保存/设为当前 | 实际问答 | 重启 | 删除 | 状态 |
|---|---|---|---|---|---|---|---|---|
| OpenAI Responses | 待运行 | 待运行 | 待运行 | 待运行 | 多轮历史重点验证 | 待运行 | 待运行 | NOT RUN |
| Anthropic Messages | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| DeepSeek | 待运行 | 待运行 | 文本连接应本地阻止图片 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| Kimi China | 待运行 | 待运行 | 文本连接应本地阻止图片 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| Kimi International | 待运行 | 待运行 | 文本连接应本地阻止图片 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| MiniMax | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| GLM / 智谱 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
| Custom | 待运行 | 待运行 | 按用户能力 | 待运行 | 待运行 | 待运行 | 待运行 | NOT RUN |
