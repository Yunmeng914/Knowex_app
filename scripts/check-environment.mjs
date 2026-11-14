/**
 * Read-only Knowex environment diagnostics.
 *
 * Required source-development dependencies affect the exit code. LibreOffice,
 * Zotero, and local AI CLIs are reported separately because they only enable
 * optional product features. Detection shares path/npm rules with setup via
 * `environment-utils.mjs` and never sends AI requests or changes user config.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  findExecutables,
  findNpmCli,
  MINIMUM_NODE_MAJOR,
  pathExists,
  PROJECT_ROOT,
  runCaptured
} from './environment-utils.mjs'

/** Names collected here are the only checks allowed to make `doctor` fail. */
const requiredFailures = []

function report(status, label, detail) {
  console.log(`[${status}] ${label}: ${detail}`)
}

function ok(label, detail) {
  report('OK', label, detail)
}

function optional(label, detail) {
  report('--', label, detail)
}

function requiredFailure(label, detail) {
  report('!!', label, detail)
  requiredFailures.push(label)
}

async function findLibreOffice() {
  const fromPath = findExecutables(process.platform === 'win32' ? 'soffice.exe' : 'soffice')
  if (fromPath[0]) return fromPath[0]
  if (process.platform !== 'win32') return undefined

  const conventionalWindowsPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ]
  for (const candidate of conventionalWindowsPaths) {
    if (await pathExists(candidate)) return candidate
  }
  return undefined
}

/** A short localhost-only probe mirrors the application's Zotero readiness check. */
async function checkZotero() {
  try {
    const response = await fetch('http://localhost:23119/api/', {
      signal: AbortSignal.timeout(1_500)
    })
    if (response.ok) return { ready: true, detail: 'Zotero Local API 已就绪' }
    if (response.status === 403) return { ready: false, detail: 'Zotero 正在运行，但尚未允许本机应用通信' }
    return { ready: false, detail: `Zotero Local API 返回 HTTP ${response.status}` }
  } catch {
    return { ready: false, detail: 'Local API 未连接；启动 Zotero 并开启本机通信后可用' }
  }
}

/** Report direct executables separately because Knowex intentionally rejects shell shims. */
function reportLocalCli(label, command) {
  const candidates = findExecutables(command)
  const directExecutable = candidates.find((candidate) => candidate.toLowerCase().endsWith('.exe'))
  if (directExecutable) ok(label, directExecutable)
  else if (candidates[0]) optional(label, `检测到 ${candidates[0]}，但 Knowex 当前要求直接选择 .exe 文件`)
  else optional(label, '未检测到；仅在使用本地 AI 时需要')
}

console.log('\nKnowex 环境诊断')
console.log('\n必需环境')

if (process.platform === 'win32') ok('操作系统', 'Windows')
else optional('操作系统', `${process.platform}；Knowex 目前以 Windows 10+ 为主要支持平台`)

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor >= MINIMUM_NODE_MAJOR) ok('Node.js', process.versions.node)
else requiredFailure('Node.js', `当前为 ${process.versions.node}，需要 ${MINIMUM_NODE_MAJOR}+`)

const npmCli = await findNpmCli()
const npmVersion = npmCli ? runCaptured(process.execPath, [npmCli, '--version']) : undefined
if (npmVersion?.status === 0) ok('npm', npmVersion.stdout.trim())
else requiredFailure('npm', '无法定位或执行 npm，请检查 Node.js 安装')

if (await pathExists(path.join(PROJECT_ROOT, 'package.json'))) ok('项目目录', PROJECT_ROOT)
else requiredFailure('项目目录', '脚本无法定位 Knowex 根目录')

const modulesDirectory = path.join(PROJECT_ROOT, 'node_modules')
if (await pathExists(modulesDirectory)) ok('项目依赖', 'node_modules 已存在')
else requiredFailure('项目依赖', '尚未安装，请运行 npm run setup')

const electronDirectory = path.join(modulesDirectory, 'electron')
const electronRelativePath = process.platform === 'win32'
  ? 'electron.exe'
  : process.platform === 'darwin'
    ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
    : 'electron'
const electronExecutable = path.join(electronDirectory, 'dist', electronRelativePath)
const registeredElectronPath = await readFile(path.join(electronDirectory, 'path.txt'), 'utf8').catch(() => '')
if (await pathExists(electronExecutable) && registeredElectronPath.trim() === electronRelativePath) {
  ok('Electron', '运行时完整')
} else {
  requiredFailure('Electron', '运行时缺失或注册不完整，请运行 npm run repair:electron')
}

console.log('\n可选功能')

const libreOffice = await findLibreOffice()
if (libreOffice) ok('PPT/PPTX', `LibreOffice: ${libreOffice}`)
else optional('PPT/PPTX', '未检测到 LibreOffice；PDF 阅读不受影响')

const zotero = await checkZotero()
if (zotero.ready) ok('Zotero', zotero.detail)
else optional('Zotero', zotero.detail)

reportLocalCli('Codex CLI', 'codex')
reportLocalCli('Claude Code CLI', 'claude')

console.log('')
if (requiredFailures.length > 0) {
  console.error(`诊断未通过：${requiredFailures.join('、')}`)
  process.exitCode = 1
} else {
  console.log('必需环境检查通过。可运行 npm run dev 启动 Knowex。')
}
