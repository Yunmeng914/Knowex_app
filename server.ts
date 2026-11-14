/**
 * Web server entry point for Knowex.
 *
 * Binds to 0.0.0.0:3000 (or `process.env.PORT`). Uses `src/server/create-app.ts`
 * under `tsx` in development and `dist/server.mjs` under `node server.ts` in
 * production after `npm run build`.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const port = Number(process.env.KNOWEX_PORT) || 3000
const host = '0.0.0.0'
const runningUnderTsx = process.argv.some((arg) => arg.includes('tsx'))
  || process.execArgv.some((arg) => arg.includes('tsx'))
  || Boolean(process.env._?.includes('tsx'))
  || process.env.npm_lifecycle_event === 'dev'
const isProduction = process.env.NODE_ENV === 'production'
  || (!runningUnderTsx && existsSync(resolve('dist/client/index.html')) && existsSync(resolve('dist/server.mjs')))

async function main(): Promise<void> {
  const serverModulePath = isProduction && existsSync(resolve('dist/server.mjs'))
    ? './dist/server.mjs'
    : './src/server/create-app.ts'
  const mod = await import(serverModulePath)
  const instance = await mod.createWebApp({ isProduction })

  const server = instance.app.listen(port, host, () => {
    console.log(`Knowex Web server listening at http://${host}:${port}`)
  })

  const shutdown = async (): Promise<void> => {
    server.close()
    await instance.dispose()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((error) => {
  console.error('Failed to start Knowex Web server:', error)
  process.exit(1)
})
