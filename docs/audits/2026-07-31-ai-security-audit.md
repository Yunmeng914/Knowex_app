# AI/API security audit - 2026-07-31

This audit records the security hardening implemented for Knowex AI/API connections on 2026-07-31.

## Implemented controls

- Trusted IPC sender validation is applied to privileged workspace, document, region, settings, AI, and Zotero handlers.
- Cloud API keys are bound to a credential destination fingerprint: provider, transport, auth scheme, request origin, and model-list origin.
- Endpoint policy rejects non-HTTPS remote endpoints, credentials in URLs, fragments, secret query parameters, official-provider third-party origins, and private or metadata custom endpoints.
- Credentialed fetches use `redirect: "error"` so Authorization headers are not forwarded through automatic redirects.
- AI requests are checked against a local total budget before provider invocation.
- Model discovery reads model lists only and no longer probes candidate models.
- Prompt building keeps annotation evidence, chat history, and the current question separated so CLI prompts do not duplicate history.
- Test results store structured, sanitized diagnostics without API keys, Authorization headers, images, full prompts, or local user-profile paths.

## Verification

The automated suite uses mock connectors and local fake servers only. No real API keys or paid provider requests are used by these tests.

Manual real-account verification is still required before claiming a provider is usable in production.
