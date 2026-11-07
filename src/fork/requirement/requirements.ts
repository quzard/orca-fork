// 需求是同一主机上、以已有工作区为父级的血缘分组，不是项目组。
import type { ExecutionHostId } from '../../shared/execution-host'
import { folderWorkspaceKey } from '../../shared/workspace-scope'

export const REQUIREMENT_ROOT_LABEL = '需求根'

let readRootLabel = (): string => REQUIREMENT_ROOT_LABEL

export function registerRequirementRootLabel(read: () => string): void {
  readRootLabel = read
}

export function requirementRootLabel(): string {
  return readRootLabel()
}
export const REQUIREMENT_HEADER_PREFIX = 'requirement:'

export function requirementHeaderKey(hostId: string, requirementId: string): string {
  return `${REQUIREMENT_HEADER_PREFIX}${encodeURIComponent(hostId)}/${encodeURIComponent(requirementId)}`
}

export function parseRequirementHeaderKey(
  key: string
): { hostId: string; requirementId: string } | null {
  if (!key.startsWith(REQUIREMENT_HEADER_PREFIX)) {
    return null
  }
  const rest = key.slice(REQUIREMENT_HEADER_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) {
    return null
  }
  return {
    hostId: decodeURIComponent(rest.slice(0, slash)),
    requirementId: decodeURIComponent(rest.slice(slash + 1))
  }
}
export const REQUIREMENT_HISTORY_PREFIX = 'requirement-overview:'

export type RequirementWorkspace = {
  id: string
  hostId: ExecutionHostId
  name: string
  path: string
  archived: boolean
  kind: 'folder' | 'git'
}

export type RequirementLink = {
  childId: string
  parentId: string
  parentInstanceId: string | null
  /** 父级 instance 对不上文件夹 id 或 git instance 时为 true。 */
  stale: boolean
}

export type RequirementRow = RequirementWorkspace & {
  role: 'root' | 'member'
  lineage: 'root' | 'confirmed' | 'stale'
}

export type Requirement = {
  id: string
  hostId: ExecutionHostId
  name: string
  root: RequirementWorkspace
  rows: RequirementRow[]
}

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

function byName(left: RequirementRow, right: RequirementRow): number {
  const name = left.name.localeCompare(right.name, undefined, { numeric: true })
  return name === 0 ? left.id.localeCompare(right.id) : name
}

export function requirementHistoryEntry(requirementId: string): string {
  return `${REQUIREMENT_HISTORY_PREFIX}${requirementId}`
}

export function requirementIdFromHistory(entry: string): string | null {
  return entry.startsWith(REQUIREMENT_HISTORY_PREFIX)
    ? entry.slice(REQUIREMENT_HISTORY_PREFIX.length)
    : null
}

export function requirementsFromWorkspaces(input: {
  workspaces: readonly RequirementWorkspace[]
  links: readonly RequirementLink[]
}): Requirement[] {
  const byId = new Map(input.workspaces.map((workspace) => [workspace.id, workspace]))
  const grouped = new Map<string, RequirementLink[]>()
  for (const link of input.links) {
    const list = grouped.get(link.parentId) ?? []
    list.push(link)
    grouped.set(link.parentId, list)
  }
  const requirements: Requirement[] = []
  for (const [parentId, links] of grouped) {
    const root = byId.get(parentId)
    if (!root) {
      continue
    }
    const members: RequirementRow[] = []
    for (const link of links) {
      if (link.childId === parentId) {
        continue
      }
      const child = byId.get(link.childId)
      if (!child || child.hostId !== root.hostId) {
        continue
      }
      members.push({ ...child, role: 'member', lineage: link.stale ? 'stale' : 'confirmed' })
    }
    members.sort(byName)
    const rootRow: RequirementRow = { ...root, role: 'root', lineage: 'root' }
    requirements.push({
      id: root.id,
      hostId: root.hostId,
      name: root.name,
      root,
      rows: [rootRow, ...members]
    })
  }
  requirements.sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  )
  return collapseNestedRequirements(requirements)
}

function collapseNestedRequirements(requirements: Requirement[]): Requirement[] {
  const memberIds = new Set<string>()
  for (const requirement of requirements) {
    for (const row of requirement.rows) {
      if (row.role === 'member') {
        memberIds.add(row.id)
      }
    }
  }
  return requirements
    .filter((requirement) => !memberIds.has(requirement.id))
    .map((requirement) => appendDescendants(requirement, requirements))
}

function appendDescendants(requirement: Requirement, all: readonly Requirement[]): Requirement {
  const seen = new Set(requirement.rows.map((row) => row.id))
  const extra: RequirementRow[] = []
  const queue = requirement.rows.filter((row) => row.role === 'member').map((row) => row.id)
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) {
      continue
    }
    const nested = all.find((entry) => entry.id === id)
    if (!nested) {
      continue
    }
    for (const row of nested.rows) {
      if (row.role !== 'member' || seen.has(row.id)) {
        continue
      }
      seen.add(row.id)
      extra.push(row)
      queue.push(row.id)
    }
  }
  return extra.length === 0
    ? requirement
    : { ...requirement, rows: [...requirement.rows, ...extra] }
}

export function folderRequirementId(folderId: string): string {
  return folderWorkspaceKey(folderId)
}

/** 名字是 root 的成员仍然是成员。需求根只看父工作区 id。 */
export function isRequirementRoot(row: Pick<RequirementRow, 'role'>): boolean {
  return row.role === 'root'
}

export function presentRequirementFolderWorktree<T extends { displayName: string }>(
  key: string,
  worktree: T
): T {
  if (!key.startsWith('requirement-root:')) {
    return worktree
  }
  return { ...worktree, displayName: requirementRootLabel() }
}

export function requirementRowLabel(row: RequirementRow): string {
  return row.role === 'root' ? requirementRootLabel() : row.name || basename(row.path)
}

export type OrderedRequirementRows = {
  visible: RequirementRow[]
  folded: RequirementRow[]
}

export function isInactiveRequirementRow(row: RequirementRow, quiet: ReadonlySet<string>): boolean {
  return row.archived || quiet.has(row.id)
}

/** 根始终在最前。不活跃的成员折到后面，未知状态不算不活跃。 */
export function orderRequirementRows(
  rows: readonly RequirementRow[],
  options: { query: string; showInactive: boolean; quietIds: ReadonlySet<string> }
): OrderedRequirementRows {
  const query = options.query.trim().toLocaleLowerCase()
  const root = rows.find((row) => row.role === 'root') ?? null
  const members = rows.filter((row) => row.role === 'member')
  const matches = (row: RequirementRow): boolean => {
    if (!query) {
      return true
    }
    const label = requirementRowLabel(row).toLocaleLowerCase()
    return (
      label.includes(query) ||
      row.path.toLocaleLowerCase().includes(query) ||
      row.name.toLocaleLowerCase().includes(query)
    )
  }
  const active: RequirementRow[] = []
  const folded: RequirementRow[] = []
  for (const row of members.filter(matches).sort(byName)) {
    if (isInactiveRequirementRow(row, options.quietIds)) {
      folded.push(row)
    } else {
      active.push(row)
    }
  }
  const visible = [
    ...(root && matches(root) ? [root] : []),
    ...active,
    ...(options.showInactive ? folded : [])
  ]
  return { visible, folded: options.showInactive ? [] : folded }
}
