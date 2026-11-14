# Security policy

Please report security issues privately to the repository maintainers rather than opening a public issue.

Knowex handles local documents and optional model credentials. Contributions must preserve context isolation, keep Node integration disabled in renderer windows, validate IPC input, avoid logging secrets or document images, and never make background uploads. A model request may include only regions the user explicitly submits.

AI API keys are encrypted in the Electron main process with `safeStorage`. Renderer, preload public DTOs, IPC return values, tests, and logs must not expose plaintext keys, encrypted key material, `encryptedSecrets`, credential fingerprints, or raw `config.json` content. Renderer may send a new key only through a validated save operation. Leaving the key blank preserves the existing encrypted key only when the credential destination fingerprint is unchanged.

Credential fingerprints bind keys to provider, transport, auth scheme, request origin, and model-list origin. If the endpoint origin, provider, transport, or auth scheme changes, Knowex requires the API key to be entered again before saving, testing, model discovery, or asking.

Model requests are routed through `AIService` and protocol-specific connectors. Cloud connectors currently cover OpenAI Responses, OpenAI Chat Completions-compatible APIs, and Anthropic Messages. Local connectors currently cover Codex CLI and Claude Code CLI. Additional providers must keep the same boundary: credentials are read only in main process code, request logs must omit prompts, document contents, images, authorization headers, executable environment details, and CLI authentication material, and connectors must receive only the current user-submitted annotation evidence.

Connection tests run in the main process with a short synthetic text prompt. Image tests use Knowex's built-in non-private black-dot PNG and are separate from text tests. They must not include user documents, annotations, screenshots, chat history, or saved API keys in renderer-visible results. Test results may store non-sensitive status, provider, transport, model, endpoint origin, message, error code, latency, and timestamp.

Cloud endpoints are validated in the main process. Official provider presets are limited to official API origins. Third-party relays must be configured as Custom connections. Remote custom endpoints must use HTTPS and must not target private networks, localhost, link-local, multicast, unspecified, or cloud metadata addresses unless the product explicitly uses local compatible-service mode.

On Windows, `safeStorage` uses system credential protection, but it cannot defend against malicious processes running with the same user privileges. Future Linux builds must reject weak plaintext safeStorage backends unless a separate risk-confirmation flow is designed.

Local CLI tools may only be invoked through `SecureProcessRunner`. The runner must use `spawn` with `shell: false`, an executable path plus argument array, a filtered environment, a per-request isolated temporary working directory, timeout/cancellation, child-process cleanup, and stdout/stderr size limits. Do not use `exec`, shell command strings, `cmd /c`, PowerShell command strings, shell pipes, redirects, or command concatenation for user prompts, annotation text, model names, or paths.

Windows local CLI paths must currently be direct `.exe` files. `.cmd`, `.bat`, `.ps1`, and other shim scripts are rejected because launching them would require a shell or script host. This is an intentional compatibility limitation in favor of the `shell: false` security boundary.

Knowex must not read, copy, parse, or store Codex CLI or Claude Code CLI login tokens, credential files, account caches, or configuration directories. If a CLI depends on its own login state, the CLI handles that state itself. Knowex may detect executable paths, run `--version`/`--help`, and run a short synthetic connection test in an isolated temporary folder.

Renderer code must not call `child_process`, `where.exe`, Codex CLI, Claude Code CLI, `safeStorage`, or raw file-system APIs. Renderer may submit only validated connection fields through preload IPC: provider, transport, name, optional model, capabilities, and one executable file path. It may not submit arbitrary CLI arguments.

Local CLI connections are text-only unless the currently installed CLI version and command help have been verified to support image file input safely. Knowex must not place screenshot data URLs or large base64 image strings into CLI prompts. Image requests against text-only CLI connections must fail before launching the CLI.

Current workstation verification: Codex CLI was found by `where.exe` but `--version` and `--help` failed with `Access is denied`, so Codex invocation remains unverified on this machine. Claude Code CLI reported `2.1.163 (Claude Code)` and documented `-p/--print` with JSON output in `--help`.
