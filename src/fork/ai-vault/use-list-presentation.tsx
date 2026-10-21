import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
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

/**
 * Host rows, collapse-new and the collapse-all handler over upstream's list groups. The panel's
 * own collapsed set and toggle stay upstream's; this only adds keys to that set.
 */
export function useForkAiVaultGroups(
  groups: readonly AiVaultSessionListGroup[],
  collapsedGroups: ReadonlySet<string>,
  setCollapsedGroups: (next: Set<string>) => void,
  status: { loading: boolean; sessionCount: number }
): readonly AiVaultSessionListGroup[] {
  const partitioned = useMemo(() => applyAiVaultListGroups(groups), [groups])
  const [seenKeys, setSeenKeys] = useState<ReadonlySet<string>>(() => new Set())

  // 新出现的主机行和目录在首帧就收起，避免先展开再收起。
  if (shouldCollapseNewAiVaultGroups()) {
    const unseen = partitioned.filter((group) => group.label !== null && !seenKeys.has(group.key))
    if (unseen.length > 0) {
      const nextSeen = new Set(seenKeys)
      const nextCollapsed = new Set(collapsedGroups)
      for (const group of unseen) {
        nextSeen.add(group.key)
        nextCollapsed.add(group.key)
      }
      setSeenKeys(nextSeen)
      setCollapsedGroups(nextCollapsed)
    }
  }

  const presented = useMemo(
    () => visibleAiVaultGroups(partitioned, collapsedGroups),
    [collapsedGroups, partitioned]
  )

  useEffect(() => {
    setAiVaultCollapseAllHandler(() => {
      const keys = partitioned.filter((group) => group.label !== null).map((group) => group.key)
      setSeenKeys((current) => {
        const next = new Set(current)
        for (const key of keys) {
          next.add(key)
        }
        return next
      })
      setCollapsedGroups(new Set(keys))
    })
    return () => setAiVaultCollapseAllHandler(undefined)
  }, [partitioned, setCollapsedGroups])

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

  return presented.groups
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
