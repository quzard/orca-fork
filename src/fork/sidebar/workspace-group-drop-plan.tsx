// Plans and commits a cross-group sidebar drop. Kept free of DOM and toast so it can be tested.
import { getWorktreeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { folderWorkspaceToWorktree } from '../../shared/folder-workspace-worktree'
import type { WorktreeDragGroup } from '../../renderer/src/components/sidebar/worktree-manual-order'
import { buildWorktreeManualOrderCatalog } from '../../renderer/src/components/sidebar/worktree-manual-order-catalog'
import { folderWorkspaceHostId, projectGroupHostId } from './membership'
import { EMPTY_PROJECT_GROUP_PREFIX, looseHostSectionKey } from './section-keys'
import { isSidebarFieldsNotAppliedError, sidebarFieldsErrorCode } from './sidebar-fields-applied'
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
  ) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>
  updateFolderWorkspace: (
    id: string,
    updates: Fields,
    options: { executionHostId: ExecutionHostId }
  ) => Promise<boolean>
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

const GROUP_DROP_ORDER_STRIDE = 1000

/** The key manual sort really orders by: a row without a manual order sorts by sortOrder. */
function effectiveOrderKeys(state: GroupDropState): Map<string, number> {
  const keys = new Map<string, number>()
  const rows = [
    ...Object.values(state.worktreesByRepo).flat(),
    ...state.folderWorkspaces.map((workspace) => folderWorkspaceToWorktree(workspace))
  ]
  for (const row of rows) {
    if (!row.isArchived && !keys.has(row.id)) {
      keys.set(row.id, row.manualOrder ?? row.sortOrder)
    }
  }
  return keys
}

/**
 * Manual-order values for the dragged rows only, placed between their new neighbours' effective
 * keys. No other row is written: upstream's group-drop ranking renumbers every row as soon as one
 * still sorts by sortOrder, which reshuffled the whole ungrouped list. When the neighbours share a
 * key the moved rows take that key too (ties fall back to the name order) rather than renumbering.
 */
export function buildGroupDropOrder(
  state: GroupDropState,
  groups: readonly WorktreeDragGroup[],
  target: GroupDropTarget,
  draggedIds: readonly string[],
  dropIndex: number,
  belongsToTarget: (id: string) => boolean,
  now = Date.now()
): ReadonlyMap<string, { manualOrder: number }> {
  const visible = groups.find((group) => group.key === target.key)?.worktreeIds ?? []
  const catalog = buildWorktreeManualOrderCatalog({
    worktrees: Object.values(state.worktreesByRepo).flat(),
    folderWorkspaces: state.folderWorkspaces
  })
  const hidden = catalog.orderedIds.filter((id) => !visible.includes(id) && belongsToTarget(id))
  const targetIds = [...visible, ...hidden]
  const dragged = new Set(draggedIds)
  const shown = groups.flatMap((group) => group.worktreeIds).filter((id) => dragged.has(id))
  const moved = [...new Set([...shown, ...draggedIds])]
  const bounded = Math.max(0, Math.min(dropIndex, targetIds.length))
  const removedBefore = targetIds.slice(0, bounded).filter((id) => dragged.has(id)).length
  const rest = targetIds.filter((id) => !dragged.has(id))
  const at = Math.max(0, Math.min(rest.length, bounded - removedBefore))
  const keys = effectiveOrderKeys(state)
  const before = at > 0 ? keys.get(rest[at - 1]!) : undefined
  const after = at < rest.length ? keys.get(rest[at]!) : undefined
  const count = moved.length
  const rank = (index: number): number => {
    if (before === undefined && after === undefined) {
      return now - index * GROUP_DROP_ORDER_STRIDE
    }
    if (before === undefined) {
      return after! + (count - index) * GROUP_DROP_ORDER_STRIDE
    }
    if (after === undefined) {
      return before - (index + 1) * GROUP_DROP_ORDER_STRIDE
    }
    const gap = before - after
    return gap > 0 ? before - (gap / (count + 1)) * (index + 1) : before
  }
  return new Map(moved.map((id, index) => [id, { manualOrder: rank(index) }]))
}

/** `partial`: the host applied the row's other fields but not its group or clear. */
type WriteFailure = { error: string; partial: boolean }

async function writeItem(
  writer: GroupDropWriter,
  hostId: ExecutionHostId,
  item: Item,
  fields: Fields
): Promise<WriteFailure | null> {
  const options = { executionHostId: hostId }
  if (item.kind === 'folder') {
    const ok = await writer.updateFolderWorkspace(item.storeId, fields, options).catch(() => false)
    return ok ? null : { error: workspaceGroupLabels.moveFailed, partial: false }
  }
  const result = await writer
    .updateWorktreeMeta(item.storeId, fields, options)
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
      ...sidebarFieldsErrorCode(error)
    }))
  if (result.ok) {
    return null
  }
  return { error: result.error, partial: isSidebarFieldsNotAppliedError(result) }
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
    const failure = await writeItem(writer, hostId, item, item.next)
    if (failure === null) {
      landed.push(item)
      continue
    }
    const { error, partial } = failure
    // An older host applied this row's order but not its group: put that row back too.
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
  return null
}

let dropQueue: Promise<void> = Promise.resolve()

/**
 * Runs drops one after another, across separate drag operations: a second drop starts only after
 * the first one's writes and any rollback finished. A failed drop does not stop the next one.
 */
export function enqueueGroupDrop(task: () => Promise<void>): Promise<void> {
  const run = dropQueue.then(task)
  dropQueue = run.catch(() => undefined)
  return run
}
