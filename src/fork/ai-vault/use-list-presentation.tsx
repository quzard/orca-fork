import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { AiVaultHostScopeOption } from '../../renderer/src/components/right-sidebar/ai-vault-host-scope'
import { aiVaultSearchHitHostLabels } from '../../renderer/src/components/right-sidebar/ai-vault-search-hit-hosts'
import type { AiVaultSessionListGroup } from '../../renderer/src/components/right-sidebar/ai-vault-session-filters'
import {
  applyAiVaultListGroups,
  decorateVaultHostMenu,
  publishAiVaultGroupSessionCounts,
  setAiVaultCollapseAllHandler,
  shouldCollapseNewAiVaultGroups
} from '../../shared/fork-hooks/ai-vault'
import { visibleAiVaultGroups } from './list-presentation'
import { publishAiVaultPanelStatus } from './panel-status'

// 侧栏面板的折叠集合在卸载后还在。见过的分组键跟着活到渲染进程重载，
// 否则每次重开都把全部分组当成新的，用户展开过的会被再收起。
let sidebarSeenGroupKeys: ReadonlySet<string> = new Set()

/**
 * Host rows, collapse-new and the collapse-all handler over upstream's list groups. The panel's
 * own collapsed set and toggle stay upstream's; this only adds keys to that set.
 */
export function useForkAiVaultGroups(
  groups: readonly AiVaultSessionListGroup[],
  collapsedGroups: ReadonlySet<string>,
  setCollapsedGroups: (next: Set<string>) => void,
  status: { loading: boolean; sessionCount: number; rememberSeenGroups?: boolean }
): { groups: readonly AiVaultSessionListGroup[]; collapsedGroups: ReadonlySet<string> } {
  const partitioned = useMemo(() => applyAiVaultListGroups(groups), [groups])
  const rememberSeenGroups = status.rememberSeenGroups === true
  const [localSeenKeys, setLocalSeenKeys] = useState<ReadonlySet<string>>(() => new Set())
  const seenKeys = rememberSeenGroups ? sidebarSeenGroupKeys : localSeenKeys

  // 新出现的主机行和目录在首帧就收起，避免先展开再收起。
  // 折叠集合挂在上游的外部 store 上，渲染过程中写入会抛错。
  // 这一帧先按算出来的集合画，绘制前再把见过的键和折叠集合一起写回去。
  let listedCollapsedGroups = collapsedGroups
  if (shouldCollapseNewAiVaultGroups()) {
    const unseen = partitioned.filter((group) => group.label !== null && !seenKeys.has(group.key))
    if (unseen.length > 0) {
      const nextCollapsed = new Set(collapsedGroups)
      for (const group of unseen) {
        nextCollapsed.add(group.key)
      }
      listedCollapsedGroups = nextCollapsed
    }
  }

  useLayoutEffect(() => {
    if (listedCollapsedGroups === collapsedGroups) {
      return
    }
    if (rememberSeenGroups) {
      const nextSeen = new Set(sidebarSeenGroupKeys)
      for (const key of listedCollapsedGroups) {
        if (!collapsedGroups.has(key)) {
          nextSeen.add(key)
        }
      }
      sidebarSeenGroupKeys = nextSeen
    } else {
      setLocalSeenKeys((current) => {
        const next = new Set(current)
        for (const key of listedCollapsedGroups) {
          if (!collapsedGroups.has(key)) {
            next.add(key)
          }
        }
        return next
      })
    }
    setCollapsedGroups(new Set(listedCollapsedGroups))
  }, [collapsedGroups, listedCollapsedGroups, rememberSeenGroups, setCollapsedGroups])

  const presented = useMemo(
    () => visibleAiVaultGroups(partitioned, listedCollapsedGroups),
    [listedCollapsedGroups, partitioned]
  )

  useEffect(() => {
    setAiVaultCollapseAllHandler(() => {
      const keys = partitioned.filter((group) => group.label !== null).map((group) => group.key)
      if (rememberSeenGroups) {
        const nextSeen = new Set(sidebarSeenGroupKeys)
        for (const key of keys) {
          nextSeen.add(key)
        }
        sidebarSeenGroupKeys = nextSeen
      } else {
        setLocalSeenKeys((current) => {
          const next = new Set(current)
          for (const key of keys) {
            next.add(key)
          }
          return next
        })
      }
      setCollapsedGroups(new Set(keys))
    })
    return () => setAiVaultCollapseAllHandler(undefined)
  }, [partitioned, rememberSeenGroups, setCollapsedGroups])

  useEffect(() => {
    publishAiVaultGroupSessionCounts(presented.hostHeaderCounts)
    return () => publishAiVaultGroupSessionCounts(undefined)
  }, [presented.hostHeaderCounts])

  useEffect(() => {
    const hosts = new Set<string>()
    for (const group of partitioned) {
      for (const session of group.sessions) {
        hosts.add(session.executionHostId)
      }
    }
    publishAiVaultPanelStatus({
      loading: status.loading,
      sessionCount: status.sessionCount,
      hostCount: hosts.size
    })
  }, [partitioned, status.loading, status.sessionCount])

  return { groups: presented.groups, collapsedGroups: listedCollapsedGroups }
}

/**
 * 搜索命中跨多台主机时，给出每台主机的名称。
 * 这段计算原在 AiVaultPanel 里，面板已经顶到 400 行，才挪到这里。
 * 这不是 fork 功能：只有一台主机时返回 null，行上不标来源。
 */
export function useSearchHostLabels(
  searching: boolean,
  hits: readonly Pick<AiVaultSession, 'executionHostId'>[],
  hostOptions: readonly AiVaultHostScopeOption[]
): ReadonlyMap<ExecutionHostId, string> | null {
  return useMemo(
    () => (searching ? aiVaultSearchHitHostLabels(hits, hostOptions) : null),
    [hits, hostOptions, searching]
  )
}

/**
 * 恢复会话时要看的工作区快照。
 * 这段计算原在 AiVaultPanel 里，面板已经顶到 400 行，才挪到这里。
 * 这不是 fork 功能：快照内容和原来的 useAppStore 选择器一样。
 */
export function useAiVaultResumeTargetState() {
  return useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      settings: state.settings,
      folderWorkspaces: selectFolderWorkspaces(state),
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: selectWorktreesByRepo(state)
    }))
  )
}

/** The history host menu with the fork's "other configured hosts" grouping. Unregistered, unchanged. */
export function useForkVaultHostMenu<T extends { id: string; label: string; secondary?: boolean }>(
  options: readonly T[],
  sessions: readonly { executionHostId: string }[],
  activeWorktree: Pick<Worktree, 'hostId'> | null | undefined,
  activeRepo: Pick<Repo, 'connectionId' | 'executionHostId'> | null | undefined
): readonly T[] {
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const connectedSshTargetIds: string[] = []
  // Partial stores in upstream panel tests omit the map. A missing map is no connected host.
  if (sshConnectionStates) {
    for (const [targetId, state] of sshConnectionStates) {
      if (state.status === 'connected') {
        connectedSshTargetIds.push(targetId)
      }
    }
  }
  return decorateVaultHostMenu(options, {
    historyHostIds: sessions.map((session) => session.executionHostId),
    activeHostId: activeWorktree
      ? getWorktreeExecutionHostId(activeWorktree, activeRepo ?? undefined)
      : null,
    connectedSshTargetIds
  })
}
