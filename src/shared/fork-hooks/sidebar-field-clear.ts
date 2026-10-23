// fork: wire form for clearing a workspace's own sidebar group or manual order.
// Why: `null` already means "ungrouped" and JSON drops `undefined`, so a clear travels as a
// sibling `clearFields` list and the host turns it back into an absent field.

export const CLEARABLE_SIDEBAR_FIELDS = ['sidebarGroupId', 'manualOrder'] as const
export type ClearableSidebarField = (typeof CLEARABLE_SIDEBAR_FIELDS)[number]

/** Fields present on `updates` with the value `undefined`: the caller asked to clear them. */
export function sidebarFieldsToClear(updates: object): ClearableSidebarField[] {
  return CLEARABLE_SIDEBAR_FIELDS.filter(
    (field) =>
      Object.hasOwn(updates, field) && (updates as Record<string, unknown>)[field] === undefined
  )
}

/** 文件夹工作区更新的线协议：id 与清除字段放在同一条请求里。 */
export function folderWorkspaceUpdateRequest<T extends object>(
  folderWorkspaceId: string,
  updates: T
): { folderWorkspaceId: string; updates: T; clearFields?: ClearableSidebarField[] } {
  return { folderWorkspaceId, ...encodeSidebarFieldClears(updates) }
}

/** Splits requested clears out of `updates` for the wire. */
export function encodeSidebarFieldClears<T extends object>(
  updates: T
): { updates: T; clearFields?: ClearableSidebarField[] } {
  const clearFields = sidebarFieldsToClear(updates)
  if (clearFields.length === 0) {
    return { updates }
  }
  const rest = { ...updates }
  for (const field of clearFields) {
    delete (rest as Record<string, unknown>)[field]
  }
  return { updates: rest, clearFields }
}

/** Host side: the cleared fields become own `undefined` keys, which a spread merge removes. */
export function decodeSidebarFieldClears<T extends object>(
  updates: T,
  clearFields: readonly ClearableSidebarField[] | undefined
): T {
  if (!clearFields || clearFields.length === 0) {
    return updates
  }
  const next = { ...updates }
  for (const field of clearFields) {
    ;(next as Record<string, unknown>)[field] = undefined
  }
  return next
}

/** For untyped IPC input: keeps only known field names. */
export function parseClearableSidebarFields(value: unknown): ClearableSidebarField[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return CLEARABLE_SIDEBAR_FIELDS.filter((field) => value.includes(field))
}

/**
 * True when a host answered without the requested group or clear, e.g. an older host whose schema
 * strips them. Folder writes reconcile; worktree writes fail (fork/sidebar/sidebar-fields-applied).
 */
export function folderSidebarFieldsNotApplied(
  updates: { sidebarGroupId?: string | null; manualOrder?: number },
  updated: { sidebarGroupId?: string | null; manualOrder?: number }
): boolean {
  if (updates.sidebarGroupId !== undefined && updated.sidebarGroupId !== updates.sidebarGroupId) {
    return true
  }
  return sidebarFieldsToClear(updates).some((field) => updated[field] !== undefined)
}

/**
 * 把解码后的侧栏字段写进文件夹工作区。
 * 字段自己的 `undefined` 表示清除，不能和「这次没改」混在一起。
 */
export function applyFolderSidebarFieldUpdate(
  workspace: { sidebarGroupId?: string | null; manualOrder?: number },
  updates: { sidebarGroupId?: string | null; manualOrder?: number }
): void {
  if (updates.sidebarGroupId !== undefined) {
    workspace.sidebarGroupId = updates.sidebarGroupId
  } else if (Object.hasOwn(updates, 'sidebarGroupId')) {
    delete workspace.sidebarGroupId
  }
  if (updates.manualOrder === undefined && Object.hasOwn(updates, 'manualOrder')) {
    delete workspace.manualOrder
  }
}
