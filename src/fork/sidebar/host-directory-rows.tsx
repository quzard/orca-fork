// Row plan for the host-directory sidebar. Built-in group modes never call this.
import type { SidebarPlanArgs } from '../../shared/fork-hooks/sidebar-group-mode'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import { getWorktreeHostIdentity } from '../../shared/worktree/host-qualified-identity'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'
import type { Worktree } from '../../shared/worktree/types'
import {
  buildWorktreeOccurrencePlan,
  type WorktreeOccurrencePlan,
  type WorktreeOccurrenceSection
} from '../../shared/worktree-occurrence-plan'
import type { WorkspaceSortBy } from '../../shared/workspace-view/workspace-row-sort'
import { getSidebarLineageChildren } from '../../shared/sidebar-list/pinned-section-worktrees'
import type { Row } from '../../shared/sidebar-list/row-types'
import { sectionKeyForWorkspace } from './membership'
import {
  PINNED_SECTION_KEY,
  resolveHostDirectorySortBy,
  setHostDirectoryDefaultHostId
} from './section-keys'
import { renderHostDirectoryRows } from './host-directory-render'
import { orderWorkspaces } from './workspace-order'

export type HostDirectoryPlanInput = {
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  projectGroups?: readonly ProjectGroup[]
  placeholderRepoIds?: ReadonlySet<string>
  pendingCreations?: readonly { creationId: string; repoId: string }[]
  folderWorkspaces?: readonly FolderWorkspace[]
  defaultHostId?: ExecutionHostId
  pinnedDisplayPolicy?: 'single-location' | 'duplicate-in-groups'
  filterRepoIds?: readonly string[]
  workspaceSortBy?: WorkspaceSortBy
  lineageById?: Record<string, WorktreeLineage>
  worktreeMap?: Map<string, Worktree>
  nestLineage?: boolean
}

function isPlanInput(input: SidebarPlanArgs): input is HostDirectoryPlanInput {
  return Array.isArray(input.worktrees) && input.repoMap instanceof Map
}

export function buildHostDirectoryRowPlan(input: SidebarPlanArgs): {
  occurrencePlan: WorktreeOccurrencePlan<Worktree>
  render: (collapsedGroups: Set<string>) => Row[]
} {
  if (!isPlanInput(input)) {
    throw new Error('Host-directory row plan received an unexpected argument.')
  }
  const defaultHostId = input.defaultHostId ?? 'local'
  setHostDirectoryDefaultHostId(defaultHostId)
  const projectGroups = input.projectGroups ?? []
  const repoMap = input.repoMap
  const sortBy = resolveHostDirectorySortBy(input.workspaceSortBy)
  const visible = input.worktrees.filter((worktree) => !worktree.isArchived)
  const children = input.nestLineage
    ? getSidebarLineageChildren(
        visible,
        input.lineageById ?? {},
        input.worktreeMap ?? new Map(visible.map((worktree) => [worktree.id, worktree])),
        input.filterRepoIds ?? []
      )
    : new Map<string, Worktree[]>()

  const occurrencePlan = buildWorktreeOccurrencePlan({
    rows: visible,
    identityOf: getWorktreeHostIdentity,
    childrenByParentIdentity: children,
    isPinned: (worktree) => worktree.isPinned === true,
    duplicatePinned: input.pinnedDisplayPolicy === 'duplicate-in-groups',
    projectIdOf: (worktree) => worktree.repoId,
    sectionsOf: ({ pinned, natural }) => {
      const sections: WorktreeOccurrenceSection<Worktree>[] = []
      if (pinned.length > 0) {
        sections.push({
          key: PINNED_SECTION_KEY,
          items: [...pinned],
          placement: 'pinned' as const,
          revealPath: { key: PINNED_SECTION_KEY }
        })
      }
      const byKey = new Map<string, Worktree[]>()
      for (const worktree of natural) {
        const key = sectionKeyForWorkspace({
          worktree,
          repo: repoMap.get(worktree.repoId),
          projectGroups,
          defaultHostId
        })
        const list = byKey.get(key) ?? []
        list.push(worktree)
        byKey.set(key, list)
      }
      for (const [key, items] of byKey) {
        sections.push({
          key,
          items,
          placement: 'natural' as const,
          revealPath: { key }
        })
      }
      return sections
    }
  })

  const render = (collapsedGroups: Set<string>): Row[] =>
    renderHostDirectoryRows({
      collapsedGroups,
      occurrencePlan,
      repoMap,
      projectGroups,
      defaultHostId,
      sortBy,
      placeholderRepoIds: input.placeholderRepoIds ?? new Set(),
      pendingCreations: input.pendingCreations ?? [],
      folderWorkspaces: input.folderWorkspaces ?? [],
      orderMembers: (members) => orderWorkspaces(members, sortBy, Date.now())
    })

  return { occurrencePlan, render }
}
