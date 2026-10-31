// fork: a workspace created on a soft-deleted path starts unarchived. Metadata for the same
// repo+path merges, so the old isArchived would keep the new row under "Removed from Orca".
// Discovery scans that backfill instanceId do not use this. Unregistered, nothing is added.

let unarchive = false

export function registerReusedPathUnarchive(): void {
  unarchive = true
}

/** Spread next to the fresh instanceId a create writes. */
export function reusedPathUnarchiveMeta(): { isArchived?: false } {
  return unarchive ? { isArchived: false } : {}
}
