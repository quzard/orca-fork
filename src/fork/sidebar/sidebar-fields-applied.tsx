// fork: an older remote host parses worktree.set in strip mode. It drops sidebarGroupId and
// clearFields but applies the rest, so a group move would land half-way without a word.
import { translate } from '../../renderer/src/i18n/i18n'
import { hasRuntimeRpcErrorCode } from '../../shared/runtime-rpc-error-code'
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

/** Stable machine code; the message is translated, so nothing may match on it. */
export const SIDEBAR_FIELDS_NOT_APPLIED_CODE = 'SIDEBAR_FIELDS_NOT_APPLIED'

export class SidebarFieldsNotAppliedError extends Error {
  readonly code = SIDEBAR_FIELDS_NOT_APPLIED_CODE

  constructor() {
    super(sidebarFieldsNotAppliedMessage())
    this.name = 'SidebarFieldsNotAppliedError'
  }
}

/**
 * Matches by code with upstream's transport-safe classifier, so it still matches after IPC or a
 * relay re-wraps the error, or after a store result kept only `{ error, code }`.
 */
export function isSidebarFieldsNotAppliedError(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, SIDEBAR_FIELDS_NOT_APPLIED_CODE)
}

/** The code to keep on a `{ ok: false, error }` result, which otherwise carries only the message. */
export function sidebarFieldsErrorCode(error: unknown): { code?: string } {
  return isSidebarFieldsNotAppliedError(error) ? { code: SIDEBAR_FIELDS_NOT_APPLIED_CODE } : {}
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
    throw new SidebarFieldsNotAppliedError()
  }
}
