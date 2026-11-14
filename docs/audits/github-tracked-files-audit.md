# Knowex GitHub Tracked Files Audit

Date: 2026-08-02

## Scope

This audit checks the files currently known to Git before publishing the Knowex repository to GitHub. It separates source files that should be committed from generated artifacts that should remain local or be attached to a GitHub Release.

## Git State

- Current branch: `feature/local-ai-cli`
- Configured remotes: none detected
- Commit history: 1 commit
- Current tracked file count: 139
- Current tracked file size total: 835,244 bytes
- Largest tracked file: `package-lock.json` at 239,386 bytes
- Tracked files above 1 MB: none

## Tracked File Verdict

Tracked content is small and source-oriented. The tracked set contains application source, tests, documentation, package metadata, TypeScript/Electron configuration, and license/security documentation.

No tracked build output, dependency directory, installer, unpacked Electron app, archive, crash dump, local environment file, or database file was found.

## Untracked Source Candidates

The working tree contains untracked files that appear intentional and should be reviewed for inclusion before publishing:

- `docs/AI_CONNECTIONS.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/audits/2026-07-31-ai-security-audit.md`
- `docs/audits/Knowex_AI连接管理页面_UX专项检查报告.md`
- `docs/audits/Knowex_云端AI_API接入可用性专项审计报告.md`
- `resources/ai-test/knowex-vision-test-black-dots.png`
- New AI connection, endpoint policy, model discovery, runtime smoke, credential, process runner, IPC trust, and renderer AI settings tests/source files under `src/`

These are not generated artifacts. If they are part of the intended release state, they should be staged and committed together with the related changes.

## Ignored Artifact Boundary

The following high-volume local directories are ignored and should not be committed:

- `node_modules/`
- `out/`
- `release/`
- `dist/`
- `coverage/`
- `build/`

The local workspace is large mostly because of ignored dependency and release output directories, not because of tracked Git content.

## Required Action Before Upload

Review and stage the intended source, test, documentation, and resource changes. Do not stage ignored generated artifacts or installer output.
