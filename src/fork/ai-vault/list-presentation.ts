import { normalizeRuntimePathSeparators } from '../../shared/cross-platform-path'
import {
  getExecutionHostLabel,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../shared/execution-host'
import {
  registerAiVaultFolderLabel,
  registerAiVaultGroupPartition,
  registerAiVaultWrapGroupLabels
} from '../../shared/fork-hooks/ai-vault'

const UNKNOWN_LOCATION_LABEL = 'Unknown location'
const HOST_HEADER_PREFIX = 'host:'

type HostSession = { executionHostId: string }
type HostGroup<Session extends HostSession> = {
  key: string
  label: string | null
  sessions: Session[]
}

function fullDirectoryLabel(pathValue: string | null): string {
  if (!pathValue) {
    return UNKNOWN_LOCATION_LABEL
  }
  return normalizeRuntimePathSeparators(pathValue.normalize('NFC'))
}

function isHostHeaderKey(key: string): boolean {
  return key.startsWith(HOST_HEADER_PREFIX)
}

export function hostHeaderKey(hostId: string): string {
  return `${HOST_HEADER_PREFIX}${hostId}`
}

/** Directory groups are `${host}::${folder}`. Host ids themselves contain colons. */
function directoryHostId(key: string): string | null {
  if (isHostHeaderKey(key)) {
    return null
  }
  const split = key.indexOf('::')
  if (split <= 0) {
    return null
  }
  return key.slice(0, split)
}

function hostLabel(hostId: string): string {
  return isExecutionHostId(hostId) ? getExecutionHostLabel(hostId) : hostId
}

function isExecutionHostId(id: string): id is ExecutionHostId {
  return id === LOCAL_EXECUTION_HOST_ID || id.startsWith('ssh:') || id.startsWith('runtime:')
}

function hostOrder<Session extends HostSession>(groups: readonly HostGroup<Session>[]): string[] {
  const hosts: string[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const session of group.sessions) {
      if (seen.has(session.executionHostId)) {
        continue
      }
      seen.add(session.executionHostId)
      hosts.push(session.executionHostId)
    }
  }
  return hosts
}

/**
 * Search stays one unlabeled group so hit order is unchanged.
 * One host keeps directory titles only. Several hosts get a collapsible host row
 * plus that host's directory groups.
 */
export function partitionAiVaultGroupsByHost<Session extends HostSession>(
  groups: readonly HostGroup<Session>[]
): HostGroup<Session>[] {
  if (groups.every((group) => group.label === null)) {
    return groups.map((group) => ({ ...group, sessions: [...group.sessions] }))
  }
  const hosts = hostOrder(groups)
  if (hosts.length <= 1) {
    return groups.map((group) => ({ ...group, sessions: [...group.sessions] }))
  }
  const partitioned: HostGroup<Session>[] = []
  for (const host of hosts) {
    const hostSessions: Session[] = []
    const directories: HostGroup<Session>[] = []
    for (const group of groups) {
      const sessions = group.sessions.filter((session) => session.executionHostId === host)
      if (sessions.length === 0) {
        continue
      }
      hostSessions.push(...sessions)
      directories.push({
        key: `${host}::${group.key}`,
        label: group.label,
        sessions
      })
    }
    partitioned.push({
      key: hostHeaderKey(host),
      label: hostLabel(host),
      sessions: hostSessions
    })
    partitioned.push(...directories)
  }
  return partitioned
}

export function visibleAiVaultGroups<Session extends HostSession>(
  groups: readonly HostGroup<Session>[],
  collapsed: ReadonlySet<string>
): { groups: HostGroup<Session>[]; hostHeaderCounts: ReadonlyMap<string, number> } {
  const hostHeaderCounts = new Map<string, number>()
  const visible: HostGroup<Session>[] = []
  for (const group of groups) {
    if (isHostHeaderKey(group.key)) {
      hostHeaderCounts.set(group.key, group.sessions.length)
      visible.push({ ...group, sessions: [] })
      continue
    }
    const host = directoryHostId(group.key)
    if (host && collapsed.has(hostHeaderKey(host))) {
      continue
    }
    visible.push(group)
  }
  return { groups: visible, hostHeaderCounts }
}

export function searchHostLabels(
  groups: readonly HostGroup<HostSession>[]
): ((hostId: string) => string | undefined) | undefined {
  if (groups.length !== 1 || groups[0]?.label !== null) {
    return undefined
  }
  const hosts = hostOrder(groups)
  if (hosts.length < 2) {
    return undefined
  }
  return (hostId) => hostLabel(hostId)
}

export function registerAiVaultListPresentation(): void {
  registerAiVaultFolderLabel(fullDirectoryLabel)
  registerAiVaultWrapGroupLabels(true)
  registerAiVaultGroupPartition((groups) => partitionAiVaultGroupsByHost(groups))
}
