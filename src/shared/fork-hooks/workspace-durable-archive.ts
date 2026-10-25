// fork: 软删除后的本机隐藏。未登记时扫描结果原样返回，不改 isArchived。

export type DurableArchiveRow = {
  id: string
  path: string
  repoId: string
  hostId?: string
  identity?: { key: string }
  isArchived: boolean
}

type ApplyDurableArchive = <T extends DurableArchiveRow>(rows: readonly T[]) => T[]

let apply: ApplyDurableArchive | undefined

export function registerDurableWorkspaceArchive(next: ApplyDurableArchive | undefined): void {
  apply = next
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
