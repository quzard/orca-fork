// Maps buildSidebarRowPlan's positional args. Indexes follow that signature.
import type { SidebarRowPlan } from '../../shared/fork-hooks/sidebar-group-mode'
import { delegateRegisteredSidebarRowPlan } from '../../shared/fork-hooks/sidebar-group-mode'

export function takeRegisteredSidebarRowPlan(
  args: ArrayLike<unknown>,
  workspaceSortBy: unknown
): SidebarRowPlan | undefined {
  const groupBy = args[0]
  if (typeof groupBy !== 'string') {
    return undefined
  }
  return delegateRegisteredSidebarRowPlan(groupBy, {
    worktrees: args[1],
    repoMap: args[2],
    prCache: args[3],
    workspaceStatuses: args[6],
    projectOrderBy: args[7],
    lineageById: args[8],
    worktreeMap: args[9],
    nestLineage: args[10],
    settings: args[11],
    projectGroups: args[12],
    placeholderRepoIds: args[13],
    pendingCreations: args[16],
    projectGrouping: args[17],
    folderWorkspaces: args[18],
    hostLabelById: args[19],
    defaultHostId: args[20],
    pinnedDisplayPolicy: args[21],
    filterRepoIds: args[22],
    workspaceSortBy
  })
}
