// Plans and commits a cross-group sidebar drop. Kept free of DOM and toast so it can be tested.
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { buildManualOrderUpdatesForGroupDrop } from '../../renderer/src/components/sidebar/worktree-manual-order'
import type { WorktreeDragGroup } from '../../renderer/src/components/sidebar/worktree-manual-order'
import { buildWorktreeManualOrderCatalog } from '../../renderer/src/components/sidebar/worktree-manual-order-catalog'
import { folderWorkspaceHostId, projectGroupHostId } from './membership'
import { EMPTY_PROJECT_GROUP_PREFIX, looseHostSectionKey } from './section-keys'
import { sidebarFieldsNotAppliedMessage } from './sidebar-fields-applied'
import { workspaceGroupLabels } from './workspace-group-labels'

export type GroupDropState = {
  worktreesByRepo: Record<string, Worktree[]>
  repos: readonly Repo[]
  folderWorkspaces: readonly FolderWorkspace[]
  projectGroups: readonly ProjectGroup[]
  getKnownWorktreeById: (id: string, hostId?: ExecutionHostId) => Worktree | undefined
}

export type GroupDropWriter = {
  updateWorktreeMeta: (
    id: string,
    updates: Fields,
    options: { executionHostId: ExecutionHostId }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  updateFolderWorkspace: (
    id: string,
    updates: Fields,
    options: { executionHostId: ExecutionHostId }
  ) => Promise<boolean>
  setSortBy: (sortBy: 'manual') => void
}

/**
 * Fields a drop writes. An own `undefined` value clears the field (see sidebar-field-clear): an
 * unset group follows the project's group, and an unset manual order falls back to sortOrder.
 */
export type Fields = { sidebarGroupId?: string | null; manualOrder?: number }
/** `name` is the workspace's display name, for messages; `storeId` is what the write addresses. */
type Item = {
  kind: 'worktree' | 'folder'
  storeId: string
  name: string
  next: Fields
  previous: Fields
}

export type GroupDropTarget = { groupId: string | null; key: string }

/**
 * Maps a target section to the group a drop really writes. An empty project header sits in the
 * host's loose list, so a drop there is a drop into that list. A group id must be a group saved on
 * the target host: anything else would be stored but render as loose (and hosts clear ids they do
 * not hold), so it is refused instead of half-applied.
 */
export function resolveGroupDropTarget(
  state: Pick<GroupDropState, 'projectGroups'>,
  hostId: ExecutionHostId,
  groupId: string | null,
  key: string
): GroupDropTarget | { error: string } {
  if (groupId === null) {
    return { groupId: null, key }
  }
  if (groupId.startsWith(EMPTY_PROJECT_GROUP_PREFIX)) {
    return { groupId: null, key: looseHostSectionKey(hostId) }
  }
  const onHost = state.projectGroups.some(
    (group) => group.id === groupId && projectGroupHostId(group, hostId) === hostId
  )
  return onHost ? { groupId, key } : { error: workspaceGroupLabels.notOnHost }
}

function findFolder(state: GroupDropState, id: string): FolderWorkspace | undefined {
  return state.folderWorkspaces.find(
    (entry) => entry.id === id || folderWorkspaceKey(entry.id) === id
  )
}

/** Every dragged row must resolve on `hostId`; one that does not cancels the whole drop. */
export function planGroupDropItems(
  state: GroupDropState,
  hostId: ExecutionHostId,
  target: GroupDropTarget,
  draggedIds: readonly string[],
  orderUpdates: ReadonlyMap<string, { manualOrder: number }>
): Item[] | { error: string } {
  const groupsById = new Map(state.projectGroups.map((group) => [group.id, group]))
  const items: Item[] = []
  for (const id of draggedIds) {
    const order = orderUpdates.get(id)
    const next: Fields = { sidebarGroupId: target.groupId, ...order }
    const folder = findFolder(state, id)
    if (folder) {
      const owner = groupsById.get(folder.projectGroupId)
      if (folder.isArchived || folderWorkspaceHostId(folder, owner, hostId) !== hostId) {
        return { error: workspaceGroupLabels.hostMismatch }
      }
      items.push({
        kind: 'folder',
        storeId: folder.id,
        name: folder.name,
        next,
        previous: previousFields(folder, order)
      })
      continue
    }
    const worktree = state.getKnownWorktreeById(id, hostId)
    const repo = worktree ? state.repos.find((entry) => entry.id === worktree.repoId) : undefined
    if (!worktree || getWorktreeExecutionHostId(worktree, repo, hostId) !== hostId) {
      return { error: workspaceGroupLabels.hostMismatch }
    }
    items.push({
      kind: 'worktree',
      storeId: id,
      name: worktree.displayName,
      next,
      previous: previousFields(worktree, order)
    })
  }
  return items
}

// The exact stored values, including absent ones, so a rollback restores the row as it was.
function previousFields(
  row: { sidebarGroupId?: string | null; manualOrder?: number },
  order: { manualOrder: number } | undefined
): Fields {
  const previous: Fields = { sidebarGroupId: row.sidebarGroupId }
  if (order) {
    previous.manualOrder = row.manualOrder
  }
  return previous
}

export function buildGroupDropOrder(
  state: GroupDropState,
  groups: readonly WorktreeDragGroup[],
  target: GroupDropTarget,
  draggedIds: readonly string[],
  dropIndex: number,
  belongsToTarget: (id: string) => boolean
): ReadonlyMap<string, { manualOrder: number }> {
  const visible = groups.find((group) => group.key === target.key)?.worktreeIds ?? []
  const catalog = buildWorktreeManualOrderCatalog({
    worktrees: Object.values(state.worktreesByRepo).flat(),
    folderWorkspaces: state.folderWorkspaces
  })
  const hidden = catalog.orderedIds.filter((id) => !visible.includes(id) && belongsToTarget(id))
  const targetGroup = { key: target.key, worktreeIds: [...visible, ...hidden] }
  return buildManualOrderUpdatesForGroupDrop({
    groups: groups.some((group) => group.key === target.key)
      ? groups.map((group) => (group.key === target.key ? targetGroup : group))
      : [...groups, targetGroup],
    targetGroupKey: target.key,
    draggedIds,
    dropIndex: Math.min(dropIndex, targetGroup.worktreeIds.length),
    now: Date.now(),
    rankByWorktreeId: catalog.rankByWorktreeId,
    allWorktreeIds: catalog.orderedIds
  }).updates
}

async function writeItem(
  writer: GroupDropWriter,
  hostId: ExecutionHostId,
  item: Item,
  fields: Fields
): Promise<string | null> {
  const options = { executionHostId: hostId }
  if (item.kind === 'folder') {
    const ok = await writer.updateFolderWorkspace(item.storeId, fields, options).catch(() => false)
    return ok ? null : workspaceGroupLabels.moveFailed
  }
  const result = await writer
    .updateWorktreeMeta(item.storeId, fields, options)
    .catch((error: unknown) => ({ ok: false as const, error: String(error) }))
  return result.ok ? null : result.error
}

/**
 * Writes every row, or none: when a write fails, the rows that already landed are put back, and
 * so is the failed row when an older host applied it only in part.
 * Writes run one after another so no two writes for this drop are ever in flight together.
 * Returns the error to show, or null when the whole drop applied.
 */
export async function commitGroupDrop(
  writer: GroupDropWriter,
  hostId: ExecutionHostId,
  items: readonly Item[]
): Promise<string | null> {
  const landed: Item[] = []
  for (const item of items) {
    const error = await writeItem(writer, hostId, item, item.next)
    if (error === null) {
      landed.push(item)
      continue
    }
    // An older host applied this row's order but not its group: put that row back too.
    const partial = item.kind === 'worktree' && error === sidebarFieldsNotAppliedMessage()
    const stuck: Item[] = []
    for (const done of partial ? [item, ...landed.toReversed()] : landed.toReversed()) {
      if ((await writeItem(writer, hostId, done, done.previous)) !== null) {
        stuck.push(done)
      }
    }
    if (stuck.length === 0) {
      return error
    }
    console.error(
      'Workspace group drop rollback failed for',
      stuck.map((entry) => entry.storeId)
    )
    return workspaceGroupLabels.rollbackFailed(
      error,
      stuck.map((entry) => entry.name)
    )
  }
  if (landed.length > 0) {
    writer.setSortBy('manual')
  }
  return null
}
