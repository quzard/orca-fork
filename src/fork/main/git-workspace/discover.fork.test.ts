import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearWorkspaceRepositoryDiscoveryCache, discoverWorkspaceRepositories } from './discover'

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], {
    cwd,
    stdio: 'pipe'
  })
}

function initRepo(path: string): void {
  mkdirSync(path, { recursive: true })
  git(path, ['init', '-b', 'main'])
  writeFileSync(join(path, 'README'), 'ok\n')
  git(path, ['add', 'README'])
  git(path, ['commit', '-m', 'init'])
}

describe('workspace repository discovery', () => {
  let root = ''

  afterEach(() => {
    clearWorkspaceRepositoryDiscoveryCache()
    vi.restoreAllMocks()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  async function layout(): Promise<string> {
    root = mkdtempSync(join(tmpdir(), 'orca-ws-'))
    const ws = join(root, 'task-demo')
    initRepo(ws)
    // 根仓库把直接子检出忽略掉时仍然要发现它。
    writeFileSync(join(ws, '.gitignore'), 'demo-api/\n')
    initRepo(join(ws, 'demo-api'))
    initRepo(join(ws, 'demo-api', 'vendor', 'demo-lib'))
    writeFileSync(
      join(ws, 'demo-api', '.gitmodules'),
      '[submodule "demo-lib"]\n\tpath = vendor/demo-lib\n\turl = ../demo-lib.git\n'
    )
    const web = join(root, 'demo-web-src')
    initRepo(web)
    git(web, ['worktree', 'add', join(ws, 'demo-web')])
    git(web, ['worktree', 'add', join(ws, 'svc', 'api')])
    mkdirSync(join(ws, 'demo-empty'), { recursive: true })
    writeFileSync(
      join(ws, '.gitmodules'),
      '[submodule "demo-api"]\n\tpath = demo-api\n\turl = ../demo-api.git\n[submodule "demo-empty"]\n\tpath = demo-empty\n\turl = ../demo-empty.git\n[submodule "demo-lib"]\n\tpath = demo-api/vendor/demo-lib\n\turl = ../demo-lib.git\n'
    )
    initRepo(join(ws, 'node_modules'))
    initRepo(join(ws, 'node_modules', 'pkg'))
    initRepo(join(ws, '.demo-cache'))
    const outside = join(root, 'outside')
    initRepo(outside)
    symlinkSync(outside, join(ws, 'linked-out'))
    // 指回工作区内部的深层检出。目录项是软链，realpath 仍在工作区里。
    symlinkSync(join(ws, 'demo-api', 'vendor', 'demo-lib'), join(ws, 'linked-in'))
    return ws
  }

  // Real git builds several repositories here; process spawns are slow on Windows runners.
  it('lists a first-level worktree and does not walk into a child repository', async () => {
    const ws = await layout()
    const found = await discoverWorkspaceRepositories(ws)
    const byPath = new Map(
      found.repositories.map((repository) => [repository.repositoryPath, repository])
    )
    expect([...byPath.keys()].sort()).toEqual(['', 'demo-api', 'demo-empty', 'demo-web'])
    expect(byPath.get('')?.kind).toBe('root')
    expect(byPath.get('demo-api')).toMatchObject({ kind: 'nested', uninitialized: false, depth: 1 })
    expect(byPath.get('demo-web')).toMatchObject({ kind: 'nested', uninitialized: false, depth: 1 })
    expect(statSync(join(ws, 'demo-web', '.git')).isFile()).toBe(true)
    // 根 .gitmodules 里已检出的深层子模块不收进「其他」。删掉「已有 .git 就跳过」后它会出现。
    expect(byPath.has('demo-api/vendor/demo-lib')).toBe(false)
    expect(byPath.has('svc/api')).toBe(false)
    expect(byPath.has('node_modules')).toBe(false)
    expect(byPath.has('node_modules/pkg')).toBe(false)
    expect(byPath.has('.demo-cache')).toBe(false)
    expect(byPath.has('linked-out')).toBe(false)
    // 软链指向工作区内部也不列。去掉「软链目录不跟」后，demo-lib 会借 linked-in 出现。
    expect(byPath.has('linked-in')).toBe(false)
    // 未初始化子模块留在结果里，界面收进「其他」，不作为普通仓库栏。
    expect(byPath.get('demo-empty')).toMatchObject({ kind: 'submodule', uninitialized: true })
    expect(found.repositories.map((repository) => repository.realPath)).toEqual([
      ...new Set(found.repositories.map((repository) => repository.realPath))
    ])
    expect(found.truncated).toBe(false)
    expect(found.timedOut).toBe(false)
  }, 120_000)

  // Real git builds several repositories here; process spawns are slow on Windows runners.
  it('keeps the root when the count cap is one and lists again after a timed-out scan', async () => {
    const ws = await layout()
    const capped = await discoverWorkspaceRepositories(ws, { maxRepos: 1, refresh: true })
    expect(capped.truncated).toBe(true)
    expect(capped.repositories.map((repository) => repository.repositoryPath)).toEqual([''])

    let now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 20_000
      return now
    })
    const timed = await discoverWorkspaceRepositories(ws, { refresh: true, timeoutMs: 15_000 })
    expect(timed.timedOut).toBe(true)
    clock.mockImplementation(() => now)
    // 状态、diff 只查成员：截断的结果在一分钟内照用，不必每个仓库再扫一遍。
    await expect(
      discoverWorkspaceRepositories(ws, {
        timeoutMs: 15_000,
        maxAgeMs: 60_000,
        acceptPartial: true
      })
    ).resolves.toBe(timed)
    vi.restoreAllMocks()
    initRepo(join(ws, 'late'))
    const rescanned = await discoverWorkspaceRepositories(ws)
    expect(rescanned.repositories.some((repository) => repository.repositoryPath === 'late')).toBe(
      true
    )
    initRepo(join(ws, 'later'))
    const held = await discoverWorkspaceRepositories(ws)
    expect(held.repositories.some((repository) => repository.repositoryPath === 'later')).toBe(
      false
    )
    const refreshed = await discoverWorkspaceRepositories(ws, { refresh: true })
    expect(refreshed.repositories.some((repository) => repository.repositoryPath === 'later')).toBe(
      true
    )
  }, 120_000)
})
