import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => tmpdir()), isPackaged: false }
}))

import type { AppEnvironment } from '../../../shared/app-environment'
import {
  getAppEnvironment,
  hasAppEnvironment,
  setAppEnvironment
} from '../../../shared/app-environment'
import { OrcaRuntimeService } from '../../../main/runtime/orca-runtime'
import { RpcDispatcher } from '../../../main/runtime/rpc/dispatcher'
import type { RpcResponse } from '../../../main/runtime/rpc/core'
import { ALL_RPC_METHODS } from '../../../main/runtime/rpc/methods'
import { FORK_GIT_WORKSPACE_METHOD_NAMES } from '../../git-workspace/constants'
import { clearWorkspaceCompareTargetCache } from './compare-target'
import { clearWorkspaceRepositoryDiscoveryCache } from './discover'
import { FORK_GIT_WORKSPACE_METHODS } from './methods'

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], {
    cwd,
    stdio: 'pipe'
  })
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

// 真的运行时：fork 方法要经过它 protected 的 resolveRuntimeGitTarget 拿到本机目标。
function localRuntime(ws: string): OrcaRuntimeService {
  const repos = [{ id: 'repo-1', path: ws, executionHostId: 'local' }]
  const store = {
    getSettings: () => ({ disabledTuiAgents: [], workspaceDir: tmpdir() }),
    getProjectHostSetups: () => [],
    getProjects: () => [],
    getRepos: () => repos,
    getRepo: (id: string) => repos.find((repo) => repo.id === id)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 目标解析只读上面这几个 store 方法。
  const runtime = new OrcaRuntimeService(store as never)
  runtime['resolveGitWorktreeSelector'] = vi.fn().mockResolvedValue({
    id: 'wt-1',
    repoId: 'repo-1',
    path: ws,
    hostId: 'local',
    git: { path: ws, branch: 'main', isBare: false, isMainWorktree: true }
  })
  return runtime
}

type OkResult = {
  branch?: string
  compareTarget?: { ref: string | null; source: string }
  entries?: { path: string; area: string }[]
  repositories?: { repositoryPath: string }[]
  kind?: string
  originalContent?: string
  modifiedContent?: string
  summary?: {
    status: string
    commitsAhead?: number
    headOid?: string | null
    mergeBase?: string | null
  }
}

function okResult(response: RpcResponse): OkResult {
  if (!response.ok || !response.result || typeof response.result !== 'object') {
    throw new Error(response.ok ? 'missing result' : response.error.message)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 只取出下面 expect 要核对的字段。
  return response.result as OkResult
}

describe('workspace repository RPC methods', () => {
  let root = ''
  let previous: AppEnvironment | null = null

  afterEach(() => {
    clearWorkspaceRepositoryDiscoveryCache()
    clearWorkspaceCompareTargetCache()
    setAppEnvironment(previous ?? appEnvironment(tmpdir()))
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Real git builds several repositories here; process spawns are slow on Windows runners.
  it('reads nested status, diffs and compare targets through the runtime', async () => {
    expect(ALL_RPC_METHODS.map((method) => method.name)).toEqual(
      expect.arrayContaining([...FORK_GIT_WORKSPACE_METHOD_NAMES])
    )
    root = mkdtempSync(join(tmpdir(), 'orca-methods-'))
    previous = hasAppEnvironment() ? getAppEnvironment() : null
    setAppEnvironment(appEnvironment(join(root, 'user-data')))
    const ws = join(root, 'ws')
    const bare = join(root, 'origin.git')
    execFileSync('git', ['init', '-b', 'main', ws], { stdio: 'pipe' })
    execFileSync('git', ['init', '--bare', '-b', 'main', bare], { stdio: 'pipe' })
    const app = join(ws, 'app')
    execFileSync('git', ['init', '-b', 'main', app], { stdio: 'pipe' })
    writeFileSync(join(app, 'README'), 'base\n')
    writeFileSync(join(app, 'old.txt'), 'moved body\n')
    git(app, ['add', 'README', 'old.txt'])
    git(app, ['commit', '-m', 'base'])
    git(app, ['remote', 'add', 'origin', bare])
    git(app, ['push', '-u', 'origin', 'main'])
    git(app, ['remote', 'set-head', 'origin', 'main'])
    git(app, ['checkout', '-b', 'feature'])
    writeFileSync(join(app, 'feature.txt'), 'ahead\n')
    git(app, ['add', 'feature.txt'])
    git(app, ['commit', '-m', 'feature'])
    writeFileSync(join(app, 'README'), 'base\nnested-edit\n')
    git(app, ['mv', 'old.txt', 'new.txt'])

    const dispatcher = new RpcDispatcher({
      runtime: localRuntime(ws),
      methods: FORK_GIT_WORKSPACE_METHODS
    })
    const call = (method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> =>
      dispatcher.dispatch({
        id: 'req-1',
        authToken: 'tok',
        method,
        params: { worktree: 'id:wt-1', ...params }
      })

    const list = okResult(await call('git.workspaceRepositories', {}))
    expect(list.repositories?.map((repository) => repository.repositoryPath).sort()).toEqual([
      '',
      'app'
    ])

    const status = okResult(
      await call('git.workspaceRepositories.status', { repositoryPath: 'app' })
    )
    expect(status.branch).toBe('refs/heads/feature')
    expect(status.compareTarget).toEqual({ ref: 'origin/main', source: 'default' })
    expect(status.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'README', area: 'unstaged' })])
    )

    const diff = okResult(
      await call('git.workspaceRepositories.diff', {
        repositoryPath: 'app',
        filePath: 'README',
        staged: false
      })
    )
    expect(diff.kind).toBe('text')
    expect(diff.modifiedContent).toContain('nested-edit')

    // 暂存的改名带上旧路径时，原始一侧是旧文件，不是一整个新增文件。
    const renamed = okResult(
      await call('git.workspaceRepositories.diff', {
        repositoryPath: 'app',
        filePath: 'new.txt',
        oldPath: 'old.txt',
        staged: true
      })
    )
    expect(renamed.originalContent).toContain('moved body')

    const compare = okResult(
      await call('git.workspaceRepositories.branchCompare', {
        repositoryPath: 'app',
        baseRef: 'origin/main'
      })
    )
    expect(compare.summary?.status).toBe('ready')
    expect(compare.summary?.commitsAhead).toBeGreaterThan(0)

    const branchDiff = okResult(
      await call('git.workspaceRepositories.branchDiff', {
        repositoryPath: 'app',
        filePath: 'feature.txt',
        compare: {
          headOid: compare.summary?.headOid,
          mergeBase: compare.summary?.mergeBase
        }
      })
    )
    expect(branchDiff.kind).toBe('text')
    expect(branchDiff.modifiedContent).toContain('ahead')

    expect(
      (
        await call('git.workspaceRepositories.setCompareTarget', {
          repositoryPath: 'app',
          branch: 'refs/heads/feature',
          ref: 'refs/heads/main'
        })
      ).ok
    ).toBe(true)
    expect(
      okResult(await call('git.workspaceRepositories.status', { repositoryPath: 'app' }))
        .compareTarget
    ).toEqual({ ref: 'refs/heads/main', source: 'override' })
    expect(
      (
        await call('git.workspaceRepositories.setCompareTarget', {
          repositoryPath: 'app',
          branch: 'refs/heads/feature',
          ref: null
        })
      ).ok
    ).toBe(true)
    expect(
      okResult(await call('git.workspaceRepositories.status', { repositoryPath: 'app' }))
        .compareTarget
    ).toEqual({ ref: 'origin/main', source: 'default' })

    // 上一轮列表之后才出现的检出：列表缓存过期后，成员查询自己重扫一次，不必等下一次列出。
    execFileSync('git', ['init', '-b', 'main', join(ws, 'late')], { stdio: 'pipe' })
    expect((await call('git.workspaceRepositories.status', { repositoryPath: 'late' })).ok).toBe(
      false
    )
    const later = Date.now() + 6_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => later)
    expect((await call('git.workspaceRepositories.status', { repositoryPath: 'late' })).ok).toBe(
      true
    )
    clock.mockRestore()
    for (const repositoryPath of ['../x', 'missing']) {
      expect((await call('git.workspaceRepositories.status', { repositoryPath })).ok).toBe(false)
    }
    expect(
      (
        await call('git.workspaceRepositories.diff', {
          repositoryPath: 'app',
          filePath: '../ws/README',
          staged: false
        })
      ).ok
    ).toBe(false)
  }, 120_000)
})
