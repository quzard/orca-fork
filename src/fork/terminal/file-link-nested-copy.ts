// 同一路径可编辑的缓冲只留在根最深的工作区。外层已有的可写标签在内层打开后改为只读，不删标签。
// 外层还有未保存的修改时先不改：只读标签不能保存，草稿也不能丢。等它干净了再改。

import { saveTerminalFileLinkStay } from './file-link-stay'

type NestedCopyFile = {
  id?: string
  filePath: string
  worktreeId: string
  readOnly?: boolean
  isDirty?: boolean
  mode?: string
  externalSshTargetId?: string
  runtimeEnvironmentId?: string | null
}

function isEditTab(file: NestedCopyFile): boolean {
  return file.mode === undefined || file.mode === 'edit'
}

function sameTab(before: NestedCopyFile, after: NestedCopyFile): boolean {
  return (
    before.filePath === after.filePath &&
    before.worktreeId === after.worktreeId &&
    before.readOnly === after.readOnly &&
    before.isDirty === after.isDirty &&
    before.mode === after.mode &&
    before.externalSshTargetId === after.externalSshTargetId &&
    before.runtimeEnvironmentId === after.runtimeEnvironmentId
  )
}

/** Paths whose tab or draft changed. The owner lookup can skip the rest. */
export function terminalFileLinkCopyTouchedPaths<T extends NestedCopyFile>(
  previousFiles: readonly T[],
  nextFiles: readonly T[],
  previousDrafts: Readonly<Record<string, string>> | undefined,
  nextDrafts: Readonly<Record<string, string>> | undefined
): Set<string> {
  const previousById = new Map(previousFiles.map((file) => [file.id ?? file.filePath, file]))
  const nextIds = new Set(nextFiles.map((file) => file.id ?? file.filePath))
  const paths = new Set<string>()
  for (const file of previousFiles) {
    if (!nextIds.has(file.id ?? file.filePath)) {
      paths.add(file.filePath)
    }
  }
  for (const file of nextFiles) {
    const before = previousById.get(file.id ?? file.filePath)
    if (!before || !sameTab(before, file)) {
      paths.add(file.filePath)
      if (before) {
        paths.add(before.filePath)
      }
    }
  }
  const beforeDrafts = previousDrafts ?? {}
  const afterDrafts = nextDrafts ?? {}
  for (const file of [...previousFiles, ...nextFiles]) {
    if (!file.id) {
      continue
    }
    const hadDraft = beforeDrafts[file.id] !== undefined
    const hasDraft = afterDrafts[file.id] !== undefined
    if (hadDraft !== hasDraft) {
      paths.add(file.filePath)
    }
  }
  return paths
}

/**
 * `deepestWorktreeId` 返回包含该路径的最深工作区；这个文件自己就是最深的，或还不知道，就返回 null。
 * 更深的那张标签自己是只读的，就不降级：否则一份可写的都不剩。
 * 这张标签有未保存的修改时也不降级。没有改动时返回 null。
 */
export function demoteShallowerWritableCopies<T extends NestedCopyFile>(
  openFiles: readonly T[],
  deepestWorktreeId: (file: T) => string | null,
  hostOf: (file: T) => string,
  hasUnsavedEdits: (file: T) => boolean = () => false
): T[] | null {
  let changed = false
  const next: T[] = []
  for (const file of openFiles) {
    const blocked =
      file.readOnly === true || !isEditTab(file) || file.isDirty === true || hasUnsavedEdits(file)
    const deepest = blocked ? null : deepestWorktreeId(file)
    const demote =
      deepest !== null &&
      openFiles.some(
        (other) =>
          other !== file &&
          other.filePath === file.filePath &&
          other.worktreeId === deepest &&
          other.readOnly !== true &&
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
