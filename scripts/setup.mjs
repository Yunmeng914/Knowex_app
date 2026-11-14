/**
 * First-time source setup orchestrator.
 *
 * This is the single entry point documented in README.md. It validates the
 * required Node version, installs dependencies, delegates Electron repair to
 * `ensure-electron-runtime.mjs`, and finishes with `check-environment.mjs`.
 * Optional integrations never make the setup fail.
 */
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { findNpmCli, MINIMUM_NODE_MAJOR, PROJECT_ROOT } from './environment-utils.mjs'

/** Run one setup stage with inherited output and stop immediately on failure. */
function runStage(command, args, description) {
  console.log(`\n${description}`)
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    windowsHide: true,
    shell: false
  })

  if (result.error) {
    console.error(`无法执行 ${command}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Knowex 首次开发环境配置')

const currentNodeMajor = Number(process.versions.node.split('.')[0])
if (currentNodeMajor < MINIMUM_NODE_MAJOR) {
  console.error(`需要 Node.js ${MINIMUM_NODE_MAJOR} 或更高版本，当前版本为 ${process.versions.node}。`)
  process.exit(1)
}

if (process.platform !== 'win32') {
  console.warn(`当前系统为 ${process.platform}。Knowex 目前以 Windows 10+ 为主要支持平台。`)
}

const npmCli = await findNpmCli()
if (!npmCli) {
  console.error('无法定位 npm CLI，请重新安装 Node.js 22+ 后再试。')
  process.exit(1)
}

runStage(process.execPath, [npmCli, 'install'], '1/3 安装或增量更新项目依赖...')
runStage(process.execPath, ['scripts/ensure-electron-runtime.mjs'], '2/3 检查 Electron 运行时...')
runStage(process.execPath, ['scripts/check-environment.mjs'], '3/3 检查开发环境和可选集成...')

console.log('\n配置完成。运行 npm run dev 启动 Knowex。')
