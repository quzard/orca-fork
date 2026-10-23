import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import { CompareTargetStore, compareTargetFilePath } from './compare-target-store'
import { clearWorkspaceCompareTargetCache, resolveWorkspaceCompareTarget } from './compare-target'

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
    clearWorkspaceCompareTargetCache()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prefers a saved override, then the upstream default, then unset', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const store = new CompareTargetStore(compareTargetFilePath(dir))
    await store.set(key, 'refs/heads/trunk')
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

    await store.set(key, null)
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
        gitOptions: {},
        refresh: true
      })
    ).resolves.toEqual({ ref: null, source: 'unset' })
  })

  it('reuses the default base until HEAD changes or refresh is asked', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const store = new CompareTargetStore(compareTargetFilePath(dir))
    vi.mocked(getBaseRefDefault).mockResolvedValue('origin/main')
    const args = {
      store,
      key,
      repoAbsolutePath: '/ws/libs/core',
      gitOptions: {},
      head: 'aaa'
    }
    await resolveWorkspaceCompareTarget(args)
    await resolveWorkspaceCompareTarget(args)
    expect(getBaseRefDefault).toHaveBeenCalledTimes(1)
    await resolveWorkspaceCompareTarget({ ...args, head: 'bbb' })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(2)
    await resolveWorkspaceCompareTarget({ ...args, head: 'bbb', refresh: true })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(3)
  })

  it('keeps both overrides when two stores write at once', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const other = { ...key, repositoryPath: 'app' }
    const left = new CompareTargetStore(filePath)
    const right = new CompareTargetStore(filePath)
    await Promise.all([left.set(key, 'origin/main'), right.set(other, 'origin/develop')])
    expect(
      left
        .read()
        .map((entry) => entry.ref)
        .sort()
    ).toEqual(['origin/develop', 'origin/main'])
  })

  it('writes the host key atomically and drops a failed rename', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const store = new CompareTargetStore(filePath)
    await store.set(key, 'origin/main')
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      version: 1,
      entries: [{ ...key, ref: 'origin/main' }]
    })
    await store.set(key, null)
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ version: 1, entries: [] })

    writeFileSync(filePath, '{')
    expect(store.read()).toEqual([])
    rmSync(filePath)
    mkdirSync(filePath)
    await expect(store.set(key, 'origin/main')).rejects.toThrow()
    expect(readdirSync(join(dir, 'fork')).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
