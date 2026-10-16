// Keep a workspace group when an older peer omits the optional field. Null still ungroups.

import type { SidebarGroupRow } from '../../shared/fork-hooks/sidebar-group-membership'

export function preserveOmittedSidebarGroupIds<T extends SidebarGroupRow>(
  incoming: readonly T[],
  current: readonly SidebarGroupRow[] | undefined,
  matches: (row: SidebarGroupRow) => boolean
): T[] {
  if (!current) {
    return [...incoming]
  }
  const previous = new Map(
    current.filter((row) => matches(row)).map((row) => [row.id, row.sidebarGroupId])
  )
  return incoming.map((row) => {
    if (!matches(row) || row.sidebarGroupId !== undefined) {
      return row
    }
    const kept = previous.get(row.id)
    if (kept === undefined) {
      return row
    }
    return { ...row, sidebarGroupId: kept }
  })
}
