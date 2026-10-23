// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  FORK_GIT_WORKSPACE_STATUS_METHOD,
  WORKSPACE_REPOSITORY_POLL_INTERVAL_MS
} from '../git-workspace/constants'
import { useWorkspaceRepositoryPoll } from './poll-workspace-repos'

const firstOid = '1111111111111111111111111111111111111111'
const nextOid = '2222222222222222222222222222222222222222'
const compareOid = '3333333333333333333333333333333333333333'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  statusBaseOid: '1111111111111111111111111111111111111111' as string | null,
  compareBaseOid: '1111111111111111111111111111111111111111' as string | null
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc
}))

const repo = {
  repositoryPath: 'libs/core',
  kind: 'nested' as const,
  uninitialized: false,
  depth: 1,
  realPath: '/ws/libs/core'
}

describe('workspace repository poll', () => {
  let container: HTMLDivElement
  let root: Root
  let compareCalls: number

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    compareCalls = 0
    mocks.statusBaseOid = firstOid
    mocks.compareBaseOid = firstOid
    mocks.callRuntimeRpc.mockImplementation(async (_target: unknown, method: string) => {
      if (method === FORK_GIT_WORKSPACE_REPOSITORIES_METHOD) {
        return { repositories: [repo], truncated: false, timedOut: false }
      }
      if (method === FORK_GIT_WORKSPACE_STATUS_METHOD) {
        return {
          repositoryPath: 'libs/core',
          uninitialized: false,
          branch: 'refs/heads/feature',
          head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          entries: [],
          compareTarget: { ref: 'origin/main', source: 'default' },
          baseOid: mocks.statusBaseOid
        }
      }
      if (method === FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD) {
        compareCalls += 1
        return {
          summary: {
            baseRef: 'origin/main',
            baseOid: mocks.compareBaseOid,
            compareRef: 'feature',
            headOid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            mergeBase: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            changedFiles: 0,
            commitsAhead: 1,
            commitsBehind: 0,
            status: 'ready'
          },
          entries: []
        }
      }
      throw new Error(method)
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const target = { kind: 'local' as const }

  function Probe(): null {
    useWorkspaceRepositoryPoll({
      enabled: true,
      target,
      worktreeId: 'wt-1',
      refreshToken: 0
    })
    return null
  }

  it('compares again when the base oid moves and HEAD stays put', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(compareCalls).toBe(1)

    mocks.statusBaseOid = nextOid
    mocks.compareBaseOid = nextOid
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_REPOSITORY_POLL_INTERVAL_MS)
    })
    expect(compareCalls).toBe(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_REPOSITORY_POLL_INTERVAL_MS)
    })
    expect(compareCalls).toBe(2)
  })

  it('does not compare again when rev-parse failed and the compare oid is set', async () => {
    mocks.statusBaseOid = null
    mocks.compareBaseOid = compareOid
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(compareCalls).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WORKSPACE_REPOSITORY_POLL_INTERVAL_MS)
    })
    expect(compareCalls).toBe(1)
  })
})
