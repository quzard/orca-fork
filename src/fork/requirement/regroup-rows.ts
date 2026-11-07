// 把需求行插回 host-directory 结果。没有需求时原样返回。
import type {
  Row,
  WorktreeRow,
  FolderWorkspaceRow,
  GroupHeaderRow
} from '../../shared/sidebar-list/row-types'
import type { Requirement } from './requirements'
import { requirementHeaderKey, requirementRootLabel } from './requirements'

function rowWorkspaceId(row: Row): string | null {
  if (row.type === 'item') {
    return row.worktree.id
  }
  if (row.type === 'folder-workspace') {
    return `folder:${row.folderWorkspace.id}`
  }
  return null
}

function withoutIds(rows: readonly Row[], ids: ReadonlySet<string>): Row[] {
  return rows.flatMap((row) => {
    const id = rowWorkspaceId(row)
    if (id && ids.has(id)) {
      return []
    }
    if (row.type !== 'header' || !row.worktreeIds) {
      return [row]
    }
    const worktreeIds = row.worktreeIds.filter((entry) => !ids.has(entry))
    return [{ ...row, worktreeIds, count: worktreeIds.length }]
  })
}

function rootRow(row: Row): Row {
  if (row.type === 'item') {
    const next: WorktreeRow = {
      ...row,
      rowKey: `requirement-root:${row.worktree.id}`,
      directoryLabel: undefined,
      worktree: { ...row.worktree, displayName: requirementRootLabel() }
    }
    return next
  }
  if (row.type === 'folder-workspace') {
    const next: FolderWorkspaceRow = { ...row, key: `requirement-root:${row.folderWorkspace.id}` }
    return next
  }
  return row
}

export function regroupRequirementRows(
  rows: readonly Row[],
  requirements: readonly Requirement[]
): Row[] {
  if (requirements.length === 0) {
    return [...rows]
  }
  const claimed = new Set<string>()
  for (const requirement of requirements) {
    for (const member of requirement.rows) {
      claimed.add(member.id)
    }
  }
  const kept = withoutIds(rows, claimed)
  const source = new Map<string, Row>()
  for (const row of rows) {
    const id = rowWorkspaceId(row)
    if (id) {
      source.set(id, row)
    }
  }
  const byHost = new Map<string, Row[]>()
  for (const requirement of requirements) {
    const members = requirement.rows.flatMap((member) => {
      const row = source.get(member.id)
      if (!row) {
        return []
      }
      return [member.role === 'root' ? rootRow(row) : row]
    })
    const header: GroupHeaderRow = {
      type: 'header',
      key: requirementHeaderKey(requirement.hostId, requirement.id),
      label: requirement.name,
      count: members.length,
      icon: { kind: 'all' },
      hostId: requirement.hostId,
      worktreeIds: requirement.rows.map((member) => member.id)
    }
    const block = byHost.get(requirement.hostId) ?? []
    block.push(header, ...members)
    byHost.set(requirement.hostId, block)
  }
  const seen = new Set<string>()
  const placed: Row[] = []
  for (const row of kept) {
    const host = rowHost(row)
    if (!seen.has(host)) {
      seen.add(host)
      placed.push(...(byHost.get(host) ?? []))
    }
    placed.push(row)
  }
  for (const [host, block] of byHost) {
    if (!seen.has(host)) {
      placed.push(...block)
    }
  }
  return placed
}

function rowHost(row: Row): string {
  if (row.type === 'item') {
    return row.worktree.hostId ?? 'local'
  }
  if (row.type === 'folder-workspace') {
    return row.folderWorkspace.executionHostId ?? 'local'
  }
  if (row.type === 'header' && row.hostId) {
    return row.hostId
  }
  return 'local'
}
