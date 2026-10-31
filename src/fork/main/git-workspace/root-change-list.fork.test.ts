import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppEnvironment } from '../../../shared/app-environment'
import {
  getAppEnvironment,
  hasAppEnvironment,
  setAppEnvironment
} from '../../../shared/app-environment'
import type { RuntimeGitTarget } from '../../../main/runtime/runtime-git-command-target'
import { repositoryHasChanges } from '../../source-control/repo-order'
import { clearWorkspaceRepositoryDiscoveryCache } from './discover'
import { readWorkspaceRepositoryStatus, type WorkspaceRpcCaller } from './reads'

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], {
    cwd,
    stdio: 'pipe'
  })
}

function initRepo(path: string): void {
  execFileSync('git', ['init', '-b', 'main', path], { stdio: 'pipe' })
  writeFileSync(join(path, 'README'), 'ok\n')
  git(path, ['add', 'README'])
  git(path, ['commit', '-m', 'init'])
}

function appEnvironment(userData: string): AppEnvironment {
  return {
    getPath: () => userData,
    getAppPath: () => userData,
    getVersion: () => '0.0.0-test',
    isPackaged: () => false,
    onWillQuit: () => undefined,
    exit: () => undefined,
    getAppMetrics: () => []
  }
}

function norm(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function localCaller(ws: string): WorkspaceRpcCaller {
  const target = {
    executionHostId: 'local' as const,
    worktree: { path: ws, hostId: 'host-a' as const }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 本地 git 只读 path、hostId 和 executionHostId。
    runtime: { resolveRuntimeGitTarget: async () => target as unknown as RuntimeGitTarget }
  }
}

function registerCheckedOutSubmodule(ws: string, name: string, source: string): void {
  const oid = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8'
  }).trim()
  writeFileSync(
    join(ws, '.gitmodules'),
    `[submodule "${name}"]\n\tpath = ${name}\n\turl = ../${name}-src\n`
  )
  git(ws, ['add', '.gitmodules'])
  git(ws, ['update-index', '--add', '--cacheinfo', `160000,${oid},${name}`])
  git(ws, ['commit', '-m', `add ${name}`])
  git(ws, ['-c', 'protocol.file.allow=always', 'clone', source, name])
}

describe('root repository change list', () => {
  let root = ''
  let previous: AppEnvironment | null = null

  afterEach(() => {
    clearWorkspaceRepositoryDiscoveryCache()
    setAppEnvironment(previous ?? appEnvironment(tmpdir()))
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('drops nested repository directories and keeps a real untracked root file', async () => {
    root = mkdtempSync(join(tmpdir(), 'orca-root-status-'))
    previous = hasAppEnvironment() ? getAppEnvironment() : null
    setAppEnvironment(appEnvironment(join(root, 'user-data')))
    const ws = join(root, 'task-demo')
    initRepo(ws)
    const api = join(ws, 'demo-api')
    initRepo(api)
    writeFileSync(join(api, 'local.txt'), 'inside\n')
    const web = join(root, 'demo-web-src')
    initRepo(web)
    git(web, ['worktree', 'add', join(ws, 'demo-web')])
    writeFileSync(join(ws, 'demo-web', 'page.txt'), 'page\n')
    writeFileSync(join(ws, 'README'), 'ok\nedit\n')
    writeFileSync(join(ws, 'task-demo.txt'), 'keep\n')
    writeFileSync(join(ws, 'demo-api-notes.txt'), 'prefix\n')
    const caller = localCaller(ws)

    const rootStatus = await readWorkspaceRepositoryStatus(caller, 'id:wt-1', '', 'status', false)
    const paths = rootStatus.entries.map((entry) => norm(entry.path))
    expect(paths).toContain('task-demo.txt')
    expect(paths).toContain('demo-api-notes.txt')
    expect(paths).toContain('README')
    expect(paths.some((path) => path === 'demo-api' || path.startsWith('demo-api/'))).toBe(false)
    expect(paths.some((path) => path === 'demo-web' || path.startsWith('demo-web/'))).toBe(false)

    const nested = await readWorkspaceRepositoryStatus(
      caller,
      'id:wt-1',
      'demo-api',
      'status',
      false
    )
    expect(nested.entries.map((entry) => entry.path)).toContain('local.txt')
  }, 120_000)

  it('keeps a registered submodule gitlink and still hides a plain nested repo', async () => {
    root = mkdtempSync(join(tmpdir(), 'orca-root-gitlink-'))
    previous = hasAppEnvironment() ? getAppEnvironment() : null
    setAppEnvironment(appEnvironment(join(root, 'user-data')))
    const source = join(root, 'demo-api-src')
    initRepo(source)
    const ws = join(root, 'task-demo')
    initRepo(ws)
    registerCheckedOutSubmodule(ws, 'demo-api', source)
    writeFileSync(join(ws, 'demo-api', 'lib.txt'), 'next\n')
    git(join(ws, 'demo-api'), ['add', 'lib.txt'])
    git(join(ws, 'demo-api'), ['commit', '-m', 'lib'])
    initRepo(join(ws, 'demo-console'))
    writeFileSync(join(ws, 'task-demo.txt'), 'keep\n')
    const caller = localCaller(ws)

    const unstaged = await readWorkspaceRepositoryStatus(caller, 'id:wt-1', '', 'status', false)
    const unstagedPaths = unstaged.entries.map((entry) => norm(entry.path))
    const unstagedGitlink = unstaged.entries.find(
      (entry) => norm(entry.path) === 'demo-api' && entry.area === 'unstaged'
    )
    expect(unstagedGitlink?.status).toBe('modified')
    expect(unstagedPaths).toContain('task-demo.txt')
    expect(
      unstagedPaths.some((path) => path === 'demo-console' || path.startsWith('demo-console/'))
    ).toBe(false)
    expect(repositoryHasChanges(unstaged, undefined)).toBe(true)

    git(ws, ['add', 'demo-api'])
    const staged = await readWorkspaceRepositoryStatus(caller, 'id:wt-1', '', 'status', false)
    const stagedPaths = staged.entries.map((entry) => norm(entry.path))
    const stagedGitlink = staged.entries.find(
      (entry) => norm(entry.path) === 'demo-api' && entry.area === 'staged'
    )
    expect(stagedGitlink?.status).toBe('modified')
    expect(stagedPaths).toContain('task-demo.txt')
    expect(
      stagedPaths.some((path) => path === 'demo-console' || path.startsWith('demo-console/'))
    ).toBe(false)
    expect(repositoryHasChanges(staged, undefined)).toBe(true)
  }, 120_000)
})
