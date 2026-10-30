import { memo, useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/structured-agent-session-owner'
import { RetainedPaneHost } from '../tab-group/RetainedPaneHost'
import { useCoveredTerminalFocusHandoff } from '../terminal-pane/use-covered-terminal-focus-handoff'
import NativeChatView from './NativeChatView'
import { isStructuredTab } from '../../../../shared/structured-agent-session-tab'

type StructuredAgentSessionTab = Tab & {
  contentType: 'agent-session'
  agentSessionAgent: NonNullable<Tab['agentSessionAgent']>
}

const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const EMPTY_GROUPS: readonly TabGroup[] = []

const StructuredAgentSessionOverlaySlot = memo(function StructuredAgentSessionOverlaySlot({
  tab,
  groupId,
  isActive,
  isFocusedGroup,
  hasSplitGroups,
  onFocusOwningGroup
}: {
  tab: StructuredAgentSessionTab
  groupId: string | undefined
  isActive: boolean
  isFocusedGroup: boolean
  hasSplitGroups: boolean
  onFocusOwningGroup: ((groupId: string) => void) | undefined
}): React.JSX.Element | null {
  // Resolve from the tab’s recorded host because workspace ids can collide across hosts.
  const owner = useAppStore((state) => structuredAgentSessionOwnerForTab(state, tab))
  const target = useMemo(() => structuredAgentSessionTargetForHost(owner), [owner])
  // 盖层和终端是同一锚点上的两个宿主，不经过 NativeChatPaneCover，所以这里单独把画布标上。
  const coverRef = useRef<HTMLDivElement>(null)
  useCoveredTerminalFocusHandoff(coverRef, null, target !== null && isActive)
  if (!target) {
    return null
  }
  return (
    <RetainedPaneHost
      groupId={groupId}
      isVisible={isActive}
      dimmed={hasSplitGroups && !isFocusedGroup}
      data-structured-agent-session-overlay-tab-id={tab.id}
      onFocusOwningGroup={onFocusOwningGroup}
    >
      <div
        ref={coverRef}
        tabIndex={-1}
        className="flex h-full min-h-0 min-w-0 w-full flex-col outline-none"
      >
        <NativeChatView
          mode="structured"
          tabId={tab.id}
          groupId={groupId}
          sessionId={tab.entityId}
          agent={tab.agentSessionAgent}
          isVisible={isActive}
          isFocusedGroup={isFocusedGroup}
          target={target}
        />
      </div>
    </RetainedPaneHost>
  )
})

const StructuredAgentSessionPaneOverlayLayer = memo(
  function StructuredAgentSessionPaneOverlayLayer({
    worktreeId,
    isWorktreeActive
  }: {
    worktreeId: string
    isWorktreeActive: boolean
  }): React.JSX.Element {
    const { unifiedTabs, groups, activeGroupId } = useAppStore(
      useShallow((state) => ({
        unifiedTabs: state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS,
        groups: state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS,
        activeGroupId: state.activeGroupIdByWorktree[worktreeId]
      }))
    )
    const focusGroup = useAppStore((state) => state.focusGroup)
    const focusOwningGroup = useCallback(
      (groupId: string) => focusGroup(worktreeId, groupId),
      [focusGroup, worktreeId]
    )
    const groupActiveTabById = useMemo(
      () => new Map(groups.map((group) => [group.id, group.activeTabId] as const)),
      [groups]
    )
    const structuredTabs = useMemo(
      () => unifiedTabs.filter((tab): tab is StructuredAgentSessionTab => isStructuredTab(tab)),
      [unifiedTabs]
    )

    return (
      <>
        {structuredTabs.map((tab) => (
          <StructuredAgentSessionOverlaySlot
            key={tab.id}
            tab={tab}
            groupId={tab.groupId}
            isActive={Boolean(isWorktreeActive && groupActiveTabById.get(tab.groupId) === tab.id)}
            isFocusedGroup={Boolean(
              isWorktreeActive &&
              groupActiveTabById.get(tab.groupId) === tab.id &&
              tab.groupId === activeGroupId
            )}
            hasSplitGroups={groups.length > 1}
            onFocusOwningGroup={focusOwningGroup}
          />
        ))}
      </>
    )
  }
)

export default StructuredAgentSessionPaneOverlayLayer
