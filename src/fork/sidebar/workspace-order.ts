// Sort workspaces inside one host section. Smart keeps the incoming order.
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import {
  buildWorkspaceRowComparator,
  recentActivityWithCreateGrace,
  type WorkspaceSortBy
} from '../../shared/workspace-view/workspace-row-sort'

export type OrderedWorkspace =
  | { kind: 'worktree'; worktree: Worktree; repo: Repo | undefined }
  | { kind: 'folder'; folder: FolderWorkspace }

export function orderWorkspaces(
  members: readonly OrderedWorkspace[],
  sortBy: WorkspaceSortBy | undefined,
  now: number
): OrderedWorkspace[] {
  if (!sortBy || sortBy === 'smart') {
    return [...members]
  }
  const compare = buildWorkspaceRowComparator<OrderedWorkspace>(sortBy, {
    label: (member) =>
      member.kind === 'worktree' ? member.worktree.displayName : member.folder.name,
    repoLabel: (member) =>
      member.kind === 'worktree' ? (member.repo?.displayName ?? '') : member.folder.name,
    recentActivity: (member) =>
      member.kind === 'worktree'
        ? recentActivityWithCreateGrace(
            member.worktree.lastActivityAt,
            member.worktree.createdAt,
            now
          )
        : member.folder.lastActivityAt,
    manualRank: (member) =>
      member.kind === 'worktree'
        ? (member.worktree.manualOrder ?? null)
        : (member.folder.manualOrder ?? null),
    compareSmart: () => 0
  })
  return [...members].sort(compare)
}
