import type { ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { Worktree } from '../../shared/worktree/types'
import type { WorkspaceLineage, WorktreeLineage } from '../../shared/worktree/lineage-types'
import { forkTranslate } from '../i18n/fork-translate'
import { discoverLinkedMembers, type DiscoveryIo } from './discover-members'
import {
  applyRequirementPlan,
  lineageParentIdFor,
  planRequirementImport,
  type ImportPlan
} from './import-plan'
import { posixResolve } from './posix-path'

export function ImportSummary(props: {
  plan: ImportPlan
  note: string | null
  onApply: () => void
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border p-2 text-xs">
      <div className="mb-1 flex gap-2">
        <span>
          {props.plan.ok
            ? props.plan.actions.map((action) => action.op).join(', ')
            : props.plan.error}
        </span>
        <button type="button" className="underline" onClick={props.onApply}>
          {forkTranslate('fork.requirement.apply', 'Apply')}
        </button>
      </div>
      {props.note ? <p className="text-muted-foreground">{props.note}</p> : null}
    </div>
  )
}

export async function dryRunRequirement(input: {
  parentPath: string
  parentId: string
  hostId: ExecutionHostId
  worktrees: readonly Worktree[]
  folders: readonly FolderWorkspace[]
  lineageById: Readonly<Record<string, WorktreeLineage>>
  workspaceLineage?: readonly WorkspaceLineage[]
}): Promise<{ plan: ImportPlan; note: string | null }> {
  const io: DiscoveryIo = {
    readDir: async (path) => {
      const rows = await window.api.fs.readDir({ dirPath: path })
      return rows.map((row) => ({ name: row.name, isDirectory: row.isDirectory }))
    },
    readFile: async (path) => {
      try {
        return (await window.api.fs.readFile({ filePath: path })).content
      } catch {
        return null
      }
    }
  }
  const discovered = await discoverLinkedMembers(input.parentPath, io)
  const sameHostWorktrees = input.worktrees.filter((worktree) => worktree.hostId === input.hostId)
  const projects: { id: string; hostId: ExecutionHostId; gitCommonDir: string }[] = []
  const seen = new Set<string>()
  for (const member of discovered.members) {
    if (!member.gitCommonDir || seen.has(member.gitCommonDir)) {
      continue
    }
    const match = sameHostWorktrees.find(
      (worktree) => posixResolve(worktree.path) === posixResolve(member.path)
    )
    if (!match) {
      continue
    }
    seen.add(member.gitCommonDir)
    projects.push({ id: match.repoId, hostId: input.hostId, gitCommonDir: member.gitCommonDir })
  }
  const plan = planRequirementImport({
    hostId: input.hostId,
    parentPath: input.parentPath,
    parentWorkspaceId: input.parentId,
    discovered: discovered.members,
    projects,
    workspaces: [
      ...input.folders.flatMap((folder) => {
        const hostId = folder.executionHostId ?? 'local'
        if (hostId !== input.hostId) {
          return []
        }
        return [
          {
            id: `folder:${folder.id}`,
            hostId,
            path: folder.folderPath,
            projectId: folder.projectGroupId,
            visible: !folder.isArchived,
            lineageParentId: null
          }
        ]
      }),
      ...sameHostWorktrees.map((worktree) => ({
        id: worktree.id,
        hostId: worktree.hostId ?? input.hostId,
        path: worktree.path,
        projectId: worktree.repoId,
        visible: !worktree.isArchived,
        lineageParentId: lineageParentIdFor(worktree.id, input.lineageById, input.workspaceLineage)
      }))
    ]
  })
  return { plan, note: discovered.skipped.map((entry) => entry.reason).join(', ') || null }
}

export async function linkRequirementParent(workspaceId: string, parentId: string): Promise<void> {
  const response = await window.api.runtime.call({
    method: 'worktree.set',
    params: { worktree: `id:${workspaceId}`, parentWorktree: parentId }
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}

export async function adoptRequirementWorkspace(
  workspaceId: string,
  parentId: string
): Promise<void> {
  const response = await window.api.runtime.call({
    method: 'worktree.set',
    params: { worktree: `id:${workspaceId}`, parentWorktree: parentId, isArchived: false }
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
}

export async function applyVisiblePlan(plan: ImportPlan, parentId: string): Promise<string | null> {
  const result = await applyRequirementPlan(plan, {
    linkLineage: (workspaceId, nextParent) => linkRequirementParent(workspaceId, nextParent),
    adopt: (workspaceId) => adoptRequirementWorkspace(workspaceId, parentId)
  })
  return result.skipped.map((entry) => `${entry.action.op}:${entry.reason}`).join(', ') || null
}
