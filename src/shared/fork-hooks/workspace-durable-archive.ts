// fork: 软删除后的本机隐藏。未登记时扫描结果原样返回，不改 isArchived，也不清记录。

import type { ExecutionHostId } from '../execution-host'

export type DurableArchiveRow = {
  id: string
  path: string
  repoId: string
  hostId?: string
  identity?: { key: string }
  isArchived: boolean
}

// 新建或硬删除成功时交给登记的实现。工作区形状留在这里，避免 shared 依赖渲染进程类型。
export type DurableArchiveWorkspace =
  | {
      worktree: {
        id: string
        path: string
        repoId: string
        hostId?: ExecutionHostId
        identity?: { key: string }
      }
    }
  | {
      folderWorkspace: {
        id: string
        folderPath: string
        projectGroupId: string
        executionHostId?: ExecutionHostId | null
        connectionId?: string | null
      }
    }

type ApplyDurableArchive = <T extends DurableArchiveRow>(rows: readonly T[]) => T[]
type ReleaseDurableArchive = (workspace: DurableArchiveWorkspace) => void
type ReleaseRemovedWorkspace = (worktreeId: string, hostId: ExecutionHostId | undefined) => void
type ReactivateImportedWorktrees = (
  projectId: string,
  worktreePaths: readonly string[]
) => Promise<boolean>

let apply: ApplyDurableArchive | undefined
let release: ReleaseDurableArchive | undefined
let releaseRemoved: ReleaseRemovedWorkspace | undefined
let reactivateImported: ReactivateImportedWorktrees | undefined

export function registerDurableWorkspaceArchive(next: ApplyDurableArchive | undefined): void {
  apply = next
}

export function registerDurableWorkspaceArchiveRelease(
  next: ReleaseDurableArchive | undefined
): void {
  release = next
}

export function applyRegisteredDurableWorkspaceArchive<T extends DurableArchiveRow>(
  rows: readonly T[]
): T[] {
  if (!apply) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: unregistered, callers keep this catalog array.
    return rows as T[]
  }
  return apply(rows)
}

/** One row that skips the listing merge (a placeholder), stamped the same way. */
export function applyRegisteredDurableArchiveToRow<T extends DurableArchiveRow>(row: T): T {
  return apply ? (apply([row])[0] ?? row) : row
}

export function releaseRegisteredDurableWorkspaceArchive(workspace: DurableArchiveWorkspace): void {
  release?.(workspace)
}

export function registerRemovedWorkspaceArchiveRelease(
  next: ReleaseRemovedWorkspace | undefined
): void {
  releaseRemoved = next
}

/** A removal the host confirmed (the row is still in the store): its hide record is moot. */
export function releaseRegisteredRemovedWorkspaceArchive(
  worktreeId: string,
  hostId: ExecutionHostId | undefined
): void {
  releaseRemoved?.(worktreeId, hostId)
}

export function registerImportedWorktreeReactivate(
  next: ReactivateImportedWorktrees | undefined
): void {
  reactivateImported = next
}

/**
 * Before an import rescans: clears the paths' archived meta and hide records. False when a write
 * failed, so the caller can treat the import as failed. Unregistered, true and nothing is written.
 */
export async function reactivateRegisteredImportedWorktrees(
  projectId: string,
  worktreePaths: readonly string[]
): Promise<boolean> {
  return reactivateImported ? reactivateImported(projectId, worktreePaths) : true
}
