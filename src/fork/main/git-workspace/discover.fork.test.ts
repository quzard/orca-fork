import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
    const ws = join(root, 'ws')
    initRepo(ws)
    writeFileSync(join(ws, '.gitignore'), 'app/\nlibs/\n')
    initRepo(join(ws, 'app'))
    initRepo(join(ws, 'libs/core'))
    const bare = join(root, 'core.git')
    execFileSync('git', ['init', '--bare', '-b', 'main', bare], { stdio: 'pipe' })
    git(join(ws, 'libs/core'), ['remote', 'add', 'origin', bare])
    git(join(ws, 'libs/core'), ['push', '-u', 'origin', 'main'])
    git(join(ws, 'libs/core'), ['checkout', '-b', 'feature'])
    writeFileSync(join(ws, 'libs/core/feature.txt'), 'ahead\n')
    git(join(ws, 'libs/core'), ['add', 'feature.txt'])
    git(join(ws, 'libs/core'), ['commit', '-m', 'feature'])
    initRepo(join(ws, 'libs/core/plugins/x'))
    const base = join(root, 'base')
    initRepo(base)
    git(base, ['worktree', 'add', join(ws, 'svc/api')])
    initRepo(join(ws, 'vendor/sub'))
    mkdirSync(join(ws, 'vendor/empty'), { recursive: true })
    writeFileSync(
      join(ws, '.gitmodules'),
      '[submodule "app"]\n\tpath = app\n\turl = ../app.git\n[submodule "sub"]\n\tpath = vendor/sub\n\turl = ../sub.git\n[submodule "empty"]\n\tpath = vendor/empty\n\turl = ../empty.git\n'
    )
    initRepo(join(ws, 'node_modules/pkg'))
    const outside = join(root, 'outside')
    initRepo(outside)
    symlinkSync(outside, join(ws, 'linked-out'))
    return ws
  }

  it('finds nested repos, worktrees and submodules, and skips ignored markers', async () => {
    const ws = await layout()
    const found = await discoverWorkspaceRepositories(ws)
    const byPath = new Map(
      found.repositories.map((repository) => [repository.repositoryPath, repository])
    )
    expect([...byPath.keys()].sort()).toEqual([
      '',
      'app',
      'libs/core',
      'libs/core/plugins/x',
      'svc/api',
      'vendor/empty',
      'vendor/sub'
    ])
    expect(byPath.get('')?.kind).toBe('root')
    expect(byPath.get('app')?.kind).toBe('nested')
    expect(byPath.get('svc/api')?.kind).toBe('nested')
    expect(byPath.get('vendor/sub')).toMatchObject({ kind: 'submodule', uninitialized: false })
    expect(byPath.get('vendor/empty')).toMatchObject({ kind: 'submodule', uninitialized: true })
    expect(found.repositories.map((repository) => repository.realPath)).toEqual([
      ...new Set(found.repositories.map((repository) => repository.realPath))
    ])
    expect(found.truncated).toBe(false)
    expect(found.timedOut).toBe(false)
  }, 120_000)

  it('keeps the root when the count cap is one and does not cache a timed-out scan', async () => {
    const ws = await layout()
    const capped = await discoverWorkspaceRepositories(ws, { maxRepos: 1, refresh: true })
    expect(capped.truncated).toBe(true)
    expect(capped.repositories.map((repository) => repository.repositoryPath)).toEqual([''])

    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 20_000
      return now
    })
    const timed = await discoverWorkspaceRepositories(ws, { refresh: true, timeoutMs: 15_000 })
    expect(timed.timedOut).toBe(true)
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
