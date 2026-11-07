import type { ExecutionHostId } from '../../shared/execution-host'
import type { Requirement, RequirementLink, RequirementWorkspace } from './requirements'
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

function asHost(value: string | null | undefined): ExecutionHostId {
  if (value === 'local' || value?.startsWith('ssh:') || value?.startsWith('runtime:')) {
    // SAFETY: those prefixes are the ExecutionHostId forms; anything else uses local below.
    return value as ExecutionHostId
  }
  return 'local'
}

export function requirementsForSidebar(input: {
  worktrees: readonly SidebarWorktree[]
  folders: readonly SidebarFolder[]
  lineageById: Readonly<Record<string, SidebarLineage>>
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
        ? lineage.parentWorktreeInstanceId !== parent.id.slice('folder:'.length)
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
  return requirementsFromWorkspaces({ workspaces, links })
}
