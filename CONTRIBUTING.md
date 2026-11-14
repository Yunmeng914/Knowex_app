# Contributing

1. Read `docs/ARCHITECTURE.md` before changing module boundaries.
2. Keep privileged operations in `src/main` and expose the smallest possible typed IPC contract.
3. Add or update tests for pure storage, Markdown, coordinate, and adapter logic.
4. Run `npm run typecheck`, `npm run test`, and `npm run build` before opening a pull request.
5. Do not add OCR, RAG, cloud storage, Zotero write-back, or library-management scope without an accepted product proposal.

Use focused commits and explain user-visible behavior, data migrations, and manual verification in the pull request.
