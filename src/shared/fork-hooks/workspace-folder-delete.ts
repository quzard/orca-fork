// fork: 删除工作区时是否连目录一起删。未登记时没有复选框，确认仍走上游的 git worktree remove。

import type { Repo } from '../repo-types'
import { isFolderRepo } from '../repo-kind'
import type { ExecutionHostId } from '../execution-host'

export type WorkspaceRecordIdentity = {
  id: string
  instanceId?: string
  hostId?: ExecutionHostId
}

export type WorkspaceLineageKeptNotice = {
  title: string
  body: string
}

// 返回 null：这次不接管，调用方继续硬删除（文件夹工作区本来就不删目录）。
// 返回数组：已按“只移出 Orca”处理。空数组表示都失败了，调用方不要再硬删除。
type RemoveRecords = (
  identities: readonly WorkspaceRecordIdentity[]
) => Promise<readonly WorkspaceRecordIdentity[] | null>

type Registration = {
  keepFolderSuffix: (gitWorktreeCount: number) => string
  lineageKeptNotice: (childCount: number) => WorkspaceLineageKeptNotice
  removeRecords: RemoveRecords
}

let registration: Registration | undefined

export function registerWorkspaceFolderDelete(next: Registration | undefined): void {
  registration = next
}

export function workspaceFolderDeleteRegistered(): boolean {
  return registration !== undefined
}

/** 这次确认里，上游会从 git 和磁盘删掉的工作区个数。文件夹工作区不算。 */
export function gitWorktreesInDelete(
  repos: readonly Pick<Repo, 'id' | 'kind'>[],
  worktrees: readonly { repoId: string }[]
): number {
  const folderRepoIds = new Set<string>()
  for (const repo of repos) {
    if (isFolderRepo(repo)) {
      folderRepoIds.add(repo.id)
    }
  }
  let folders = 0
  for (const worktree of worktrees) {
    if (folderRepoIds.has(worktree.repoId)) {
      folders += 1
    }
  }
  return worktrees.length - folders
}

export function workspaceFolderDeleteOffered(gitWorktreeCount: number): boolean {
  return registration !== undefined && gitWorktreeCount > 0
}

export function workspaceFolderDeleteSuffix(
  upstream: string,
  gitWorktreeCount: number,
  deleteFolder: boolean
): string {
  if (!registration || deleteFolder || gitWorktreeCount <= 0) {
    return upstream
  }
  return registration.keepFolderSuffix(gitWorktreeCount)
}

export function workspaceLineageKeptNotice(childCount: number): WorkspaceLineageKeptNotice | null {
  if (!registration || childCount <= 0) {
    return null
  }
  return registration.lineageKeptNotice(childCount)
}

export function takeWorkspaceRecordRemoval(
  identities: readonly WorkspaceRecordIdentity[],
  deleteFolder: boolean
): Promise<readonly WorkspaceRecordIdentity[] | null> {
  if (!registration || deleteFolder) {
    return Promise.resolve(null)
  }
  return registration.removeRecords(identities)
}
