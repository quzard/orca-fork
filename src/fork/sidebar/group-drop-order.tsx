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

function storedManualOrders(state: GroupDropState): Map<string, number | undefined> {
  const stored = new Map<string, number | undefined>()
  for (const row of Object.values(state.worktreesByRepo).flat()) {
    stored.set(row.id, row.manualOrder)
  }
  for (const workspace of state.folderWorkspaces) {
    const row = folderWorkspaceToWorktree(workspace)
    stored.set(row.id, row.manualOrder)
  }
  return stored
}

function changedOnly(
  ranked: readonly (readonly [string, number])[],
  moved: ReadonlySet<string>,
  stored: ReadonlyMap<string, number | undefined>
): OrderUpdates {
  const updates = new Map<string, { manualOrder: number }>()
  for (const [id, manualOrder] of ranked) {
    if (moved.has(id) || stored.get(id) !== manualOrder) {
      updates.set(id, { manualOrder })
    }
  }
  return updates
}

/**
 * Evenly renumbers the target section with the moved rows at the drop point, so the result is
 * exactly where the user dropped. Rows whose stored manual order already has the new value are
 * not written again; the moved rows always are. Values start at the section's own top key, so they
 * can pass rows of other sections: the last resort when renumberWithinList finds no room.
 */
function renumberSection(
  state: GroupDropState,
  order: readonly string[],
  moved: readonly string[],
  keys: ReadonlyMap<string, number>,
  now: number
): OrderUpdates {
  const finite = order.flatMap((id) => {
    const key = keys.get(id)
    return key !== undefined && Number.isFinite(key) ? [key] : []
  })
  const top = finite.length > 0 ? Math.max(...finite) : now
  return changedOnly(
    order.map((id, index) => [id, top - index * GROUP_DROP_ORDER_STRIDE] as const),
    new Set(moved),
    storedManualOrders(state)
  )
}

/**
 * Renumbers only the run of target-section rows around the drop, inside the gap its neighbours
 * from other sections leave in the full list. Every other row keeps its key, so the order across
 * all rows (what another group-by mode shows) is unchanged apart from the moved rows. Returns null
 * when `order` does not follow the full list or those neighbours leave no room.
 */
function renumberWithinList(
  state: GroupDropState,
  globalOrder: readonly string[],
  order: readonly string[],
  moved: readonly string[],
  keys: ReadonlyMap<string, number>,
  now: number
): OrderUpdates | null {
  const movedSet = new Set(moved)
  const first = order.findIndex((id) => movedSet.has(id))
  const prev = first > 0 ? order[first - 1] : undefined
  const next = order[first + moved.length]
  const section = new Set(order)
  const fixedAndSection = globalOrder.filter((id) => !movedSet.has(id) && keys.has(id))
  const inSection = fixedAndSection.filter((id) => section.has(id))
  const sectionRest = order.filter((id) => !movedSet.has(id))
  if (
    first === -1 ||
    inSection.length !== sectionRest.length ||
    inSection.some((id, index) => sectionRest[index] !== id)
  ) {
    return null
  }
  const full = [...fixedAndSection]
  const anchor = prev !== undefined ? full.indexOf(prev) + 1 : next ? full.indexOf(next) : -1
  if (anchor < 0) {
    return null
  }
  full.splice(anchor, 0, ...moved)
  let start = anchor
  while (start > 0 && section.has(full[start - 1]!)) {
    start -= 1
  }
  let end = anchor + moved.length
  while (end < full.length && section.has(full[end]!)) {
    end += 1
  }
  const run = full.slice(start, end)
  const upper = start > 0 ? keys.get(full[start - 1]!) : undefined
  const lower = end < full.length ? keys.get(full[end]!) : undefined
  let values: number[] | null
  if (upper !== undefined && lower !== undefined) {
    values = ranksBetween(upper, lower, run.length)
  } else if (upper !== undefined) {
    values = run.map((_, index) => upper - (index + 1) * GROUP_DROP_ORDER_STRIDE)
  } else if (lower !== undefined) {
    values = run.map((_, index) => lower + (run.length - index) * GROUP_DROP_ORDER_STRIDE)
  } else {
    const finite = run.flatMap((id) => {
      const key = keys.get(id)
      return key !== undefined && Number.isFinite(key) ? [key] : []
    })
    const top = finite.length > 0 ? Math.max(...finite) : now
    values = run.map((_, index) => top - index * GROUP_DROP_ORDER_STRIDE)
  }
  if (!values || values.some((value) => !Number.isFinite(value))) {
    return null
  }
  return changedOnly(
    run.map((id, index) => [id, values[index]!] as const),
    movedSet,
    storedManualOrders(state)
  )
}

/**
 * Manual-order values for a drop under manual sort. Normally only the dragged rows are written,
 * placed between their new neighbours' effective keys: upstream's group-drop ranking renumbers
 * every row as soon as one still sorts by sortOrder, which reshuffled the whole ungrouped list.
 * When the neighbours tie, or the gap between them has no room left for a value strictly between,
 * the target section's rows around the drop are renumbered (in their shown order, the moved rows
 * at the drop point), so the drop lands exactly where it was released. Those values stay inside the
 * gap left by rows of other sections, so the order across the full list is kept; only when that gap
 * has no room either is the whole section renumbered from its own top. Only the returned rows change.
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
  return (
    renumberWithinList(state, catalog.orderedIds, order, moved, keys, now) ??
    renumberSection(state, order, moved, keys, now)
  )
}
