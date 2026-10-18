// Sort workspaces inside one host section. Smart keeps the incoming order.
import { getFolderWorkspaceHostIdentity } from '../../shared/folder-workspace-worktree'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { Repo } from '../../shared/repo-types'
import { getWorktreeHostIdentity } from '../../shared/worktree/host-qualified-identity'
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
    // fork: 上游用主机限定 id 打破同名平局。文件夹和 git 工作区各自走已有的身份函数。
    identity: (member) =>
      member.kind === 'worktree'
        ? getWorktreeHostIdentity(member.worktree)
        : getFolderWorkspaceHostIdentity(member.folder),
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
