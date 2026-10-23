import { useEffect, useState } from 'react'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { GitBranchCompareResult } from '../../shared/git-diff-compare-types'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  FORK_GIT_WORKSPACE_STATUS_METHOD,
  WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS,
  WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS,
  WORKSPACE_REPOSITORY_POLL_CONCURRENCY,
  WORKSPACE_REPOSITORY_POLL_INTERVAL_MS
} from '../git-workspace/constants'
import type { WorkspaceRepositoryList, WorkspaceRepositoryStatus } from '../git-workspace/types'
import { rememberDiscoveredRepositories } from './discovered-repos'
import { callWorkspaceGit } from './rpc-client'

export type WorkspaceRepositoryPoll = {
  list: WorkspaceRepositoryList | null
  statuses: Readonly<Record<string, WorkspaceRepositoryStatus>>
  compares: Readonly<Record<string, GitBranchCompareResult>>
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', finish)
      resolve()
    }, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  run: (item: T) => Promise<void>
): Promise<void> {
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!signal.aborted) {
        const current = index
        index += 1
        const item = items[current]
        if (item === undefined) {
          return
        }
        await run(item)
      }
    })
  )
}

export function useWorkspaceRepositoryPoll(args: {
  enabled: boolean
  target: RuntimeClientTarget | null
  worktreeId: string
  refreshToken: number
}): WorkspaceRepositoryPoll {
  const [list, setList] = useState<WorkspaceRepositoryList | null>(null)
  const [statuses, setStatuses] = useState<Record<string, WorkspaceRepositoryStatus>>({})
  const [compares, setCompares] = useState<Record<string, GitBranchCompareResult>>({})
  const { enabled, target, worktreeId, refreshToken } = args

  useEffect(() => {
    setList(null)
    setStatuses({})
    setCompares({})
  }, [worktreeId])

  useEffect(() => {
    if (!enabled || !target) {
      return
    }
    const controller = new AbortController()
    const signal = controller.signal
    let backoff = WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS
    let first = true
    const worktree = toRuntimeWorktreeSelector(worktreeId)

    const cycle = async (): Promise<void> => {
      let failed = false
      const refresh = first && refreshToken > 0
      first = false
      try {
        const next = await callWorkspaceGit<WorkspaceRepositoryList>(
          target,
          FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
          { worktree, refresh },
          signal
        )
        if (signal.aborted) {
          return
        }
        rememberDiscoveredRepositories(worktreeId, next.repositories)
        setList(next)
        await mapPool(
          next.repositories,
          WORKSPACE_REPOSITORY_POLL_CONCURRENCY,
          signal,
          async (repository) => {
            try {
              const status = await callWorkspaceGit<WorkspaceRepositoryStatus>(
                target,
                FORK_GIT_WORKSPACE_STATUS_METHOD,
                {
                  worktree,
                  repositoryPath: repository.repositoryPath,
                  admissionTier: 'status'
                },
                signal
              )
              if (signal.aborted) {
                return
              }
              setStatuses((prev) => ({ ...prev, [repository.repositoryPath]: status }))
              const ref = status.compareTarget.ref
              if (!ref || status.uninitialized) {
                return
              }
              const compare = await callWorkspaceGit<GitBranchCompareResult>(
                target,
                FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
                {
                  worktree,
                  repositoryPath: repository.repositoryPath,
                  baseRef: ref,
                  admissionTier: 'background'
                },
                signal
              )
              if (!signal.aborted) {
                setCompares((prev) => ({ ...prev, [repository.repositoryPath]: compare }))
              }
            } catch {
              if (!signal.aborted) {
                failed = true
              }
            }
          }
        )
      } catch {
        if (signal.aborted) {
          return
        }
        failed = true
      }
      if (signal.aborted) {
        return
      }
      const delay = failed ? backoff : WORKSPACE_REPOSITORY_POLL_INTERVAL_MS
      backoff = failed
        ? Math.min(backoff * 2, WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS)
        : WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS
      await sleep(delay, signal)
      if (!signal.aborted) {
        void cycle()
      }
    }

    void cycle()
    return () => {
      controller.abort()
    }
  }, [enabled, refreshToken, target, worktreeId])

  return { list, statuses, compares }
}
