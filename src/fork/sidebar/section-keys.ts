// Host -> directory sidebar keys. Host ids contain colons, so the payload is JSON.
import type { ExecutionHostId } from '../../shared/execution-host'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { WorkspaceSortBy } from '../../shared/workspace-view/workspace-row-sort'

export const HOST_DIRECTORY_GROUP_BY = 'host-directory'
export const HOST_DIRECTORY_SECTION_PREFIX = 'hd:'
export const PINNED_SECTION_KEY = 'pinned'
export const UNGROUP_ONLY_OPTION_ID = 'ungroup-only'
export const WORKSPACE_GROUP_HOST_MISMATCH = 'Workspaces can only move within the same host.'
export const WORKSPACE_GROUP_NOT_ON_HOST = 'This group is not saved on that host.'
/** Group slot of an empty project header. Never written as a sidebarGroupId. */
export const EMPTY_PROJECT_GROUP_PREFIX = 'empty:'
export const DIRECTORY_TITLE_SEPARATOR = ' · '
export const WORKSPACE_SIDEBAR_GROUP_ATTRIBUTE = 'data-workspace-sidebar-group'

export function hostDirectorySectionKey(hostId: string, groupId: string | null): string {
  return `${HOST_DIRECTORY_SECTION_PREFIX}${JSON.stringify([hostId, groupId])}`
}

export function looseHostSectionKey(hostId: string): string {
  return hostDirectorySectionKey(hostId, null)
}

export function emptyProjectSectionKey(hostId: string, repoId: string): string {
  return hostDirectorySectionKey(hostId, `${EMPTY_PROJECT_GROUP_PREFIX}${repoId}`)
}

export function parseHostDirectorySectionKey(
  key: string
): { hostId: string; groupId: string | null } | null {
  if (!key.startsWith(HOST_DIRECTORY_SECTION_PREFIX)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(key.slice(HOST_DIRECTORY_SECTION_PREFIX.length))
    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return null
    }
    const [host, groupId] = parsed
    if (typeof host !== 'string' || host.length === 0) {
      return null
    }
    if (groupId !== null && typeof groupId !== 'string') {
      return null
    }
    return { hostId: host, groupId }
  } catch {
    return null
  }
}

let defaultHostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID

export function setHostDirectoryDefaultHostId(hostId: ExecutionHostId): void {
  defaultHostId = hostId
}

export function hostDirectoryDefaultHostId(): ExecutionHostId {
  return defaultHostId
}

let readSortBy: () => WorkspaceSortBy | undefined = () => undefined

export function registerHostDirectorySortReader(read: () => WorkspaceSortBy | undefined): void {
  readSortBy = read
}

export function resolveHostDirectorySortBy(
  explicit: WorkspaceSortBy | undefined
): WorkspaceSortBy | undefined {
  return explicit ?? readSortBy()
}
