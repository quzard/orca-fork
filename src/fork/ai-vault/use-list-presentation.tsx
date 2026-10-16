import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiVaultSessionListGroup } from '../../renderer/src/components/right-sidebar/ai-vault-session-filters'
import {
  applyAiVaultListGroups,
  publishAiVaultGroupSessionCounts,
  registerAiVaultSearchHostLabel,
  setAiVaultCollapseAllHandler,
  shouldCollapseNewAiVaultGroups
} from '../../shared/fork-hooks/ai-vault'
import { searchHostLabels, visibleAiVaultGroups } from './list-presentation'
import { publishAiVaultPanelStatus } from './panel-status'

export function useForkAiVaultGroups(
  groups: readonly AiVaultSessionListGroup[],
  status: { loading: boolean; sessionCount: number }
): {
  groups: readonly AiVaultSessionListGroup[]
  collapsedGroups: ReadonlySet<string>
  toggleGroup: (key: string) => void
} {
  const partitioned = useMemo(() => applyAiVaultListGroups(groups), [groups])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
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
  }, [partitioned])

  useEffect(() => {
    publishAiVaultGroupSessionCounts(presented.hostHeaderCounts)
    return () => publishAiVaultGroupSessionCounts(undefined)
  }, [presented.hostHeaderCounts])

  useEffect(() => {
    registerAiVaultSearchHostLabel(searchHostLabels(partitioned))
    return () => registerAiVaultSearchHostLabel(undefined)
  }, [partitioned])

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

  const toggleGroup = useCallback((key: string) => {
    setSeenKeys((current) => {
      if (current.has(key)) {
        return current
      }
      const next = new Set(current)
      next.add(key)
      return next
    })
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  return { groups: presented.groups, collapsedGroups, toggleGroup }
}
