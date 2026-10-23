// 同一路径可编辑的缓冲只留在根最深的工作区。外层已有的可写标签在内层打开后改为只读，不删标签。

import { saveTerminalFileLinkStay } from './file-link-stay'

type NestedCopyFile = {
  filePath: string
  worktreeId: string
  readOnly?: boolean
  mode?: string
}

function isEditTab(file: NestedCopyFile): boolean {
  return file.mode === undefined || file.mode === 'edit'
}

/**
 * `deepestWorktreeId` 返回包含该路径的最深工作区；这个文件自己就是最深的，或还不知道，就返回 null。
 * 没有改动时返回 null。
 */
export function demoteShallowerWritableCopies<T extends NestedCopyFile>(
  openFiles: readonly T[],
  deepestWorktreeId: (file: T) => string | null,
  hostOf: (file: T) => string
): T[] | null {
  let changed = false
  const next: T[] = []
  for (const file of openFiles) {
    const deepest = file.readOnly === true || !isEditTab(file) ? null : deepestWorktreeId(file)
    const demote =
      deepest !== null &&
      openFiles.some(
        (other) =>
          other !== file &&
          other.filePath === file.filePath &&
          other.worktreeId === deepest &&
          isEditTab(other) &&
          hostOf(other) === hostOf(file)
      )
    if (!demote) {
      next.push(file)
      continue
    }
    changed = true
    saveTerminalFileLinkStay(file.worktreeId, file.filePath)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the copy keeps every field of T and only sets readOnly, which T already allows.
    next.push({ ...file, readOnly: true } as T)
  }
  return changed ? next : null
}
