import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import { CompareTargetStore, compareTargetFilePath } from './compare-target-store'
import { resolveWorkspaceCompareTarget } from './compare-target'

vi.mock('../../../main/git/repo-default-base-ref', () => ({
  getBaseRefDefault: vi.fn()
}))

const key = {
  hostId: 'host-a',
  worktreePath: '/ws',
  repositoryPath: 'libs/core',
  branch: 'feature'
}

describe('workspace compare target', () => {
  let dir: string

  afterEach(() => {
    vi.mocked(getBaseRefDefault).mockReset()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prefers a saved override, then the upstream default, then unset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const store = new CompareTargetStore(compareTargetFilePath(dir))
    store.set(key, 'refs/heads/trunk')
    vi.mocked(getBaseRefDefault).mockResolvedValue('origin/main')
    await expect(
      resolveWorkspaceCompareTarget({
        store,
        key,
        repoAbsolutePath: '/ws/libs/core',
        gitOptions: {}
      })
    ).resolves.toEqual({ ref: 'refs/heads/trunk', source: 'override' })
    expect(getBaseRefDefault).not.toHaveBeenCalled()

    store.set(key, null)
    await expect(
      resolveWorkspaceCompareTarget({
        store,
        key,
        repoAbsolutePath: '/ws/libs/core',
        gitOptions: {}
      })
    ).resolves.toEqual({ ref: 'origin/main', source: 'default' })

    vi.mocked(getBaseRefDefault).mockResolvedValue(null)
    await expect(
      resolveWorkspaceCompareTarget({
        store,
        key,
        repoAbsolutePath: '/ws/libs/core',
        gitOptions: {}
      })
    ).resolves.toEqual({ ref: null, source: 'unset' })
  })

  it('writes the host key atomically and drops a failed rename', () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const store = new CompareTargetStore(filePath)
    store.set(key, 'origin/main')
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      version: 1,
      entries: [{ ...key, ref: 'origin/main' }]
    })
    store.set(key, null)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ version: 1, entries: [] })

    writeFileSync(filePath, '{')
    expect(store.read()).toEqual([])
    rmSync(filePath)
    mkdirSync(filePath)
    expect(() => store.set(key, 'origin/main')).toThrow()
    expect(readdirSync(join(dir, 'fork')).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
