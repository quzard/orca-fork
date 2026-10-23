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
import type { OrcaRuntimeService } from '../../../main/runtime/orca-runtime'
import { RpcDispatcher } from '../../../main/runtime/rpc/dispatcher'
import type { RpcResponse } from '../../../main/runtime/rpc/core'
import { ALL_RPC_METHODS } from '../../../main/runtime/rpc/methods'
import type { RuntimeGitTarget } from '../../../main/runtime/runtime-git-command-target'
import { FORK_GIT_WORKSPACE_METHOD_NAMES } from '../../git-workspace/constants'
import { bindForkGitTargetResolver, resetForkGitTargetResolverForTests } from './bind-target'
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

describe('workspace repository RPC methods', () => {
  let root = ''
  let previous: AppEnvironment | null = null
  const dispatcher = new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 分发器只读 getRuntimeId，git 目标由 fork 解析器提供。
    runtime: { getRuntimeId: () => 'test-runtime' } as OrcaRuntimeService,
    methods: FORK_GIT_WORKSPACE_METHODS
  })

  afterEach(() => {
    resetForkGitTargetResolverForTests()
    clearWorkspaceRepositoryDiscoveryCache()
    setAppEnvironment(previous ?? appEnvironment(tmpdir()))
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  async function call(method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> {
    return dispatcher.dispatch({
      id: 'req-1',
      authToken: 'tok',
      method,
      params: { worktree: 'id:wt-1', ...params }
    })
  }

  function okResult(response: RpcResponse): {
    branch?: string
    compareTarget?: { ref: string | null; source: string }
    entries?: { path: string; area: string }[]
    repositories?: { repositoryPath: string }[]
    kind?: string
    modifiedContent?: string
    summary?: {
      status: string
      commitsAhead?: number
      headOid?: string | null
      mergeBase?: string | null
    }
  } {
    if (!response.ok || !response.result || typeof response.result !== 'object') {
      throw new Error(response.ok ? 'missing result' : response.error.message)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 只取出下面 expect 要核对的字段。
    return response.result as ReturnType<typeof okResult>
  }

  it('reads nested status, diffs and compare targets through the dispatcher', async () => {
    expect(ALL_RPC_METHODS.map((method) => method.name)).toEqual(
      expect.arrayContaining([...FORK_GIT_WORKSPACE_METHOD_NAMES])
    )
    root = mkdtempSync(join(tmpdir(), 'orca-methods-'))
    previous = hasAppEnvironment() ? getAppEnvironment() : null
    const userData = join(root, 'user-data')
    setAppEnvironment(appEnvironment(userData))
    const ws = join(root, 'ws')
    const bare = join(root, 'origin.git')
    execFileSync('git', ['init', '-b', 'main', ws], { stdio: 'pipe' })
    execFileSync('git', ['init', '--bare', '-b', 'main', bare], { stdio: 'pipe' })
    const app = join(ws, 'app')
    execFileSync('git', ['init', '-b', 'main', app], { stdio: 'pipe' })
    writeFileSync(join(app, 'README'), 'base\n')
    git(app, ['add', 'README'])
    git(app, ['commit', '-m', 'base'])
    git(app, ['remote', 'add', 'origin', bare])
    git(app, ['push', '-u', 'origin', 'main'])
    git(app, ['remote', 'set-head', 'origin', 'main'])
    git(app, ['checkout', '-b', 'feature'])
    writeFileSync(join(app, 'feature.txt'), 'ahead\n')
    git(app, ['add', 'feature.txt'])
    git(app, ['commit', '-m', 'feature'])
    writeFileSync(join(app, 'README'), 'base\nnested-edit\n')
    bindForkGitTargetResolver(async () => {
      const target = {
        executionHostId: 'local' as const,
        worktree: { path: ws, hostId: 'host-a' as const }
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 本地 git 只读 path、hostId 和 executionHostId。
      return target as unknown as RuntimeGitTarget
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

    const compare = okResult(
      await call('git.workspaceRepositories.branchCompare', {
        repositoryPath: 'app',
        baseRef: 'origin/main'
      })
    )
    expect(compare.summary?.status).toBe('ready')
    expect(compare.summary?.commitsAhead).toBeGreaterThan(0)
    expect(compare.summary?.headOid).toBeTruthy()
    expect(compare.summary?.mergeBase).toBeTruthy()

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
    expect((await call('git.workspaceRepositories.status', { repositoryPath: '../x' })).ok).toBe(
      false
    )
  }, 120_000)
})
