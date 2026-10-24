import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { AiVaultHostScopeOption } from '../../renderer/src/components/right-sidebar/ai-vault-host-scope'
import { MAX_COLLAPSED_GROUPS } from '../../renderer/src/components/right-sidebar/ai-vault-panel-transient-state'
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
const NO_UNSEEN_GROUPS: readonly AiVaultSessionListGroup[] = []

export function resetForkAiVaultSeenGroupsForTests(): void {
  sidebarSeenGroupKeys = new Set()
}

function sameGroupKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) {
    return true
  }
  if (left.size !== right.size) {
    return false
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false
    }
  }
  return true
}

// 整组替换不走上游按一次点击淘汰的路径，这里按插入顺序丢掉最旧的键。
function capCollapsedGroupKeys(keys: Iterable<string>): Set<string> {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    ordered.push(key)
  }
  if (ordered.length <= MAX_COLLAPSED_GROUPS) {
    return seen
  }
  const kept = new Set<string>()
  for (const key of ordered.slice(ordered.length - MAX_COLLAPSED_GROUPS)) {
    kept.add(key)
  }
  return kept
}

function labeledGroupKeys(groups: readonly AiVaultSessionListGroup[]): Set<string> {
  const keys = new Set<string>()
  for (const group of groups) {
    if (group.label !== null) {
      keys.add(group.key)
    }
  }
  return keys
}

// 当前还在列表里的键不能丢掉：丢掉之后下一帧又会被当成新分组收起，折叠集合就会转圈。
// 列表本身超过 512 时，见过集合只能暂时比上限大，否则多出来的分组永远记不住。
function rememberGroupKeys(
  current: ReadonlySet<string>,
  added: Iterable<string>,
  listedKeys: ReadonlySet<string>
): ReadonlySet<string> {
  const next = new Set(current)
  for (const key of added) {
    next.add(key)
  }
  if (next.size <= MAX_COLLAPSED_GROUPS) {
    return sameGroupKeys(next, current) ? current : next
  }
  const kept = new Set<string>()
  const history: string[] = []
  for (const key of next) {
    if (listedKeys.has(key)) {
      kept.add(key)
    } else {
      history.push(key)
    }
  }
  if (kept.size < MAX_COLLAPSED_GROUPS) {
    const room = MAX_COLLAPSED_GROUPS - kept.size
    for (const key of history.slice(history.length - room)) {
      kept.add(key)
    }
  }
  return sameGroupKeys(kept, current) ? current : kept
}

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
  // 折叠集合挂在上游的外部 store 上，渲染过程中写入会抛错，所以这一帧先按算出来的集合画。
  // 已经收起、但还没记进见过集合的分组也算没见过：只记“新收起”的键，第一次展开会被撤掉。
  let listedCollapsedGroups = collapsedGroups
  let unseen: readonly AiVaultSessionListGroup[] = NO_UNSEEN_GROUPS
  if (shouldCollapseNewAiVaultGroups()) {
    const found = partitioned.filter((group) => group.label !== null && !seenKeys.has(group.key))
    if (found.length > 0) {
      unseen = found
      const nextCollapsed = new Set(collapsedGroups)
      for (const group of found) {
        nextCollapsed.add(group.key)
      }
      const capped = capCollapsedGroupKeys(nextCollapsed)
      if (!sameGroupKeys(capped, collapsedGroups)) {
        listedCollapsedGroups = capped
      }
    }
  }

  useLayoutEffect(() => {
    const listedKeys = labeledGroupKeys(partitioned)
    const added = unseen.map((group) => group.key)
    // 见过集合内容没变必须交回原来的 Set。对话框模式每次都换一个新 Set 会把更新深度打满。
    if (rememberSeenGroups) {
      const next = rememberGroupKeys(sidebarSeenGroupKeys, added, listedKeys)
      if (next !== sidebarSeenGroupKeys) {
        sidebarSeenGroupKeys = next
      }
    } else {
      setLocalSeenKeys((current) => rememberGroupKeys(current, added, listedKeys))
    }
    if (!sameGroupKeys(listedCollapsedGroups, collapsedGroups)) {
      setCollapsedGroups(capCollapsedGroupKeys(listedCollapsedGroups))
    }
  }, [
    collapsedGroups,
    listedCollapsedGroups,
    partitioned,
    rememberSeenGroups,
    setCollapsedGroups,
    unseen
  ])

  const presented = useMemo(
    () => visibleAiVaultGroups(partitioned, listedCollapsedGroups),
    [listedCollapsedGroups, partitioned]
  )

  useEffect(() => {
    setAiVaultCollapseAllHandler(() => {
      const keys = labeledGroupKeys(partitioned)
      if (rememberSeenGroups) {
        const next = rememberGroupKeys(sidebarSeenGroupKeys, keys, keys)
        if (next !== sidebarSeenGroupKeys) {
          sidebarSeenGroupKeys = next
        }
      } else {
        setLocalSeenKeys((current) => rememberGroupKeys(current, keys, keys))
      }
      const collapsed = capCollapsedGroupKeys(keys)
      if (!sameGroupKeys(collapsed, collapsedGroups)) {
        setCollapsedGroups(collapsed)
      }
    })
    return () => setAiVaultCollapseAllHandler(undefined)
  }, [collapsedGroups, partitioned, rememberSeenGroups, setCollapsedGroups])

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
