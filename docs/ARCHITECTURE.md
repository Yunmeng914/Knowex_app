# Knowex architecture

This file is the implementation contract for Knowex. The reader remains the product center; files, annotations, Zotero data, Markdown, and optional AI are supporting capabilities around the reading session.

## Dependency direction

```text
renderer feature UI
    -> renderer application hooks
    -> typed window.knowex API
    -> context-isolated preload bridge
    -> domain-specific IPC handlers
    -> main-process services and adapters
    -> local files / Zotero APIs / LibreOffice / model endpoint

shared domain entities + IPC contracts
    -> may be imported by every layer
    -> must not import React, Electron, or Node APIs
```

Dependencies only point downward. A reader component cannot call the file system, and a storage service cannot import UI code.

## Source layout

```text
src/
  main/
    app-services.ts       dependency composition; no IPC registration
    ai/                   AI request service, prompt builder, connector registry, and provider connectors
    assets/               annotation application service and PNG asset store
    document/             PDF import and presentation conversion
    exa/                  isolated academic search, content extraction, and encrypted Exa settings
    ipc/                  one handler registrar per domain
    menu/                 native menu and renderer commands
    notes/                Markdown projection
    shortcuts/            global accelerator lifecycle
    storage/              configuration, credentials, atomic repository, and lifecycle maintenance
    zotero/               local transport, field mapping, import, and Web API export
  preload/                narrow context-isolated bridge
  renderer/src/
    app/                   root composition and application hooks
    components/            reusable layout components
    features/
      annotations/         annotation list and editor
      capture/             region selection
      chat/                annotation-grounded conversations
      exa/                 local-context research threads, Exa settings, and content inspection
      library/             local and Zotero document entry points
      onboarding/          first-run guide
      reader/              PDF rendering, viewport, navigation, search, and tools
      settings/            settings forms
      workspace/           local path inspection
    i18n/                  typed dictionaries and language state
    styles/                base, shell, reader, annotation, and dialog styles
  shared/
    contracts/             channel names, validation schemas, public API
    domain/                document, annotation, workspace, settings, menu, Zotero entities
```

`models.ts` is a compatibility barrel, not a place for new entities. Add a field to its owning domain file. `register-handlers.ts` and `global.css` are also composition files only; new behavior and rules belong in their domain modules.

## Ownership rules

- `App.tsx` composes the screen. Document commands live in `useDocumentSession`; Zotero dialog state lives in `useZoteroIntegration`; notices live in `useNotice`.
- `PdfReader.tsx` coordinates reader modules. Scaling and visible-page tracking live in `useReaderViewport`; toolbar UI lives in `ReaderToolbar`; page rendering lives in `PdfPageView`.
- Trackpad zoom changes a lightweight visual scale during the gesture. The committed PDF scale changes once after the input settles; `PdfPageView` renders into staging canvas/text layers before replacing the visible result.
- Main-process objects are created once by `createAppServices`. IPC registrars validate inputs and delegate; they do not implement storage or conversion algorithms.
- `ZoteroLocalClient` owns HTTP details, `zotero-mappers` owns pure data conversion, and `ZoteroLocalApi` owns the import use case.
- Zotero sync defaults and per-item overrides belong to `ConfigStore`; collection-tree projection remains a pure renderer mapping over Local API metadata.
- Annotation chat is shared by screenshot and text annotations and therefore belongs to `features/chat`, not inside a specific editor implementation.
- Exa remains outside the AI provider registry. `ExaService` is the only use-case facade for its fixed-origin client and separate encrypted settings, while renderer code sees only typed `window.knowex.exa` methods.

## Exa academic search foundation

Exa is an optional retrieval integration, not an AI model transport:

```text
ExaResearchDialog / ExaSearchPanel / annotation Exa accordion
    -> window.knowex.exa
    -> exa:* trusted IPC + Zod validation
    -> ExaService
    -> ExaSettingsStore (userData/exa.json + safeStorage)
    -> ExaClient (fixed https://api.exa.ai origin)
```

Academic mode is the product default and maps to Exa's `research paper` category. `ExaSearchPanel` is reused by the lightweight global dialog and by the annotation accordion; it owns temporary filters, results, and content inspection only. Reader and capture quick actions emit an `EvidenceTool` intent, while the application layer saves the evidence and opens the matching annotation section. Text evidence may become Exa context, but screenshot bytes are never sent to Exa. Typed IPC bounds every query before `ExaClient` composes the provider request. Language remains an explicitly soft semantic preference because the Search API has no strict language field. Result highlights and fetched page text are temporary and are not sent to an AI provider or persisted into the workspace.

## AI connection foundation

AI requests keep the existing renderer flow but now pass through a versioned main-process connection layer:

```text
AnnotationChat / useDocumentSession
    -> window.knowex.ai.ask
    -> ai:ask IPC + Zod validation
    -> AIService
    -> AIConnectionService
    -> ConfigStore (non-sensitive V2 connection config)
    -> CredentialStore (safeStorage encrypted API keys)
    -> PromptBuilder
    -> ProviderRegistry
    -> Provider connector
```

`ConfigStore` migrates the legacy single OpenAI shape into `ai.version = 2` with `connections`, `activeConnectionId`, and `encryptedSecrets`. Legacy encrypted keys are moved as ciphertext and are not decrypted during migration.

Renderer-visible AI settings are public DTOs only: connection id, name, provider, transport, base URL, model, capabilities, configured state, and active state. They never include API keys, encrypted secrets, raw config, or `safeStorage` output.

`AIService` owns the complete question-answer use case. `PromptBuilder` owns annotation evidence and image assembly. `ProviderRegistry` chooses a connector by transport. Provider and transport are separate fields: provider identifies the service/vendor, while transport identifies the wire protocol.

Privileged IPC handlers use `trusted-ipc-sender.ts` to verify that calls come from the Knowex renderer frame before Zod input validation and service delegation. AI requests then pass through request budget validation before any connector is called.

Cloud credentials are bound by `credential-destination.ts` to provider, transport, auth scheme, request origin, and model-list origin. `endpoint-policy.ts` enforces main-process URL policy for connector calls, model discovery, and connection tests; renderer validation is only an early UX filter.

Cloud API support is implemented through separate connectors:

- `openai-responses`: OpenAI Responses API, including text and image input.
- `openai-chat-completions`: OpenAI Chat Completions-compatible APIs such as DeepSeek, Kimi, MiniMax, and custom compatible endpoints.
- `anthropic-messages`: Anthropic Messages API.

Local CLI support is implemented as first-class transports, not as cloud API compatibility shims:

- `codex-cli`: provider `codex`, local Codex CLI connector.
- `claude-code-cli`: provider `claude-code`, local Claude Code CLI connector.

The full provider registry mapping is:

```text
openai       -> openai-responses
anthropic    -> anthropic-messages
deepseek     -> openai-chat-completions
kimi         -> openai-chat-completions
minimax      -> openai-chat-completions
custom       -> user-selected cloud transport
codex        -> codex-cli
claude-code  -> claude-code-cli
```

Local CLI requests use `SecureProcessRunner`, which is the only main-process module allowed to start Codex CLI or Claude Code CLI. It uses `spawn(executablePath, args, { shell: false, cwd, env })`, passes prompts as independent arguments or stdin, filters environment variables, applies output limits, supports timeout/cancellation, and strips ANSI control sequences from captured output. It must not use `exec`, shell strings, `cmd /c`, PowerShell command strings, pipes, redirects, or command concatenation for user content.

On Windows, local tool paths must currently point to a direct `.exe`. NPM shim files such as `.cmd` or `.ps1` are not launched because doing so would require a shell or script host path. Those shims should be treated as `invalid-path` until a future audited launcher can resolve them without weakening the `shell: false` boundary.

Each CLI request runs in an isolated temporary directory:

```text
app.getPath('temp')/knowex-ai-cli/<request-id>/
```

Knowex does not use the source repository, PDF folder, workspace root, desktop, home directory, or renderer-provided arbitrary path as CLI `cwd`. The temporary directory is cleaned after success, error, timeout, or cancellation. CLI credentials remain owned by the CLI itself; Knowex detects executable paths and versions but does not read, copy, parse, or store Codex or Claude login tokens.

CLI prompt serialization is handled by `cli-prompt-serializer.ts`. It writes fixed `KNOWEX_*` section boundaries for system instruction, annotation evidence, history, current question, and output requirements. The prompt tells the tool to return answer text only, not modify files, not execute code, not read unrelated directories, and not output ANSI control characters. Image capability is disabled for both local CLI presets until a concrete CLI version and invocation mode are verified to accept image file input. Image requests are blocked by `AIService` before connector invocation.

AI cancellation is request-id scoped. Renderer chat creates a request id, `ai:ask` stores an `AbortController` for that id, and `ai:cancel` aborts only that controller. Cloud connectors receive the signal for fetch cancellation; CLI connectors pass it to `SecureProcessRunner`, which terminates only the child process created for that request.

The settings UI obtains provider presets from main-process code. Cloud presets supply default transport, base URL, default capabilities, and help text. Local presets supply tool type, transport, default text-only capability, and safety help text. Model names remain user-entered values.

Current local CLI verification on this workstation:

- Codex CLI: `where.exe codex` found `C:\Program Files\WindowsApps\OpenAI.Codex_26.721.4979.0_x64__2p2nqsd0c76g0\app\resources\codex.exe`, but `codex --version` and `codex --help` failed with `Access is denied`; invocation parameters are therefore not verified here.
- Claude Code CLI: `claude --version` returned `2.1.163 (Claude Code)` through a PowerShell-resolved npm shim. `claude --help` verified `-p/--print`, `--output-format json`, `--input-format text`, `--model`, `--permission-mode`, `--tools`, `--disallowedTools`, and `--no-session-persistence`, but the detected shim is not accepted by the app unless the user selects a direct `.exe`.

Connection tests are executed in the main process through the selected connector with a short synthetic text prompt. Tests do not send document text, annotations, screenshots, chat history, API keys, or authorization headers back to the renderer. A successful text test records non-sensitive `lastTest` metadata on saved connections; it does not prove image capability. Image capability verification is a separate user action using Knowex's built-in black-dot PNG.

Before sending a question, `AIService` checks whether the active request includes images and whether the active connection declares image support. If a text-only connection receives an image request, Knowex fails before calling the provider and does not drop images, switch providers, or wait for a provider-specific error.

## Change rules

1. Renderer code never reads the file system, calls Zotero directly, starts LibreOffice, or handles a raw API key outside the settings form.
2. Every privileged operation has a named channel, a Zod-validated input, a preload method, and a focused main-process handler.
3. Coordinates remain normalized to the rendered page. Zoom and canvas resolution must not change an annotation anchor.
4. Existing workspace JSON and Markdown formats remain readable. Data-contract changes require a versioned migration.
5. Workspace writes use relative paths and atomic replacement for an existing index or note.
6. Zotero Local API access is GET-only. Web API writes require encrypted credentials and an explicit user action.
7. A module should have one reason to change. When a component starts owning unrelated state, extract a feature component or application hook before adding another path.
8. Prefer pure mapping and validation functions. Add focused tests around external formats and persisted data.
9. Temporary capture files are staging data only. The workspace index owns Trash metadata; screenshot assets remain at their portable path until restoration expires or permanent deletion is confirmed.
10. Exa credentials, provider JSON, HTTP behavior, and response mapping remain inside the Exa module. Other features consume renderer-safe source DTOs only.

## Workspace contract

```text
Workspace/
  assets/regions/YYYY-MM-DD/<asset-id>.png
  notes/<document-id>.md
  notes/Zotero/<collection path>/<document-id>.md
  .knowex/index.json
  .knowex/tmp/
  .knowex/imports/*.pdf
```

The JSON index is a rebuildable local index and contains the 30-day annotation Trash. Markdown and PNG files are the portable record. Highlights and underlines retain selected text and normalized rectangles; positioned notes retain a normalized point. Capture bytes are staged atomically through `.knowex/tmp` and can be cleared on exit. Knowex does not modify the source PDF.

## Product boundary

Included: paged and continuous reading, navigation and fuzzy search, themes, read-aloud, split view, static presentation conversion, screenshots, highlights, underlines, page notes, annotation-grounded chat, Markdown projection, Zotero metadata and annotation import, confirmed Zotero child-note export, and optional academic-first Exa retrieval with temporary content inspection.

Excluded: OCR, whole-document upload, RAG or vector indexing, Exa-result persistence or AI summarization, direct Zotero database writes, mutation of embedded PDF annotations, cloud accounts, collaboration, and a second literature-management database.
