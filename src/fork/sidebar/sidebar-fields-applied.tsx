// fork: an older remote host parses worktree.set in strip mode. It drops sidebarGroupId and
// clearFields but applies the rest, so a group move would land half-way without a word.
import { forkTranslate } from '../i18n/fork-translate'
import { hasRuntimeRpcErrorCode } from '../../shared/runtime-rpc-error-code'
import {
  folderSidebarFieldsNotApplied,
  sidebarFieldsToClear
} from '../../shared/fork-hooks/sidebar-field-clear'

type SidebarFields = { sidebarGroupId?: string | null; manualOrder?: number }

export function sidebarFieldsNotAppliedMessage(): string {
  return forkTranslate(
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
 * Matches by code, never by the translated message. The error is thrown and checked in the
 * renderer: `assertSidebarFieldsApplied` runs on the host's worktree.set reply, so it never crosses
 * IPC or the runtime RPC. The code is kept when the store turns the throw into a
 * `{ ok: false, error, code }` result, and when a caller wraps the error as a `cause`; upstream's
 * `hasRuntimeRpcErrorCode` reads both.
 */
export function isSidebarFieldsNotAppliedError(error: unknown): boolean {
  return hasRuntimeRpcErrorCode(error, SIDEBAR_FIELDS_NOT_APPLIED_CODE)
}

/** The code to keep on a `{ ok: false, error }` result, which otherwise carries only the message. */
export function sidebarFieldsErrorCode(error: unknown): { code?: string } {
  return isSidebarFieldsNotAppliedError(error) ? { code: SIDEBAR_FIELDS_NOT_APPLIED_CODE } : {}
}

/**
 * Upstream's `updateWorktreeMeta` failure result (`{ ok: false, error: message }`), plus the code
 * when the error is this one. Lives here so the upstream store file stays within its line limit.
 */
export function sidebarFieldsWriteFailure(error: unknown): {
  ok: false
  error: string
  code?: string
} {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    ...sidebarFieldsErrorCode(error)
  }
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
