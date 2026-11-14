import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { RegionAsset } from '../../shared/domain/models'
import { WorkspaceRepository } from '../storage/workspace-repository'

export class LocalAssetStore {
  constructor(private readonly repository: WorkspaceRepository) {}

  async save(pngDataUrl: string, anchor: RegionAsset['anchor']): Promise<RegionAsset> {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(pngDataUrl)
    if (!match) throw new Error('The captured region is not a valid PNG image.')
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes.length < 16 || bytes.length > 25 * 1024 * 1024) {
      throw new Error('The captured region is empty or exceeds the 25 MB limit.')
    }

    const workspacePath = await this.repository.ensureWorkspace()
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const id = `R-${date.replaceAll('-', '')}-${randomUUID().slice(0, 8)}`
    const relativePath = `assets/regions/${date}/${id}.png`
    const absolutePath = join(workspacePath, ...relativePath.split('/'))
    const temporaryPath = join(workspacePath, '.knowex', 'tmp', `${id}.png`)
    await mkdir(resolve(absolutePath, '..'), { recursive: true })
    await mkdir(resolve(temporaryPath, '..'), { recursive: true })
    try {
      await writeFile(temporaryPath, bytes, { flag: 'wx' })
      await rename(temporaryPath, absolutePath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }

    return {
      id,
      kind: 'snapshot',
      relativePath,
      mimeType: 'image/png',
      anchor,
      createdAt: now.toISOString(),
      previewDataUrl: pngDataUrl
    }
  }

  async withPreview(asset: RegionAsset): Promise<RegionAsset> {
    if (!asset.relativePath || (asset.kind && asset.kind !== 'snapshot')) return asset
    const bytes = await readFile(await this.safeAbsolutePath(asset.relativePath))
    return { ...asset, previewDataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
  }

  async readDataUrl(asset: RegionAsset): Promise<string> {
    if (!asset.relativePath || (asset.kind && asset.kind !== 'snapshot')) {
      throw new Error('Visual questions require a screenshot annotation.')
    }
    return (await this.withPreview(asset)).previewDataUrl as string
  }

  async delete(asset: RegionAsset): Promise<void> {
    if (!asset.relativePath || (asset.kind && asset.kind !== 'snapshot')) return
    await rm(await this.safeAbsolutePath(asset.relativePath), { force: true })
  }

  async cleanupTemp(): Promise<void> {
    const workspacePath = await this.repository.ensureWorkspace()
    const temporaryDirectory = join(workspacePath, '.knowex', 'tmp')
    await rm(temporaryDirectory, { recursive: true, force: true })
    await mkdir(temporaryDirectory, { recursive: true })
  }

  private async safeAbsolutePath(relativePath: string): Promise<string> {
    if (isAbsolute(relativePath)) throw new Error('Workspace assets must use relative paths.')
    const workspacePath = await this.repository.ensureWorkspace()
    const absolutePath = resolve(workspacePath, relativePath)
    const fromWorkspace = relative(workspacePath, absolutePath)
    if (isAbsolute(fromWorkspace) || fromWorkspace.startsWith(`..${sep}`) || fromWorkspace === '..') {
      throw new Error('Asset path escapes the selected workspace.')
    }
    return absolutePath
  }
}
