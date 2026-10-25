// 软删除的本机隐藏记录。刷新和 git 扫描会把工作区重新列出来，元数据里的
// isArchived 对不上（没有所属仓库、主机不一致、id 写法变了）时就靠这份记录。
// 不取消 git worktree 登记，也不删目录。恢复或撤销时删掉对应记录。

import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { DurableArchiveRow } from '../../shared/fork-hooks/workspace-durable-archive'
import { worktreeIdsEqual } from '../../shared/worktree/id'

export const DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY = 'orca.fork.archived-workspaces'

export type WorkspaceArchiveRecord = {
  id: string
  path: string
  repoId: string
  hostId?: string
  identityKey?: string
  // 没有所属仓库时按路径隐藏，扫描换了仓库 id 或主机也能对上。
  pathOnly: boolean
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    const storage = globalThis.localStorage
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      return null
    }
    return storage
  } catch {
    return null
  }
}

function fieldsOf(value: object): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    fields[key] = entry
  }
  return fields
}

function textField(fields: Record<string, unknown>, key: string): string | undefined {
  const entry = fields[key]
  return typeof entry === 'string' && entry.length > 0 ? entry : undefined
}

function readRecord(value: unknown): WorkspaceArchiveRecord | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const fields = fieldsOf(value)
  const id = textField(fields, 'id')
  const repoId = textField(fields, 'repoId')
  if (!id || !repoId) {
    return null
  }
  return {
    id,
    path: textField(fields, 'path') ?? '',
    repoId,
    pathOnly: fields.pathOnly === true,
    ...(textField(fields, 'hostId') ? { hostId: textField(fields, 'hostId') } : {}),
    ...(textField(fields, 'identityKey') ? { identityKey: textField(fields, 'identityKey') } : {})
  }
}

function readRecords(): WorkspaceArchiveRecord[] {
  const raw = browserStorage()?.getItem(DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const records: WorkspaceArchiveRecord[] = []
    for (const entry of parsed) {
      const record = readRecord(entry)
      if (record) {
        records.push(record)
      }
    }
    return records
  } catch {
    return []
  }
}

function writeRecords(records: readonly WorkspaceArchiveRecord[]): void {
  try {
    browserStorage()?.setItem(DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // 写不进时这次仍会从当前列表拿掉；下次扫描可能再出现。
  }
}

function samePath(left: string, right: string): boolean {
  if (!left || !right) {
    return false
  }
  return normalizeRuntimePathForComparison(left) === normalizeRuntimePathForComparison(right)
}

// 有所属仓库的记录带主机。两边都有主机且不同，就不是同一行。
// 孤立行 pathOnly，路径对上即可，扫描换成另一个主机也隐藏。
function hostCompatible(row: DurableArchiveRow, record: WorkspaceArchiveRecord): boolean {
  if (record.pathOnly) {
    return true
  }
  return !record.hostId || !row.hostId || record.hostId === row.hostId
}

function recordMatches(row: DurableArchiveRow, record: WorkspaceArchiveRecord): boolean {
  if (
    record.identityKey &&
    row.identity?.key === record.identityKey &&
    hostCompatible(row, record)
  ) {
    return true
  }
  if (worktreeIdsEqual(row.id, record.id) && hostCompatible(row, record)) {
    return true
  }
  if (!samePath(row.path, record.path)) {
    return false
  }
  if (record.pathOnly) {
    return true
  }
  return record.repoId === row.repoId && hostCompatible(row, record)
}

function asRow(record: WorkspaceArchiveRecord): DurableArchiveRow {
  return {
    id: record.id,
    path: record.path,
    repoId: record.repoId,
    isArchived: true,
    ...(record.hostId ? { hostId: record.hostId } : {}),
    ...(record.identityKey ? { identity: { key: record.identityKey } } : {})
  }
}

export function rememberWorkspaceArchive(record: WorkspaceArchiveRecord): void {
  const records = readRecords().filter((existing) => !recordMatches(asRow(record), existing))
  records.push(record)
  writeRecords(records)
}

export function forgetWorkspaceArchive(row: DurableArchiveRow): void {
  const records = readRecords()
  const kept = records.filter((record) => !recordMatches(row, record))
  if (kept.length !== records.length) {
    writeRecords(kept)
  }
}

export function stampWorkspaceArchive<T extends DurableArchiveRow>(rows: readonly T[]): T[] {
  const records = readRecords()
  if (records.length === 0) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: nothing is archived, so this catalog array stays as given.
    return rows as T[]
  }
  let changed = false
  const next = rows.map((row) => {
    if (row.isArchived || !records.some((record) => recordMatches(row, record))) {
      return row
    }
    changed = true
    return { ...row, isArchived: true }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: no row matched, so the catalog array stays as given.
  return changed ? next : (rows as T[])
}
