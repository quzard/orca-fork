import type { ExecutionHostId } from '../../shared/execution-host'
import type {
  Requirement,
  RequirementLink,
  RequirementRow,
  RequirementWorkspace
} from './requirements'
import { requirementsFromWorkspaces } from './requirements'

type SidebarWorktree = {
  id: string
  hostId?: string | null
  displayName?: string | null
  path: string
  isArchived?: boolean
  instanceId?: string | null
}

type SidebarFolder = {
  id: string
  name: string
  folderPath: string
  executionHostId?: string | null
  connectionId?: string | null
  isArchived?: boolean
}

type SidebarLineage = {
  parentWorktreeId: string
  parentWorktreeInstanceId: string
  worktreeInstanceId?: string
}

function isHostId(value: string): value is ExecutionHostId {
  return value === 'local' || value.startsWith('ssh:') || value.startsWith('runtime:')
}

function asHost(value: string | null | undefined): ExecutionHostId {
  return value && isHostId(value) ? value : 'local'
}

export function requirementsForSidebar(input: {
  worktrees: readonly SidebarWorktree[]
  folders: readonly SidebarFolder[]
  lineageById: Readonly<Record<string, SidebarLineage>>
  workspaceLineage?: readonly {
    childWorkspaceKey: string
    childInstanceId?: string | null
    parentWorkspaceKey: string
    parentInstanceId?: string | null
  }[]
  defaultHostId?: ExecutionHostId
}): Requirement[] {
  const fallback = input.defaultHostId ?? 'local'
  const workspaces: RequirementWorkspace[] = [
    ...input.folders.map((folder) => ({
      id: `folder:${folder.id}`,
      hostId: asHost(folder.executionHostId ?? fallback),
      name: folder.name,
      path: folder.folderPath,
      archived: folder.isArchived === true,
      kind: 'folder' as const
    })),
    ...input.worktrees.map((worktree) => ({
      id: worktree.id,
      hostId: asHost(worktree.hostId ?? fallback),
      name: worktree.displayName || worktree.path,
      path: worktree.path,
      archived: worktree.isArchived === true,
      kind: 'git' as const
    }))
  ]
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const links: RequirementLink[] = []
  for (const [childId, lineage] of Object.entries(input.lineageById)) {
    const parent = byId.get(lineage.parentWorktreeId)
    const child = input.worktrees.find((worktree) => worktree.id === childId)
    const parentWorktree = input.worktrees.find(
      (worktree) => worktree.id === lineage.parentWorktreeId
    )
    const parentStale =
      parent?.kind === 'folder'
        ? Boolean(lineage.parentWorktreeInstanceId) &&
          lineage.parentWorktreeInstanceId !== parent.id.slice('folder:'.length)
        : Boolean(
            parentWorktree?.instanceId &&
            parentWorktree.instanceId !== lineage.parentWorktreeInstanceId
          )
    const childStale = Boolean(
      child?.instanceId &&
      lineage.worktreeInstanceId &&
      child.instanceId !== lineage.worktreeInstanceId
    )
    const stale = parentStale || childStale
    links.push({
      childId,
      parentId: lineage.parentWorktreeId,
      parentInstanceId: lineage.parentWorktreeInstanceId,
      stale
    })
  }
  const seenChildren = new Set(links.map((link) => link.childId))
  for (const lineage of input.workspaceLineage ?? []) {
    if (!lineage.parentWorkspaceKey.startsWith('folder:')) {
      continue
    }
    const childId = lineage.childWorkspaceKey.startsWith('worktree:')
      ? lineage.childWorkspaceKey.slice('worktree:'.length)
      : lineage.childWorkspaceKey
    if (seenChildren.has(childId)) {
      continue
    }
    const parent = byId.get(lineage.parentWorkspaceKey)
    const stale = Boolean(
      parent?.kind === 'folder' &&
      lineage.parentInstanceId &&
      lineage.parentInstanceId !== parent.id.slice('folder:'.length)
    )
    seenChildren.add(childId)
    links.push({
      childId,
      parentId: lineage.parentWorkspaceKey,
      parentInstanceId: lineage.parentInstanceId ?? null,
      stale
    })
  }
  return requirementsFromWorkspaces({ workspaces, links })
}

/** 还没有子成员时也打开概览，这样全新配置能走到 Dry run。 */
export function openRequirementForSidebar(
  input: Parameters<typeof requirementsForSidebar>[0] & { openId: string | null }
): Requirement | null {
  const found = requirementsForSidebar(input).find((entry) => entry.id === input.openId) ?? null
  if (found || !input.openId) {
    return found
  }
  const folder = input.folders.find((entry) => `folder:${entry.id}` === input.openId)
  if (!folder) {
    return null
  }
  const hostId = asHost(folder.executionHostId ?? input.defaultHostId)
  const root: RequirementWorkspace = {
    id: input.openId,
    hostId,
    name: folder.name,
    path: folder.folderPath,
    archived: folder.isArchived === true,
    kind: 'folder'
  }
  const row: RequirementRow = { ...root, role: 'root', lineage: 'root' }
  return { id: root.id, hostId, name: folder.name, root, rows: [row] }
}
