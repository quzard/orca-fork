// fork: sidebar chrome slots. Unregistered renderers return null and drops fall through.
import type { ReactNode } from 'react'
import type { Repo } from '../repo-types'
import type { Worktree } from '../worktree/types'

type WorktreeMenuTarget = Pick<Worktree, 'id' | 'instanceId' | 'hostId' | 'repoId'>

let contextMenu: ((worktree: WorktreeMenuTarget) => ReactNode) | undefined
let headerExtra: (() => ReactNode) | undefined
let hostMenu: ((hostId: string) => ReactNode) | undefined
let visibilityExtra: ((args: { repo: Repo; hostId?: string }) => ReactNode) | undefined
let workspaceChoice: ((worktree: Worktree) => { label: string; value: string }) | undefined
let settingsHeader: (() => ReactNode) | undefined
let settingsRowPrefix: ((sectionId: string) => ReactNode) | undefined
let settingsBulkActive = false
let hiddenSearchMinimum = 10
let hiddenQueryExtra:
  | ((worktree: { displayName: string; path: string; branch?: string }, query: string) => boolean)
  | undefined
export type WorkspaceGroupDropArgs = {
  x: number
  y: number
  sourceGroupKey: string
  draggedIds: readonly string[]
  groups: readonly unknown[]
  container: unknown
}

let groupDrop: ((args: WorkspaceGroupDropArgs) => boolean) | undefined
let directoryPrefix: ((label: string, path: string) => ReactNode) | undefined

export function registerSidebarContextMenu(
  render: (worktree: WorktreeMenuTarget) => ReactNode
): void {
  contextMenu = render
}

export function renderSidebarContextMenu(worktree: WorktreeMenuTarget): ReactNode {
  return contextMenu?.(worktree) ?? null
}

export function registerSidebarHeaderExtra(render: () => ReactNode): void {
  headerExtra = render
}

export function renderSidebarHeaderExtra(): ReactNode {
  return headerExtra?.() ?? null
}

export function registerHostSectionMenuExtra(render: (hostId: string) => ReactNode): void {
  hostMenu = render
}

export function renderHostSectionMenuExtra(hostId: string): ReactNode {
  return hostMenu?.(hostId) ?? null
}

export function registerVisibilityArchivedSlot(
  render: (args: { repo: Repo; hostId?: string }) => ReactNode
): void {
  visibilityExtra = render
}

export function renderVisibilityArchivedSlot(args: { repo: Repo; hostId?: string }): ReactNode {
  return visibilityExtra?.(args) ?? null
}

export function registerWorkspaceChoiceFormatter(
  format: (worktree: Worktree) => { label: string; value: string }
): void {
  workspaceChoice = format
}

export function formatRegisteredWorkspaceChoice(
  worktree: Worktree
): { label: string; value: string } | undefined {
  return workspaceChoice?.(worktree)
}

export function registerSettingsProjectBulk(slots: {
  active: boolean
  header: () => ReactNode
  rowPrefix: (sectionId: string) => ReactNode
}): void {
  settingsBulkActive = slots.active
  settingsHeader = slots.header
  settingsRowPrefix = slots.rowPrefix
}

export function settingsProjectBulkActive(): boolean {
  return settingsBulkActive
}

export function renderSettingsProjectBulkHeader(): ReactNode {
  return settingsHeader?.() ?? null
}

export function renderSettingsProjectBulkRowPrefix(sectionId: string): ReactNode {
  return settingsRowPrefix?.(sectionId) ?? null
}

export function registerHiddenWorktreeSearch(args: {
  minimum: number
  matches?: (
    worktree: { displayName: string; path: string; branch?: string },
    query: string
  ) => boolean
}): void {
  hiddenSearchMinimum = args.minimum
  hiddenQueryExtra = args.matches
}

export function hiddenWorktreeSearchMinimum(): number {
  return hiddenSearchMinimum
}

/** A match beyond upstream's name and path test (the branch). Unregistered: never. */
export function hiddenWorktreeMatchesExtra(
  worktree: { displayName: string; path: string; branch?: string },
  query: string
): boolean {
  return hiddenQueryExtra?.(worktree, query) ?? false
}

export function registerWorkspaceGroupDrop(
  commit: (args: WorkspaceGroupDropArgs) => boolean
): void {
  groupDrop = commit
}

/** A drop on another section's group (host-directory). True when the fork took the drop. */
export function commitRegisteredWorkspaceGroupDrop(
  pointer: { clientX: number; clientY: number },
  drag: { sourceGroupKey: string; draggedIds: readonly string[] },
  ctx: { worktreeDragGroups: readonly unknown[]; scrollRef: { current: unknown } }
): boolean {
  if (!groupDrop) {
    return false
  }
  return groupDrop({
    x: pointer.clientX,
    y: pointer.clientY,
    sourceGroupKey: drag.sourceGroupKey,
    draggedIds: drag.draggedIds,
    groups: ctx.worktreeDragGroups,
    container: ctx.scrollRef.current
  })
}

export function registerWorktreeDirectoryPrefix(
  render: (label: string, path: string) => ReactNode
): void {
  directoryPrefix = render
}

/** The card's directory prefix before its title; only host-directory rows carry a label. */
export function renderWorktreeDirectoryPrefix(label: string | undefined, path: string): ReactNode {
  return label && directoryPrefix ? directoryPrefix(label, path) : null
}
