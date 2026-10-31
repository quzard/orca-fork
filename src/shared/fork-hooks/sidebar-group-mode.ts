// fork: 侧栏分组模式注册表。内置四种模式不进入表，未注册时查找永远为空。
import type { ExecutionHostId } from '../execution-host'
import type { PersistedUIState } from '../persisted-ui-state-types'
import type { planSidebarRows } from '../sidebar-list/sidebar-row-plan'

const BUILTIN_GROUP_BY_IDS = new Set(['none', 'workspace-status', 'repo', 'pr-status'])

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

// 与上游 planSidebarRows 的返回值同一类型，分区带 group（含 repoIds）。
// 以前只声明了 bySection / preferredByIdentity，缺 group 时类型检查发现不了。
export type SidebarRowPlan = ReturnType<typeof planSidebarRows>

export type SidebarGroupMode = {
  id: string
  label: string
  description?: string
  /** Default group for a profile that has not saved one. At most one mode should set this. */
  isDefault?: boolean
  /** Keep a host header even when only one host is visible. */
  retainHostHeaders?: boolean
  /** A saved built-in id that should open this mode. `repo` is the host-and-directory view. */
  replacesBuiltinGroupBy?: 'repo'
  /** Full row plan. Omitted modes still use the upstream plan. */
  buildRowPlan?: (args: SidebarPlanArgs) => SidebarRowPlan
}

const modes = new Map<string, SidebarGroupMode>()
const labelListeners = new Set<() => void>()
let labelVersion = 0

export function registerSidebarGroupMode(mode: SidebarGroupMode): void {
  if (BUILTIN_GROUP_BY_IDS.has(mode.id)) {
    return
  }
  modes.set(mode.id, mode)
  notifySidebarGroupModeLabelsChanged()
}

/**
 * For `useSyncExternalStore` in the group-by menu: a registered label may be a getter that
 * follows the UI language, so the fork calls `notifySidebarGroupModeLabelsChanged` when it
 * changes. Unregistered, the version never moves and the menu renders as upstream.
 */
export function subscribeSidebarGroupModeLabels(listener: () => void): () => void {
  labelListeners.add(listener)
  return () => {
    labelListeners.delete(listener)
  }
}

export function getSidebarGroupModeLabelsVersion(): number {
  return labelVersion
}

export function notifySidebarGroupModeLabelsChanged(): void {
  labelVersion += 1
  for (const listener of labelListeners) {
    listener()
  }
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

/** Upstream's `groupBy === 'repo'` test for project-header chrome, extended to registered modes. */
export function hasProjectHeaderChrome(groupBy: string): boolean {
  return groupBy === 'repo' || isRegisteredSidebarGroupMode(groupBy)
}

export function sidebarModeRetainsHostHeaders(groupBy: string): boolean {
  return lookupSidebarGroupMode(groupBy)?.retainHostHeaders === true
}

// 目录标题可以自带 hostId。只有登记了 retainHostHeaders 的模式（host-directory）才用它，
// 没登记或行上没有 hostId 时返回 null，标题仍按仓库主机归组。
export function forkHeaderHostId(row: { hostId?: ExecutionHostId }): ExecutionHostId | null {
  if (!row.hostId) {
    return null
  }
  for (const mode of modes.values()) {
    if (mode.retainHostHeaders) {
      return row.hostId
    }
  }
  return null
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

/**
 * Persisted groupBy, before upstream's built-in checks: a saved Project value opens the registered
 * mode that replaces it, and a registered id is kept. Undefined otherwise, and while unregistered.
 */
export function normalizeRegisteredGroupBy(
  groupBy: unknown
): PersistedUIState['groupBy'] | undefined {
  if (typeof groupBy !== 'string') {
    return undefined
  }
  return (
    registeredReplacementForBuiltinGroupBy(groupBy) ??
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only a registered mode id passes the check; the closed union cannot list it.
    (isRegisteredSidebarGroupMode(groupBy) ? (groupBy as PersistedUIState['groupBy']) : undefined)
  )
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
