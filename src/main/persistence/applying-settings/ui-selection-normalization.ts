import type { PersistedState } from '../../../shared/persisted-state-types'
import { getDefaultUIState } from '../../../shared/constants'
import {
  isRegisteredSidebarGroupMode,
  registeredReplacementForBuiltinGroupBy
} from '../../../shared/fork-hooks/sidebar-group-mode'
import { isPluginPanelTabKey } from '../../../shared/plugins/plugin-manifest'

export function normalizeGroupBy(groupBy: unknown): PersistedState['ui']['groupBy'] {
  if (groupBy === 'none' || groupBy === 'workspace-status' || groupBy === 'pr-status') {
    return groupBy
  }
  // fork: a saved Project value is the host-and-directory view once that mode is registered.
  if (groupBy === 'repo') {
    return registeredReplacementForBuiltinGroupBy('repo') ?? 'repo'
  }
  if (groupBy === 'flat') {
    return 'none'
  }
  if (typeof groupBy === 'string' && isRegisteredSidebarGroupMode(groupBy)) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only a fork-registered mode id reaches here; built-in ids returned above.
    return groupBy as PersistedState['ui']['groupBy']
  }
  return getDefaultUIState().groupBy
}

export function normalizeShowDotfilesByWorktree(value: unknown): Record<string, boolean> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, boolean> = {}
  for (const [worktreeId, showDotfiles] of Object.entries(value as Record<string, unknown>)) {
    if (
      !worktreeId ||
      worktreeId === '__proto__' ||
      worktreeId === 'constructor' ||
      worktreeId === 'prototype' ||
      typeof showDotfiles !== 'boolean'
    ) {
      continue
    }
    out[worktreeId] = showDotfiles
  }
  return out
}

export function normalizeSortBy(sortBy: unknown): PersistedState['ui']['sortBy'] {
  if (
    sortBy === 'smart' ||
    sortBy === 'recent' ||
    sortBy === 'repo' ||
    sortBy === 'name' ||
    sortBy === 'manual'
  ) {
    return sortBy
  }
  return getDefaultUIState().sortBy
}

export function normalizeProjectOrderBy(
  projectOrderBy: unknown
): PersistedState['ui']['projectOrderBy'] {
  if (projectOrderBy === 'manual' || projectOrderBy === 'recent') {
    return projectOrderBy
  }
  return getDefaultUIState().projectOrderBy
}

export function normalizeRightSidebarTab(tab: unknown): PersistedState['ui']['rightSidebarTab'] {
  if (
    tab === 'explorer' ||
    tab === 'search' ||
    tab === 'vault' ||
    tab === 'workspaces' ||
    tab === 'pr-checks' ||
    tab === 'source-control' ||
    tab === 'checks' ||
    tab === 'ports'
  ) {
    return tab
  }
  // Why: plugin tabs are open-ended `plugin:<publisher>.<id>/<panel>` keys; validate the
  // shape so a persisted plugin tab doesn't reset to Explorer on restart.
  if (typeof tab === 'string' && isPluginPanelTabKey(tab)) {
    return tab
  }
  return getDefaultUIState().rightSidebarTab
}

export function normalizeRightSidebarExplorerView(
  view: unknown,
  tab?: unknown
): PersistedState['ui']['rightSidebarExplorerView'] {
  if (view === 'files' || view === 'search') {
    return view
  }
  // Why: older builds persisted Search as a standalone activity tab with no explorer view; 'search'
  // is still a live tab, so this fallback must not outrank an explicit view.
  if (tab === 'search') {
    return 'search'
  }
  return getDefaultUIState().rightSidebarExplorerView
}
