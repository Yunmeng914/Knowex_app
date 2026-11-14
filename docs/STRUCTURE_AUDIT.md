# Structure audit — 2026-07-21

The project still followed the original process boundary: renderer → preload → typed IPC → main services. Workspace persistence and Zotero access were already on the correct side of that boundary. The maintenance risk came from several files becoming collection points for unrelated work.

## Findings and corrections

| Area | Earlier shape | Current shape |
| --- | --- | --- |
| Application UI | `App.tsx` owned document, annotation, Zotero, notice, onboarding, and layout flows | root composition plus `useDocumentSession`, `useZoteroIntegration`, and `useNotice` |
| Reader | `PdfReader.tsx` contained toolbar UI and all viewport behavior | `ReaderToolbar`, `useReaderViewport`, `PdfPageView`, navigator, and context menu have separate ownership |
| Annotation chat | chat state and rendering were embedded in `RegionPanel` | reusable `features/chat/AnnotationChat` |
| IPC | one registrar created every service and registered every channel | `app-services.ts` composes dependencies; five domain registrars expose capabilities |
| Zotero Local API | transport, raw payload types, mapping, and import orchestration shared one file | local client, raw types, pure mappers, and import adapter |
| Shared entities | all product entities lived in `models.ts` | domain files with a compatibility barrel |
| CSS | every feature rule lived in `global.css` | ordered base, shell, reader, annotation, and dialog sheets |

No workspace schema, IPC method, preload surface, or user-facing storage path changed during this refactor. The change is intended to be behavior-compatible.

## Follow-up guardrails

- Add new renderer behavior to its feature first; use `app/hooks` only for cross-feature workflows.
- Add a main-process capability to the owning service and registrar, then expose it through the existing typed contract chain.
- Keep external payload mapping pure and covered by tests.
- Split a file when a second independent reason to change appears; line count is a warning, not the design rule.
- Review `docs/ARCHITECTURE.md` whenever the dependency direction or persisted format changes.
