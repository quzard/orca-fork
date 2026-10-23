import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type * as NodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const inject = vi.hoisted(() => ({
  beforeTempWrite: null as null | ((actual: typeof NodeFs) => void)
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>()
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      const path = String(args[0])
      if (path.endsWith('.tmp') && inject.beforeTempWrite) {
        const hook = inject.beforeTempWrite
        inject.beforeTempWrite = null
        hook(actual)
      }
      return actual.writeFileSync(...args)
    }
  }
})
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

describe('workspace compare target', () => {
  let dir: string

  afterEach(() => {
    inject.beforeTempWrite = null
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(store.set(key, 'origin/main')).rejects.toThrow()
    warn.mockRestore()
    expect(readdirSync(join(dir, 'fork')).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('merges a key written between the read and the rename', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const store = new CompareTargetStore(filePath)
    const foreign = { ...key, repositoryPath: 'app', ref: 'origin/develop' }
    inject.beforeTempWrite = (actual) => {
      actual.writeFileSync(filePath, `${JSON.stringify({ version: 1, entries: [foreign] })}\n`, {
        encoding: 'utf8'
      })
    }
    await store.set(key, 'origin/main')
    expect(
      store
        .read()
        .map((entry) => entry.ref)
        .sort()
    ).toEqual(['origin/develop', 'origin/main'])
  })

  it('leaves an unreadable file in place', async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-compare-'))
    const filePath = compareTargetFilePath(dir)
    const store = new CompareTargetStore(filePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, '{')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(store.set(key, 'origin/main')).rejects.toThrow(/unreadable/)
    expect(readFileSync(filePath, 'utf8')).toBe('{')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
