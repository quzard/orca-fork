// Manual-order values a cross-group drop writes. Kept apart from the write plan so each stays small.
import { folderWorkspaceToWorktree } from '../../shared/folder-workspace-worktree'
import type { WorktreeDragGroup } from '../../renderer/src/components/sidebar/worktree-manual-order'
import { buildWorktreeManualOrderCatalog } from '../../renderer/src/components/sidebar/worktree-manual-order-catalog'
import type { GroupDropState, GroupDropTarget } from './workspace-group-drop-plan'

export const GROUP_DROP_ORDER_STRIDE = 1000
/** Smallest step kept between two ranks; below it the section is renumbered instead. */
export const GROUP_DROP_MIN_ORDER_STEP = 1e-6

type OrderUpdates = ReadonlyMap<string, { manualOrder: number }>

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

// A step this small would round away or tie at the size of these keys (doubles near 1.7e12, a
// Date.now() rank, are only about 2e-4 apart), so it is not a real "strictly between".
function minStep(before: number, after: number): number {
  return Math.max(
    GROUP_DROP_MIN_ORDER_STEP,
    Math.max(Math.abs(before), Math.abs(after)) * Number.EPSILON * 16
  )
}

/** Ranks strictly between the neighbours, or null when they tie or the gap is used up. */
function ranksBetween(before: number, after: number, count: number): number[] | null {
  const step = (before - after) / (count + 1)
  if (!Number.isFinite(step) || step < minStep(before, after)) {
    return null
  }
  const ranks = Array.from({ length: count }, (_, index) => before - step * (index + 1))
  const chain = [before, ...ranks, after]
  const strict = chain.every((value, index) => index === 0 || chain[index - 1]! > value)
  return strict ? ranks : null
}

/**
 * The target section in the order it shows, with the dragged rows taken out. Rows the section
 * holds but does not show (`hidden`) keep their place after the visible row they follow now.
 */
function sectionOrder(
  orderedIds: readonly string[],
  visibleRest: readonly string[],
  hiddenRest: readonly string[]
): string[] {
  const visibleSet = new Set(visibleRest)
  const hiddenSet = new Set(hiddenRest)
  const anchored = new Map<string | null, string[]>()
  let previous: string | null = null
  for (const id of orderedIds) {
    if (visibleSet.has(id)) {
      previous = id
    } else if (hiddenSet.has(id)) {
      anchored.set(previous, [...(anchored.get(previous) ?? []), id])
    }
  }
  return [
    ...(anchored.get(null) ?? []),
    ...visibleRest.flatMap((id) => [id, ...(anchored.get(id) ?? [])])
  ]
}

/**
 * Evenly renumbers the target section with the moved rows at the drop point, so the result is
 * exactly where the user dropped. Rows whose stored manual order already has the new value are
 * not written again; the moved rows always are.
 */
function renumberSection(
  state: GroupDropState,
  order: readonly string[],
  moved: readonly string[],
  keys: ReadonlyMap<string, number>,
  now: number
): OrderUpdates {
  const stored = new Map<string, number | undefined>()
  for (const row of Object.values(state.worktreesByRepo).flat()) {
    stored.set(row.id, row.manualOrder)
  }
  for (const workspace of state.folderWorkspaces) {
    const row = folderWorkspaceToWorktree(workspace)
    stored.set(row.id, row.manualOrder)
  }
  const finite = order.flatMap((id) => {
    const key = keys.get(id)
    return key !== undefined && Number.isFinite(key) ? [key] : []
  })
  const top = finite.length > 0 ? Math.max(...finite) : now
  const movedSet = new Set(moved)
  const updates = new Map<string, { manualOrder: number }>()
  order.forEach((id, index) => {
    const manualOrder = top - index * GROUP_DROP_ORDER_STRIDE
    if (movedSet.has(id) || stored.get(id) !== manualOrder) {
      updates.set(id, { manualOrder })
    }
  })
  return updates
}

/**
 * Manual-order values for a drop under manual sort. Normally only the dragged rows are written,
 * placed between their new neighbours' effective keys: upstream's group-drop ranking renumbers
 * every row as soon as one still sorts by sortOrder, which reshuffled the whole ungrouped list.
 * When the neighbours tie, or the gap between them has no room left for a value strictly between,
 * the target section alone is renumbered (in its shown order, the moved rows at the drop point),
 * so the drop lands exactly where it was released. Only the returned rows change.
 */
export function buildGroupDropOrder(
  state: GroupDropState,
  groups: readonly WorktreeDragGroup[],
  target: GroupDropTarget,
  draggedIds: readonly string[],
  dropIndex: number,
  belongsToTarget: (id: string) => boolean,
  now = Date.now()
): OrderUpdates {
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
  if (before === undefined && after === undefined) {
    return new Map(
      moved.map((id, index) => [id, { manualOrder: now - index * GROUP_DROP_ORDER_STRIDE }])
    )
  }
  if (before === undefined) {
    return new Map(
      moved.map((id, index) => [
        id,
        { manualOrder: after! + (count - index) * GROUP_DROP_ORDER_STRIDE }
      ])
    )
  }
  if (after === undefined) {
    return new Map(
      moved.map((id, index) => [
        id,
        { manualOrder: before - (index + 1) * GROUP_DROP_ORDER_STRIDE }
      ])
    )
  }
  const between = ranksBetween(before, after, count)
  if (between) {
    return new Map(moved.map((id, index) => [id, { manualOrder: between[index]! }]))
  }
  const visibleRest = visible.filter((id) => !dragged.has(id))
  const section = sectionOrder(
    catalog.orderedIds,
    visibleRest,
    hidden.filter((id) => !dragged.has(id))
  )
  const insertAt = at < visibleRest.length ? section.indexOf(visibleRest[at]!) : section.length
  const order = [...section.slice(0, insertAt), ...moved, ...section.slice(insertAt)]
  return renumberSection(state, order, moved, keys, now)
}
