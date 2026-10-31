import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { lock } from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBaseRefDefault } from '../../../main/git/repo-default-base-ref'
import { CompareTargetStore, compareTargetFilePath } from './compare-target-store'
import {
  clearWorkspaceCompareTargetCache,
  DEFAULT_BASE_CACHE_LIMIT,
  DEFAULT_BASE_CACHE_TTL_MS,
  resolveWorkspaceCompareTarget
} from './compare-target'

vi.mock('../../../main/git/repo-default-base-ref', () => ({
  getBaseRefDefault: vi.fn()
}))

const key = {
  hostId: 'host-a',
  worktreePath: '/ws',
  repositoryPath: 'libs/core',
  branch: 'feature'
}

async function refs(store: CompareTargetStore): Promise<string[]> {
  return (await store.read()).map((entry) => entry.ref).sort()
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
    const args = { store, key, repoAbsolutePath: '/ws/libs/core', gitOptions: {} }
    await expect(resolveWorkspaceCompareTarget(args)).resolves.toEqual({
      ref: 'refs/heads/trunk',
      source: 'override'
    })
    expect(getBaseRefDefault).not.toHaveBeenCalled()

    await store.set(key, null)
    await expect(resolveWorkspaceCompareTarget(args)).resolves.toEqual({
      ref: 'origin/main',
      source: 'default'
    })

    vi.mocked(getBaseRefDefault).mockResolvedValue(null)
    await expect(resolveWorkspaceCompareTarget({ ...args, refresh: true })).resolves.toEqual({
      ref: null,
      source: 'unset'
    })
  })

  it('reuses the default base until HEAD changes or refresh is asked, detached HEAD too', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const store = new CompareTargetStore(compareTargetFilePath(dir))
    vi.mocked(getBaseRefDefault).mockResolvedValue('origin/main')
    const args = { store, key, repoAbsolutePath: '/ws/libs/core', gitOptions: {}, head: 'aaa' }
    await resolveWorkspaceCompareTarget(args)
    await resolveWorkspaceCompareTarget(args)
    expect(getBaseRefDefault).toHaveBeenCalledTimes(1)
    await resolveWorkspaceCompareTarget({ ...args, head: 'bbb' })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(2)
    await resolveWorkspaceCompareTarget({ ...args, head: 'bbb', refresh: true })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(3)

    // 子模块常是分离 HEAD：没有分支也不能每轮都重新探测默认基线。
    const detached = { ...args, key: { ...key, branch: '' } }
    await resolveWorkspaceCompareTarget(detached)
    await resolveWorkspaceCompareTarget(detached)
    expect(getBaseRefDefault).toHaveBeenCalledTimes(4)
  })

  it('forgets a default base after the ttl and caps how many it keeps', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const store = new CompareTargetStore(compareTargetFilePath(dir))
    vi.mocked(getBaseRefDefault).mockResolvedValue('origin/main')
    const args = {
      store,
      key,
      repoAbsolutePath: '/ws/libs/core',
      gitOptions: {},
      head: 'aaa',
      now: 0
    }
    await resolveWorkspaceCompareTarget(args)
    await resolveWorkspaceCompareTarget({ ...args, now: DEFAULT_BASE_CACHE_TTL_MS - 1 })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(1)
    await resolveWorkspaceCompareTarget({ ...args, now: DEFAULT_BASE_CACHE_TTL_MS })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(2)

    vi.mocked(getBaseRefDefault).mockClear()
    for (let index = 0; index < DEFAULT_BASE_CACHE_LIMIT + 1; index += 1) {
      await resolveWorkspaceCompareTarget({
        ...args,
        key: { ...key, branch: `branch-${index}` },
        now: DEFAULT_BASE_CACHE_TTL_MS
      })
    }
    expect(getBaseRefDefault).toHaveBeenCalledTimes(DEFAULT_BASE_CACHE_LIMIT + 1)
    await resolveWorkspaceCompareTarget({
      ...args,
      key: { ...key, branch: 'branch-1' },
      now: DEFAULT_BASE_CACHE_TTL_MS
    })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(DEFAULT_BASE_CACHE_LIMIT + 1)
    await resolveWorkspaceCompareTarget({
      ...args,
      key: { ...key, branch: 'branch-0' },
      now: DEFAULT_BASE_CACHE_TTL_MS
    })
    expect(getBaseRefDefault).toHaveBeenCalledTimes(DEFAULT_BASE_CACHE_LIMIT + 2)
  })

  it('keeps both overrides when two stores write at once', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const other = { ...key, repositoryPath: 'app' }
    const left = new CompareTargetStore(filePath)
    const right = new CompareTargetStore(filePath)
    await Promise.all([left.set(key, 'origin/main'), right.set(other, 'origin/develop')])
    expect(await refs(left)).toEqual(['origin/develop', 'origin/main'])
  })

  // 另一个进程（共用 userData 的 orca serve）拿着锁写入时，这边等它写完再合并，不会盖掉。
  it('waits for a lock another process holds and keeps what it wrote', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    mkdirSync(dirname(filePath), { recursive: true })
    const release = await lock(filePath, { realpath: false })
    const store = new CompareTargetStore(filePath)
    const pending = store.set(key, 'origin/main')
    const foreign = { ...key, repositoryPath: 'app', ref: 'origin/develop' }
    writeFileSync(filePath, `${JSON.stringify({ version: 1, entries: [foreign] })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await refs(store)).toEqual(['origin/develop'])
    await release()
    await pending
    expect(await refs(store)).toEqual(['origin/develop', 'origin/main'])
    expect(readdirSync(dirname(filePath)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('writes the host key and leaves an unreadable or unknown file in place', async () => {
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

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // 坏 JSON、别的格式、以后的版本都不拿空表覆盖。
    for (const body of ['{', '[]', '{"version":2,"entries":[]}']) {
      writeFileSync(filePath, body)
      expect(await store.read()).toEqual([])
      await expect(store.set(key, 'origin/main')).rejects.toThrow(/unreadable/)
      expect(readFileSync(filePath, 'utf8')).toBe(body)
    }
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    expect(readdirSync(dirname(filePath)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
