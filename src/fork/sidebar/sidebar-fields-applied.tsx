// fork: an older remote host parses worktree.set in strip mode. It drops sidebarGroupId and
// clearFields but applies the rest, so a group move would land half-way without a word.
import { translate } from '../../renderer/src/i18n/i18n'
import {
  folderSidebarFieldsNotApplied,
  sidebarFieldsToClear
} from '../../shared/fork-hooks/sidebar-field-clear'

type SidebarFields = { sidebarGroupId?: string | null; manualOrder?: number }

export function sidebarFieldsNotAppliedMessage(): string {
  return translate(
    'fork.sidebar.hostTooOldForGroups',
    'Update Orca on this host to move workspaces between groups.'
  )
}

/**
 * Throws when the host's reply is missing a group or clear this write asked for. A write that asks
 * for neither is never checked, so every other worktree.set keeps upstream behaviour.
 */
export function assertSidebarFieldsApplied(
  updates: SidebarFields,
  reply: SidebarFields | null | undefined
): void {
  const asked = updates.sidebarGroupId !== undefined || sidebarFieldsToClear(updates).length > 0
  if (asked && (!reply || folderSidebarFieldsNotApplied(updates, reply))) {
    throw new Error(sidebarFieldsNotAppliedMessage())
  }
}
