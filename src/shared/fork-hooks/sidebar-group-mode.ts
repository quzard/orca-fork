// fork: 侧栏分组模式注册表。内置四种模式不进入表，未注册时查找永远为空。
import type { PersistedUIState } from '../persisted-ui-state-types'
import type { ProjectGroup } from '../project-group-types'
import type { Repo } from '../repo-types'
import type { Worktree } from '../worktree/types'

const BUILTIN_GROUP_BY_IDS = new Set(['none', 'workspace-status', 'repo', 'pr-status'])

export type SidebarGroupKeyContext = {
  projectGroups?: readonly ProjectGroup[]
}

/** Arguments a registered mode receives. Callers pass the sidebar's existing plan inputs. */
export type SidebarPlanArgs = {
  worktrees?: unknown
  repoMap?: unknown
  prCache?: unknown
  workspaceStatuses?: unknown
  projectOrderBy?: unknown
  settings?: unknown
  projectGroups?: unknown
  placeholderRepoIds?: unknown
  pendingCreations?: unknown
  folderWorkspaces?: unknown
  hostLabelById?: unknown
  defaultHostId?: unknown
  pinnedDisplayPolicy?: unknown
  filterRepoIds?: unknown
  workspaceSortBy?: unknown
  lineageById?: unknown
  worktreeMap?: unknown
  nestLineage?: unknown
  projectGrouping?: unknown
}

export type SidebarRowPlan = {
  occurrencePlan: { bySection?: unknown; preferredByIdentity?: unknown }
  render: (collapsedGroups: Set<string>) => unknown[]
}

export type SidebarGroupMode = {
  id: string
  label: string
  description?: string
  /** 分组标题的 tone class。缺省用中性色。 */
  headerTone?: string
  /** Default group for a profile that has not saved one. At most one mode should set this. */
  isDefault?: boolean
  /** Keep a host header even when only one host is visible. */
  retainHostHeaders?: boolean
  /** A saved built-in id that should open this mode. `repo` is the host-and-directory view. */
  replacesBuiltinGroupBy?: 'repo'
  /** 返回上游 `OrderedGroupEntry[]`。参数即 `buildOrderedGroups` 的 args。 */
  buildOrderedGroups?: (args: SidebarPlanArgs) => unknown
  /** Full row plan. Omitted modes still use the upstream plan. */
  buildRowPlan?: (args: SidebarPlanArgs) => SidebarRowPlan
  groupKeyForWorktree?: (
    worktree: Worktree,
    repo: Repo | undefined,
    context?: SidebarGroupKeyContext
  ) => string
}

const modes = new Map<string, SidebarGroupMode>()

export function registerSidebarGroupMode(mode: SidebarGroupMode): void {
  if (BUILTIN_GROUP_BY_IDS.has(mode.id)) {
    return
  }
  modes.set(mode.id, mode)
}

export function lookupSidebarGroupMode(id: string): SidebarGroupMode | undefined {
  if (BUILTIN_GROUP_BY_IDS.has(id)) {
    return undefined
  }
  return modes.get(id)
}

export function isRegisteredSidebarGroupMode(id: string): boolean {
  return lookupSidebarGroupMode(id) !== undefined
}

export function listSidebarGroupModes(): readonly SidebarGroupMode[] {
  return [...modes.values()]
}

export function getDefaultRegisteredSidebarGroupBy(): PersistedUIState['groupBy'] {
  for (const mode of modes.values()) {
    if (!mode.isDefault) {
      continue
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registered ids are persisted by normalizeGroupBy; the closed union cannot list them.
    return mode.id as PersistedUIState['groupBy']
  }
  return 'repo'
}

export function sidebarModeRetainsHostHeaders(groupBy: string): boolean {
  return lookupSidebarGroupMode(groupBy)?.retainHostHeaders === true
}

export function registeredReplacementForBuiltinGroupBy(
  groupBy: string
): PersistedUIState['groupBy'] | undefined {
  for (const mode of modes.values()) {
    if (mode.replacesBuiltinGroupBy !== groupBy) {
      continue
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: registered ids are persisted by normalizeGroupBy; the closed union cannot list them.
    return mode.id as PersistedUIState['groupBy']
  }
  return undefined
}

export function hydrateSidebarGroupBy(groupBy: string): PersistedUIState['groupBy'] {
  const stored = groupBy === 'parent' ? 'repo' : groupBy
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: built-in ids match the union; a registered replacement is cast at the call above.
  return registeredReplacementForBuiltinGroupBy(stored) ?? (stored as PersistedUIState['groupBy'])
}

export function takeRegisteredSidebarRowPlan(
  inputs: { groupBy: string } & SidebarPlanArgs
): SidebarRowPlan | undefined {
  // 调用方把整份行计划传进来。内置 id 查不到模式，这里返回 undefined。
  return delegateRegisteredSidebarRowPlan(inputs.groupBy, inputs)
}

function delegateRegisteredSidebarRowPlan(
  groupBy: string,
  input: SidebarPlanArgs
): SidebarRowPlan | undefined {
  const built = lookupSidebarGroupMode(groupBy)?.buildRowPlan?.(input)
  if (!built || typeof built.render !== 'function') {
    return undefined
  }
  return built
}
