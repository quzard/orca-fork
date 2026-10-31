import { useEffect, useRef, useState } from 'react'
import { createCoalescedPollRunner } from '@/components/right-sidebar/coalesced-poll-runner'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { GitBranchCompareResult } from '../../shared/git-diff-compare-types'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  FORK_GIT_WORKSPACE_STATUS_METHOD,
  WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS,
  WORKSPACE_REPOSITORY_LIST_RPC_TIMEOUT_MS,
  WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS,
  WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS,
  WORKSPACE_REPOSITORY_POLL_CONCURRENCY,
  WORKSPACE_REPOSITORY_POLL_IDLE_MULTIPLIER,
  WORKSPACE_REPOSITORY_POLL_INTERVAL_MS
} from '../git-workspace/constants'
import type {
  WorkspaceRepositoryList,
  WorkspaceRepositoryRecord,
  WorkspaceRepositoryStatus
} from '../git-workspace/types'
import { rememberDiscoveredRepositories } from './discovered-repos'
import { callWorkspaceGit } from './rpc-client'

export type WorkspaceRepositoryPoll = {
  list: WorkspaceRepositoryList | null
  listError: string | null
  statuses: Readonly<Record<string, WorkspaceRepositoryStatus>>
  compares: Readonly<Record<string, GitBranchCompareResult>>
}

type ObservedCompare = {
  head: string | null
  ref: string
  baseOid: string | null
  at: number
}

// 第一次、手动刷新、HEAD、比较目标或基线提交变了就做分支比较。旧响应没有基线提交时，过了间隔再比。
export function branchCompareDue(
  refresh: boolean,
  status: WorkspaceRepositoryStatus,
  previous: ObservedCompare | undefined,
  now = Date.now()
): boolean {
  const ref = status.compareTarget.ref
  if (!ref || status.uninitialized) {
    return false
  }
  if (refresh || !previous) {
    return true
  }
  if (previous.head !== status.head || previous.ref !== ref) {
    return true
  }
  // status.baseOid 是这次 rev-parse 的结果。没带这个字段的旧响应不拿它做比较。
  if (status.baseOid !== undefined && status.baseOid !== previous.baseOid) {
    return true
  }
  return now - previous.at >= WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 每轮多半拿到同样的结果。内容没变就留着原对象，列表不必整片重画。
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function withEntry<T>(prev: Record<string, T>, key: string, value: T): Record<string, T> {
  return sameJson(prev[key], value) ? prev : { ...prev, [key]: value }
}

export function useWorkspaceRepositoryPoll(args: {
  enabled: boolean
  target: RuntimeClientTarget | null
  worktreeId: string
  // 变了就强制重扫、重算默认基线、重比所有仓库。
  refreshToken: number
  // 变了只是马上跑一轮普通轮询（例如刚保存了比较目标）。
  nudgeToken?: number
}): WorkspaceRepositoryPoll {
  const [list, setList] = useState<WorkspaceRepositoryList | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, WorkspaceRepositoryStatus>>({})
  const [compares, setCompares] = useState<Record<string, GitBranchCompareResult>>({})
  // 面板切走再回来时轮询会重启。上次比较到哪里要留着，否则每次都把所有仓库重比一遍。
  const observedRef = useRef(new Map<string, ObservedCompare>())
  // 手动刷新只强制一轮；之后因为可见性重启的轮询不再强制重扫。
  const consumedRefreshRef = useRef(0)
  const { enabled, target, worktreeId, refreshToken, nudgeToken } = args

  useEffect(() => {
    if (!enabled || !target) {
      return
    }
    const controller = new AbortController()
    const signal = controller.signal
    const observed = observedRef.current
    const worktree = toRuntimeWorktreeSelector(worktreeId)
    let failures = 0
    let retryAt = 0

    // 返回 false 表示这个仓库这一轮失败了。
    const pollRepository = async (
      repository: WorkspaceRepositoryRecord,
      refresh: boolean
    ): Promise<boolean> => {
      const repositoryPath = repository.repositoryPath
      try {
        const status = await callWorkspaceGit<WorkspaceRepositoryStatus>(
          target,
          FORK_GIT_WORKSPACE_STATUS_METHOD,
          { worktree, repositoryPath, admissionTier: 'status', ...(refresh ? { refresh } : {}) },
          { signal }
        )
        if (signal.aborted) {
          return true
        }
        setStatuses((prev) => withEntry(prev, repositoryPath, status))
        const ref = status.compareTarget.ref
        if (!ref || !branchCompareDue(refresh, status, observed.get(repositoryPath))) {
          return true
        }
        const compare = await callWorkspaceGit<GitBranchCompareResult>(
          target,
          FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
          { worktree, repositoryPath, baseRef: ref, admissionTier: 'background' },
          { signal }
        )
        if (signal.aborted) {
          return true
        }
        observed.set(repositoryPath, {
          head: status.head,
          ref,
          // null 是 rev-parse 失败。用 ?? 会改存比较结果里的 oid，下一轮就一直重比。
          baseOid: status.baseOid !== undefined ? status.baseOid : compare.summary.baseOid,
          at: Date.now()
        })
        setCompares((prev) => withEntry(prev, repositoryPath, compare))
        return true
      } catch {
        return signal.aborted
      }
    }

    const cycle = async (): Promise<void> => {
      // 失败后按 2 秒起、翻倍、最多 30 秒退避；可见性和间隔触发都先看这个时间。
      if (Date.now() < retryAt) {
        return
      }
      const refresh = consumedRefreshRef.current !== refreshToken
      consumedRefreshRef.current = refreshToken
      let failed = false
      try {
        const next = await callWorkspaceGit<WorkspaceRepositoryList>(
          target,
          FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
          { worktree, refresh },
          { signal, timeoutMs: WORKSPACE_REPOSITORY_LIST_RPC_TIMEOUT_MS }
        )
        if (signal.aborted) {
          return
        }
        rememberDiscoveredRepositories(worktreeId, next.repositories)
        setList((prev) => (sameJson(prev, next) ? prev : next))
        setListError(null)
        // 未初始化子模块收进「其他」，没有状态可查，不必逐个打 status。
        await mapPool(
          next.repositories.filter((repository) => !repository.uninitialized),
          WORKSPACE_REPOSITORY_POLL_CONCURRENCY,
          signal,
          async (repository) => {
            if (!(await pollRepository(repository, refresh))) {
              failed = true
            }
          }
        )
      } catch (error) {
        if (signal.aborted) {
          return
        }
        setListError(errorText(error))
        failed = true
      }
      if (signal.aborted) {
        return
      }
      failures = failed ? failures + 1 : 0
      retryAt = failed
        ? Date.now() +
          Math.min(
            WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS * 2 ** (failures - 1),
            WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS
          )
        : 0
    }

    // 和上游状态轮询一样：窗口不可见就停，一轮跑得慢就按耗时拉长间隔，同一时间只跑一轮。
    const runner = createCoalescedPollRunner(cycle, {
      minIntervalMs: WORKSPACE_REPOSITORY_POLL_INTERVAL_MS,
      slowTaskBackoff: {
        idleMultiplier: WORKSPACE_REPOSITORY_POLL_IDLE_MULTIPLIER,
        changeSignalMultiplier: 1,
        maxIntervalMs: WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS
      }
    })
    const stopInterval = installWindowVisibilityInterval({
      run: () => runner.run(),
      intervalMs: WORKSPACE_REPOSITORY_POLL_INTERVAL_MS
    })
    return () => {
      controller.abort()
      stopInterval()
      runner.dispose()
    }
  }, [enabled, nudgeToken, refreshToken, target, worktreeId])

  return { list, listError, statuses, compares }
}
