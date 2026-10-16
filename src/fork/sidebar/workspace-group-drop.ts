// Cross-group sidebar drop. Same host only; other drops fall through to upstream reorder.
import { toast } from 'sonner'
import { getWorktreeExecutionHostId, normalizeExecutionHostId } from '../../shared/execution-host'
import type { ExecutionHostId } from '../../shared/execution-host'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import {
  registerWorkspaceGroupDrop,
  type WorkspaceGroupDropArgs
} from '../../shared/fork-hooks/sidebar-chrome'
import { useAppStore } from '../../renderer/src/store'
import { buildManualOrderUpdatesForGroupDrop } from '../../renderer/src/components/sidebar/worktree-manual-order'
import type { WorktreeDragGroup } from '../../renderer/src/components/sidebar/worktree-manual-order'
import { buildWorktreeManualOrderCatalog } from '../../renderer/src/components/sidebar/worktree-manual-order-catalog'
import { getWorktreeSidebarDragRectsForGroup } from '../../renderer/src/components/sidebar/worktree-sidebar-drag-autoscroll'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { resolveSidebarGroupId, folderWorkspaceHostId } from './membership'
import {
  WORKSPACE_GROUP_HOST_MISMATCH,
  WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE,
  parseHostDirectorySectionKey
} from './section-keys'

type DropArgs = {
  x: number
  y: number
  sourceGroupKey: string
  draggedIds: readonly string[]
  groups: readonly WorktreeDragGroup[]
  container: HTMLElement | null
}

export function workspaceGroupDropBlocked(sourceHostId: string, targetHostId: string): boolean {
  return sourceHostId !== targetHostId
}

export function workspaceGroupInsertionIndex(
  rects: readonly { top: number; bottom: number; groupIndex: number }[],
  pointerY: number,
  fallback: number
): number {
  const before = rects.find((rect) => pointerY < (rect.top + rect.bottom) / 2)
  return before?.groupIndex ?? fallback
}

function elementGroupKey(container: HTMLElement, x: number, y: number): string | null {
  const element = document
    .elementsFromPoint(x, y)
    .map((entry) => entry.closest<HTMLElement>(`[${WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE}]`))
    .find((entry) => entry && container.contains(entry))
  return element?.getAttribute(WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE) ?? null
}

export function tryCommitWorkspaceGroupDrop(args: DropArgs): boolean {
  const source = parseHostDirectorySectionKey(args.sourceGroupKey)
  if (!source || !args.container) {
    return false
  }
  const key = elementGroupKey(args.container, args.x, args.y)
  const target = key ? parseHostDirectorySectionKey(key) : null
  if (!key || !target || key === args.sourceGroupKey) {
    return false
  }
  const sourceHostId = normalizeExecutionHostId(source.hostId)
  const targetHostId = normalizeExecutionHostId(target.hostId)
  if (!sourceHostId || !targetHostId) {
    return false
  }
  if (workspaceGroupDropBlocked(sourceHostId, targetHostId)) {
    toast.error(WORKSPACE_GROUP_HOST_MISMATCH)
    return true
  }
  const pointerY = args.y - args.container.getBoundingClientRect().top + args.container.scrollTop
  const visible = args.groups.find((group) => group.key === key)?.worktreeIds ?? []
  const dropIndex = workspaceGroupInsertionIndex(
    getWorktreeSidebarDragRectsForGroup(args.container, key),
    pointerY,
    visible.length
  )
  void writeGroupDrop(targetHostId, target.groupId, args.draggedIds, args.groups, key, dropIndex)
  return true
}

function workspaceBelongsToGroup(
  state: {
    worktreesByRepo: Record<string, Worktree[]>
    repos: readonly Repo[]
    folderWorkspaces: readonly FolderWorkspace[]
    projectGroups: readonly ProjectGroup[]
  },
  id: string,
  hostId: ExecutionHostId,
  groupId: string | null
): boolean {
  const groupsById = new Map(state.projectGroups.map((group) => [group.id, group]))
  const worktree = Object.values(state.worktreesByRepo)
    .flat()
    .find((entry) => entry.id === id)
  if (worktree && !worktree.isArchived) {
    const repo = state.repos.find((entry) => entry.id === worktree.repoId)
    if (getWorktreeExecutionHostId(worktree, repo, hostId) !== hostId) {
      return false
    }
    return (
      resolveSidebarGroupId({
        sidebarGroupId: worktree.sidebarGroupId,
        inheritedGroupId: repo?.projectGroupId,
        groupsById,
        hostId,
        defaultHostId: hostId
      }) === groupId
    )
  }
  const folder = state.folderWorkspaces.find(
    (entry) => entry.id === id || folderWorkspaceKey(entry.id) === id
  )
  if (!folder || folder.isArchived) {
    return false
  }
  const group = groupsById.get(folder.projectGroupId)
  if (folderWorkspaceHostId(folder, group, hostId) !== hostId) {
    return false
  }
  return (
    resolveSidebarGroupId({
      sidebarGroupId: folder.sidebarGroupId,
      inheritedGroupId: folder.projectGroupId,
      groupsById,
      hostId,
      defaultHostId: hostId
    }) === groupId
  )
}

async function writeGroupDrop(
  hostId: ExecutionHostId,
  groupId: string | null,
  draggedIds: readonly string[],
  groups: readonly WorktreeDragGroup[],
  targetKey: string,
  dropIndex: number
): Promise<void> {
  const state = useAppStore.getState()
  const visible = groups.find((group) => group.key === targetKey)?.worktreeIds ?? []
  const catalog = buildWorktreeManualOrderCatalog({
    worktrees: Object.values(state.worktreesByRepo).flat(),
    folderWorkspaces: state.folderWorkspaces
  })
  const hiddenMembers = catalog.orderedIds.filter(
    (id) => !visible.includes(id) && workspaceBelongsToGroup(state, id, hostId, groupId)
  )
  const targetGroup = { key: targetKey, worktreeIds: [...visible, ...hiddenMembers] }
  const order = buildManualOrderUpdatesForGroupDrop({
    groups: groups.some((group) => group.key === targetKey)
      ? groups.map((group) => (group.key === targetKey ? targetGroup : group))
      : [...groups, targetGroup],
    targetGroupKey: targetKey,
    draggedIds,
    dropIndex: Math.min(dropIndex, targetGroup.worktreeIds.length),
    now: Date.now(),
    rankByWorktreeId: catalog.rankByWorktreeId,
    allWorktreeIds: catalog.orderedIds
  })
  for (const id of draggedIds) {
    const folder = state.folderWorkspaces.find(
      (entry) => entry.id === id || folderWorkspaceKey(entry.id) === id
    )
    if (folder) {
      const folderHost =
        folder.executionHostId ??
        getWorktreeExecutionHostId(
          { hostId: folder.executionHostId ?? undefined },
          undefined,
          hostId
        )
      if (folderHost !== hostId) {
        toast.error(WORKSPACE_GROUP_HOST_MISMATCH)
        return
      }
      await state.updateFolderWorkspace(
        folder.id,
        { sidebarGroupId: groupId, ...order.updates.get(id) },
        { executionHostId: hostId }
      )
      continue
    }
    const worktree = state.getKnownWorktreeById(id, hostId)
    if (!worktree || getWorktreeExecutionHostId(worktree, undefined, hostId) !== hostId) {
      toast.error(WORKSPACE_GROUP_HOST_MISMATCH)
      return
    }
    const result = await state.updateWorktreeMeta(
      id,
      { sidebarGroupId: groupId, ...order.updates.get(id) },
      { executionHostId: hostId }
    )
    if (!result.ok) {
      toast.error(result.error)
      return
    }
  }
  state.setSortBy('manual')
}

export function registerWorkspaceGroupDropHandler(): void {
  registerWorkspaceGroupDrop((args) => {
    if (!isDropArgs(args)) {
      return false
    }
    return tryCommitWorkspaceGroupDrop(args)
  })
}

function isDropArgs(args: WorkspaceGroupDropArgs): args is DropArgs {
  return 'sourceGroupKey' in args && 'draggedIds' in args && 'x' in args && 'y' in args
}
