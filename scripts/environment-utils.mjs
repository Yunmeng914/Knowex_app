/**
 * Shared environment primitives for Knowex maintenance scripts.
 *
 * `setup.mjs`, `check-environment.mjs`, and `ensure-electron-runtime.mjs`
 * depend on this module for project-root discovery, executable lookup, and
 * npm CLI resolution. Keeping these rules here prevents setup and diagnostics
 * from making different decisions on different Node/npm versions.
 */
import { spawnSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Absolute repository root derived from this file, never from the caller's cwd. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MINIMUM_NODE_MAJOR = 22

export async function pathExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/** Run a fixed executable without a shell and return captured output for diagnostics. */
export function runCaptured(command, args = []) {
  return spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 5_000
  })
}

/** Resolve every PATH candidate so callers can distinguish direct .exe files from shims. */
export function findExecutables(command) {
  const locator = process.platform === 'win32' ? ['where.exe', [command]] : ['which', [command]]
  const result = runCaptured(locator[0], locator[1])
  return result.status === 0
    ? result.stdout.trim().split(/\r?\n/).filter(Boolean)
    : []
}

/**
 * Locate npm's JavaScript entry point instead of launching npm.cmd through a
 * shell. `npm_execpath` covers npm scripts; the adjacent path covers direct
 * `node scripts/setup.mjs` execution on standard Node installations.
 */
export async function findNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  return undefined
}
