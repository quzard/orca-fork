import { buildHostDirectoryRowPlan } from '../sidebar/host-directory-rows'
import type { SidebarPlanArgs, SidebarRowPlan } from '../../shared/fork-hooks/sidebar-group-mode'
import { regroupRequirementRows } from './regroup-rows'
import { requirementsForSidebar } from './sidebar-model'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'

type PlanShape = {
  worktrees?: readonly {
    id: string
    hostId?: string | null
    displayName?: string | null
    path: string
    isArchived?: boolean
    instanceId?: string | null
  }[]
  folderWorkspaces?: readonly {
    id: string
    name: string
    folderPath: string
    executionHostId?: string | null
    connectionId?: string | null
    isArchived?: boolean
  }[]
  lineageById?: Record<string, WorktreeLineage>
  defaultHostId?: ExecutionHostId
}

export function buildRequirementSidebarPlan(input: SidebarPlanArgs): SidebarRowPlan {
  const plan = buildHostDirectoryRowPlan(input)
  const source = input as PlanShape
  const requirements = requirementsForSidebar({
    worktrees: source.worktrees ?? [],
    folders: source.folderWorkspaces ?? [],
    lineageById: source.lineageById ?? {},
    defaultHostId: source.defaultHostId
  })
  return {
    occurrencePlan: plan.occurrencePlan,
    render: (collapsed) => regroupRequirementRows(plan.render(collapsed), requirements)
  }
}
