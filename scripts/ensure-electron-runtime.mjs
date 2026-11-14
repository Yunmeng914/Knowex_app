/**
 * Electron runtime integrity check used by setup, dev, and preview commands.
 *
 * Project-root and existence rules come from `environment-utils.mjs`, while
 * this file exclusively owns Electron's platform-specific executable and
 * `path.txt` repair. The bundled Electron installer is the only repair path.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathExists, PROJECT_ROOT } from './environment-utils.mjs'

const electronDirectory = path.join(PROJECT_ROOT, 'node_modules', 'electron')
const pathFile = path.join(electronDirectory, 'path.txt')
const executableRelativePath =
  process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
      : 'electron'
const executablePath = path.join(electronDirectory, 'dist', executableRelativePath)

/** Keep Electron's registration file consistent with the platform runtime. */
async function repairPathFile() {
  const currentValue = await readFile(pathFile, 'utf8').catch(() => '')
  if (currentValue !== executableRelativePath) {
    await writeFile(pathFile, executableRelativePath, 'utf8')
    console.log('Electron runtime registration repaired.')
  }
}

if (!(await pathExists(electronDirectory))) {
  throw new Error('Electron dependency is missing. Run `npm install` first.')
}

if (!(await pathExists(executablePath))) {
  const installerPath = path.join(electronDirectory, 'install.js')
  if (!(await pathExists(installerPath))) {
    throw new Error('Electron installer is missing. Run `npm install` first.')
  }

  console.log('Electron runtime is incomplete. Running the bundled installer...')
  const result = spawnSync(process.execPath, [installerPath], {
    cwd: electronDirectory,
    stdio: 'inherit'
  })

  if (result.status !== 0 || !(await pathExists(executablePath))) {
    throw new Error(
      'Electron runtime installation failed. Check the network or proxy, then run `npm run prepare:electron` again.'
    )
  }
}

await repairPathFile()
