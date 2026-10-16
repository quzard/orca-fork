// fork: optional workspace group id. Unregistered, an omitted field is left as the peer sent it.
import type { ExecutionHostId } from '../execution-host'

export type SidebarGroupRow = {
  id: string
  sidebarGroupId?: string | null
  hostId?: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}

type SidebarGroupPreserve = <T extends SidebarGroupRow>(
  incoming: readonly T[],
  current: readonly SidebarGroupRow[] | undefined,
  matches: (row: SidebarGroupRow) => boolean
) => T[]

let preserve: SidebarGroupPreserve | undefined

export function registerSidebarGroupIdPreserve(fn: SidebarGroupPreserve): void {
  preserve = fn
}

export function preserveRegisteredSidebarGroupIds<T extends SidebarGroupRow>(
  incoming: readonly T[],
  current: readonly SidebarGroupRow[] | undefined,
  matches: (row: SidebarGroupRow) => boolean
): T[] {
  if (!preserve) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: callers pass a mutable catalog array; skipping preserve must not copy it.
    return incoming as T[]
  }
  return preserve(incoming, current, matches)
}
