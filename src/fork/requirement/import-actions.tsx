import type { ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { Worktree } from '../../shared/worktree/types'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'
import { forkTranslate } from '../i18n/fork-translate'
import { discoverLinkedMembers, readGitCommonDir, type DiscoveryIo } from './discover-members'
import { applyRequirementPlan, planRequirementImport, type ImportPlan } from './import-plan'

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
  const projects: { id: string; hostId: ExecutionHostId; gitCommonDir: string }[] = []
  const seen = new Set<string>()
  for (const worktree of input.worktrees) {
    const common = await readGitCommonDir(worktree.path, io)
    if (!common || seen.has(common)) {
      continue
    }
    seen.add(common)
    projects.push({ id: worktree.repoId, hostId: input.hostId, gitCommonDir: common })
  }
  const plan = planRequirementImport({
    hostId: input.hostId,
    parentPath: input.parentPath,
    parentWorkspaceId: input.parentId,
    discovered: discovered.members,
    projects,
    workspaces: [
      ...input.folders.map((folder) => ({
        id: `folder:${folder.id}`,
        hostId: input.hostId,
        path: folder.folderPath,
        projectId: folder.projectGroupId,
        visible: !folder.isArchived,
        lineageParentId: null
      })),
      ...input.worktrees.map((worktree) => ({
        id: worktree.id,
        hostId: input.hostId,
        path: worktree.path,
        projectId: worktree.repoId,
        visible: !worktree.isArchived,
        lineageParentId: input.lineageById[worktree.id]?.parentWorktreeId ?? null
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

export async function applyVisiblePlan(plan: ImportPlan, parentId: string): Promise<string | null> {
  const result = await applyRequirementPlan(plan, {
    linkLineage: (workspaceId, nextParent) => linkRequirementParent(workspaceId, nextParent),
    adopt: (workspaceId) => linkRequirementParent(workspaceId, parentId)
  })
  return result.skipped.map((entry) => `${entry.action.op}:${entry.reason}`).join(', ') || null
}
