import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RegionRecord } from '../../shared/domain/models'
import { LocalAssetStore } from '../assets/local-asset-store'
import type { ConfigStore } from './config-store'
import { WorkspaceRepository } from './workspace-repository'

const workspaces: string[] = []

async function makeRepository(): Promise<{ path: string; repository: WorkspaceRepository }> {
  const path = join(tmpdir(), `knowex-workspace-${crypto.randomUUID()}`)
  workspaces.push(path)
  const config = { getWorkspacePath: async () => path } as unknown as ConfigStore
  const repository = new WorkspaceRepository(config)
  await repository.ensureWorkspace()
  return { path, repository }
}

function region(id: string): RegionRecord {
  const createdAt = '2026-07-23T00:00:00.000Z'
  return {
    asset: {
      id: `asset-${id}`,
      kind: 'highlight',
      anchor: { documentId: 'doc-1', pageOrSlide: 1, rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 }, zoomAtCapture: 1 },
      createdAt
    },
    note: { id, assetId: `asset-${id}`, title: '', annotation: '', tags: [], conversation: [], createdAt, updatedAt: createdAt }
  }
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('workspace lifecycle', () => {
  it('keeps deleted annotations restorable until the retention period expires', async () => {
    const { repository } = await makeRepository()
    await repository.addRegion(region('note-1'))

    const trashed = await repository.trashRegion('note-1')
    expect(await repository.listRegions('doc-1')).toEqual([])
    expect((await repository.listTrash('doc-1'))[0].region.note.id).toBe('note-1')
    expect(new Date(trashed.purgeAfter).getTime() - new Date(trashed.deletedAt).getTime()).toBe(30 * 24 * 60 * 60 * 1000)

    await repository.restoreRegion('note-1')
    expect((await repository.listRegions('doc-1')).map((item) => item.note.id)).toEqual(['note-1'])

    await repository.trashRegion('note-1')
    const purged = await repository.purgeExpiredTrash(new Date('2100-01-01T00:00:00.000Z'))
    expect(purged.map((item) => item.note.id)).toEqual(['note-1'])
    expect(await repository.listTrash('doc-1')).toEqual([])
  })

  it('stages captures in the dedicated temporary directory and can clear abandoned files', async () => {
    const { path, repository } = await makeRepository()
    const assets = new LocalAssetStore(repository)
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const saved = await assets.save(png, {
      documentId: 'doc-1', pageOrSlide: 1, rect: { x: 0, y: 0, width: 1, height: 1 }, zoomAtCapture: 1
    })

    await expect(access(join(path, ...saved.relativePath!.split('/')))).resolves.toBeUndefined()
    const temporaryDirectory = join(path, '.knowex', 'tmp')
    expect(await readdir(temporaryDirectory)).toEqual([])
    await mkdir(temporaryDirectory, { recursive: true })
    await writeFile(join(temporaryDirectory, 'abandoned.png'), 'temporary')
    await assets.cleanupTemp()
    expect(await readdir(temporaryDirectory)).toEqual([])
  })
})
