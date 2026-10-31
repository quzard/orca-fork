import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../../main/runtime/orca-runtime'
import { RpcDispatcher } from '../../../main/runtime/rpc/dispatcher'
import type { RuntimeGitTarget } from '../../../main/runtime/runtime-git-command-target'
import { FORK_GIT_WORKSPACE_METHOD_NAMES } from '../../git-workspace/constants'
import { FORK_GIT_WORKSPACE_METHODS } from './methods'

const fsCalls = vi.hoisted(() => ({ n: 0 }))

vi.mock('node:fs/promises', () => {
  const fail = (): Promise<never> => {
    fsCalls.n += 1
    return Promise.reject(new Error('local fs'))
  }
  return { realpath: fail, readdir: fail, stat: fail, readFile: fail }
})

const OID = 'a'.repeat(40)

function target(executionHostId: string): RuntimeGitTarget {
  const value = {
    executionHostId,
    worktree: { path: '/remote/ws', hostId: executionHostId }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 路由检查只读 executionHostId。
  return value as unknown as RuntimeGitTarget
}

function dispatcherFor(executionHostId: string): RpcDispatcher {
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    resolveRuntimeGitTarget: async () => target(executionHostId)
  }
  return new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 分发器只读 getRuntimeId，fork 方法只调 resolveRuntimeGitTarget。
    runtime: runtime as unknown as OrcaRuntimeService,
    methods: FORK_GIT_WORKSPACE_METHODS
  })
}

describe('workspace repository routes', () => {
  let dispatcher = dispatcherFor('local')

  afterEach(() => {
    fsCalls.n = 0
  })

  async function call(method: string, params: Record<string, unknown> = {}) {
    return dispatcher.dispatch({
      id: 'req-1',
      authToken: 'tok',
      method,
      params: { worktree: 'id:wt-1', ...params }
    })
  }

  async function callEveryMethod(): Promise<void> {
    const file = { repositoryPath: 'app', filePath: 'README' }
    const calls: [string, Record<string, unknown>][] = [
      ['git.workspaceRepositories', {}],
      ['git.workspaceRepositories.status', { repositoryPath: 'app' }],
      [
        'git.workspaceRepositories.branchCompare',
        { repositoryPath: 'app', baseRef: 'origin/main' }
      ],
      ['git.workspaceRepositories.diff', { ...file, staged: false }],
      [
        'git.workspaceRepositories.branchDiff',
        { ...file, compare: { headOid: OID, mergeBase: OID } }
      ],
      [
        'git.workspaceRepositories.setCompareTarget',
        { repositoryPath: 'app', branch: 'refs/heads/feature', ref: 'origin/main' }
      ]
    ]
    expect(calls.map(([method]) => method)).toEqual([...FORK_GIT_WORKSPACE_METHOD_NAMES])
    for (const [method, params] of calls) {
      const response = await call(method, params)
      expect(response.ok, method).toBe(false)
    }
  }

  it.each(['ssh:box', 'runtime:env-1'])(
    'rejects %s before touching the client filesystem',
    async (executionHostId) => {
      dispatcher = dispatcherFor(executionHostId)
      await callEveryMethod()
      expect(fsCalls.n).toBe(0)
    }
  )

  it('still reads the filesystem for a local worktree', async () => {
    dispatcher = dispatcherFor('local')
    const response = await call('git.workspaceRepositories')
    expect(response.ok).toBe(false)
    expect(fsCalls.n).toBeGreaterThan(0)
  })
})
