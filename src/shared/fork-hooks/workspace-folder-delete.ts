// fork: 删除工作区默认只从 Orca 移除（F048）。未登记时对话框没有勾选，跳过确认仍走上游的硬删除。

import type { Worktree } from '../worktree/types'
import type { WorktreeRemovalTarget } from '../worktree/removal'

type SkipConfirmDelete = <T extends Worktree>(
  targets: readonly T[],
  onDeleted?: (deleted: WorktreeRemovalTarget[]) => void
) => readonly T[]

let skipConfirmDelete: SkipConfirmDelete | undefined

export function registerWorkspaceFolderDelete(next: SkipConfirmDelete | undefined): void {
  skipConfirmDelete = next
}

export function workspaceFolderDeleteRegistered(): boolean {
  return skipConfirmDelete !== undefined
}

/**
 * A delete that skipped its confirmation: the targets upstream still hard-deletes. Registered, git
 * workspaces are only removed from Orca (archived, reported through `onDeleted`) and folder
 * workspaces come back, since their delete already keeps the folder. Unregistered: every target.
 */
export function skipConfirmHardDeletes<T extends Worktree>(
  targets: readonly T[],
  onDeleted?: (deleted: WorktreeRemovalTarget[]) => void
): readonly T[] {
  return skipConfirmDelete ? skipConfirmDelete(targets, onDeleted) : targets
}

/**
 * One text of the lineage notice: `kept` (the keep-folder wording) when the dialog keeps folders,
 * else the caller's own translation. Exposed as `.t` so the translation call keeps its key.
 */
export function keptLineageText<A extends unknown[]>(
  translate: (...args: A) => string,
  kept: string | undefined
): { t: (...args: A) => string } {
  return { t: (...args) => kept ?? translate(...args) }
}
