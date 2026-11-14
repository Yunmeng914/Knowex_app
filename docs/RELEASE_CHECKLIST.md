# Knowex release checklist

Before a release:

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `git diff --check`.
- Confirm `git ls-files` does not include `node_modules/`, `out/`, `release/`, `coverage/`, `dist/`, archives, installers, `.env*`, `config.json`, logs, dumps, `.asar`, or `.blockmap` files.
- Publish installers and unpacked builds through GitHub Releases or CI artifacts, not source control.
- Use mock/fake servers for automated AI tests. Do not use real API keys in CI or snapshots.
- For AI release gates, treat passing mock tests as "ready for real API verification", not proof that real providers work.
