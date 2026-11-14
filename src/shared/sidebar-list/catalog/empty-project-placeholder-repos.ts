<<<<<<< HEAD:src/shared/sidebar-list/empty-project-placeholder-repos.ts
import type { Repo } from '../repo-types'
import { isRepoHidden, withoutHiddenFilterRepoIds, type HiddenProjects } from '../hidden-projects'
import type { Worktree } from '../worktree/types'
import { hasProjectHeaderChrome } from '../fork-hooks/sidebar-group-mode'
import type { WorktreeGroupBy } from './row-types'
=======
import type { Repo } from '../../repo-types'
import {
  isRepoHidden,
  withoutHiddenFilterRepoIds,
  type HiddenProjects
} from '../../hidden-projects'
import type { Worktree } from '../../worktree/types'
import type { WorktreeGroupBy } from '../row-types'
>>>>>>> abcf0a559f8f5ffa4da4aff550920f2587b56ad3:src/shared/sidebar-list/catalog/empty-project-placeholder-repos.ts

export function getEmptyProjectPlaceholderRepoIds(args: {
  groupBy: WorktreeGroupBy
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, readonly Worktree[] | undefined>>
  visibleWorktrees: readonly Worktree[]
  filterRepoIds: readonly string[]
  /** Over every loaded repo row: a filter id with no listed copy is ignored, as the row filter does. */
  hiddenProjects: HiddenProjects
  /** Repos whose checkout a VM create in progress has not adopted; its pending row stands for them. */
  pendingVmRepoIds?: ReadonlySet<string>
}): Set<string> {
  if (!hasProjectHeaderChrome(args.groupBy)) {
    return new Set()
  }

  const listedFilterIds = withoutHiddenFilterRepoIds(args.filterRepoIds, args.hiddenProjects)
  const filterSet = listedFilterIds.length > 0 ? new Set(listedFilterIds) : null
  const visibleRepoIds = new Set(args.visibleWorktrees.map((worktree) => worktree.repoId))
  const placeholderRepoIds = new Set<string>()
  for (const repo of args.repos) {
    if (
      (filterSet && !filterSet.has(repo.id)) ||
      args.pendingVmRepoIds?.has(repo.id) ||
      isRepoHidden(repo)
    ) {
      continue
    }
    const hasNoWorktrees = (args.worktreesByRepo[repo.id]?.length ?? 0) === 0
    // Workspace filters must not change persisted Project Group membership (#8865).
    const isFilteredProjectGroupMember = repo.projectGroupId != null && !visibleRepoIds.has(repo.id)
    if (hasNoWorktrees || isFilteredProjectGroupMember) {
      placeholderRepoIds.add(repo.id)
    }
  }
  return placeholderRepoIds
}
