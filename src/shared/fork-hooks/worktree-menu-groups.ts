// fork: the "Move to group" / "Remove from group" entries of the workspace context menu.
// Unregistered, it returns upstream's own values: every group, the project's group, and the
// project-level handlers.
import type { ProjectGroup } from '../project-group-types'
import type { Repo } from '../repo-types'
import type { Worktree } from '../worktree/types'

export type WorktreeMenuGroups = {
  /** Groups the "Move to group" submenu lists. */
  groups: readonly ProjectGroup[]
  /** The group the menu treats as current: disabled in the submenu, and "Remove from group" shows. */
  currentGroupId: string | null
  onMove: (groupId: string) => void
  onRemove: () => void
}

export type WorktreeMenuGroupsArgs = {
  worktree: Worktree
  repo: Repo | null | undefined
  projectGroups: readonly ProjectGroup[]
  onMove: (groupId: string) => void
  onRemove: () => void
}

type MenuGroupsHook = (args: WorktreeMenuGroupsArgs) => WorktreeMenuGroups

let menuGroupsHook: MenuGroupsHook | undefined

export function registerWorktreeMenuGroups(next: MenuGroupsHook | undefined): void {
  menuGroupsHook = next
}

export function worktreeMenuGroups(args: WorktreeMenuGroupsArgs): WorktreeMenuGroups {
  if (menuGroupsHook) {
    return menuGroupsHook(args)
  }
  return {
    groups: args.projectGroups,
    currentGroupId: args.repo?.projectGroupId ?? null,
    onMove: args.onMove,
    onRemove: args.onRemove
  }
}
