# Knowex AI connections

AI is optional. "Configured" only means Knowex has enough local settings to try a request; it does not prove the provider account, model, endpoint, or image capability works.

## Status meanings

- Configured: the connection has a saved encrypted key or a local executable path.
- Text test passed: the selected endpoint and model answered a short synthetic text request.
- Image test passed: the selected model separately answered Knowex's built-in non-private black-dot PNG test.
- Model discovery: reads the model list only. It no longer runs background text probes against candidate models.
- Tests and model discovery may create a small provider API request, but tests do not save the connection automatically.
- If the provider, transport, auth scheme, request origin, or model-list origin changes, Knowex requires the API key to be entered again.

## Data sent to providers

Text annotation requests may send the selected text, annotation note, page number, current question, and current annotation chat history.

Screenshot annotation requests additionally send the current screenshot and PNG images the user explicitly attached.

Knowex does not automatically send the whole PDF, other workspace files, the Zotero database, raw config files, or API keys to the renderer.

## Custom endpoints and relays

Custom and relay endpoints receive the API key, annotation text, screenshots, current question, and chat history. Official provider presets are limited to their official API origins; third-party relays must be configured as Custom connections so this risk is explicit.

Remote custom endpoints must use HTTPS and may not target localhost, private networks, link-local, multicast, unspecified, or cloud metadata addresses. Local OpenAI-compatible services must use the explicit localhost HTTP compatible-service path.

## CLI connections

Knowex only accepts direct `.exe` paths for local CLI tools on Windows. `.cmd`, `.bat`, and `.ps1` launchers are rejected because they require a shell boundary.

Codex CLI and Claude Code CLI manage their own login state. Knowex does not read, copy, parse, or store CLI tokens. Local CLI connections are text-only until image input support is separately verified.
