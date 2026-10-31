import { normalizeRuntimePathSeparators } from '../../shared/cross-platform-path'
import { getExecutionHostLabel, type ExecutionHostId } from '../../shared/execution-host'
import { registerAiVaultFolderLabel } from '../../shared/fork-hooks/ai-vault'

const UNKNOWN_LOCATION_LABEL = 'Unknown location'
const HOST_HEADER_PREFIX = 'host:'
// The panel's own collapsed set keeps the same number of keys.
const MAX_REMEMBERED_GROUPS = 512
const HOST_SESSION_COUNT = Symbol('aiVaultHostSessionCount')

type HostSession = { executionHostId: ExecutionHostId }
type HostGroup<Session extends HostSession> = {
  key: string
  label: string | null
  sessions: Session[]
}

/**
 * Group key → whether the panel's collapsed set holds the key while the group is expanded.
 * Collapsed on screen is (held in the panel's set) XOR (inverted).
 */
export type AiVaultGroupInversions = ReadonlyMap<string, boolean>

let hostRows = false

/** Host rows, full directory titles and collapse-new. Unregistered, the panel stays upstream. */
export function aiVaultHostRowsRegistered(): boolean {
  return hostRows
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

function hostOrder<Session extends HostSession>(
  groups: readonly HostGroup<Session>[]
): ExecutionHostId[] {
  const hosts = new Set<ExecutionHostId>()
  for (const group of groups) {
    for (const session of group.sessions) {
      hosts.add(session.executionHostId)
    }
  }
  return [...hosts]
}

/**
 * Search stays one unlabeled group so hit order is unchanged. One host keeps directory titles only.
 * Several hosts get a collapsible host row followed by that host's directory groups. Directory keys
 * always carry the host, so a directory keeps its state when a second host appears or one is picked.
 */
export function partitionAiVaultGroupsByHost<Session extends HostSession>(
  groups: readonly HostGroup<Session>[],
  hostLabel: (hostId: ExecutionHostId) => string = getExecutionHostLabel
): readonly HostGroup<Session>[] {
  if (groups.every((group) => group.label === null)) {
    return groups
  }
  const hosts = hostOrder(groups)
  const partitioned: HostGroup<Session>[] = []
  for (const host of hosts) {
    const directories: HostGroup<Session>[] = []
    for (const group of groups) {
      const sessions = group.sessions.filter((session) => session.executionHostId === host)
      if (sessions.length > 0) {
        directories.push({ key: `${host}::${group.key}`, label: group.label, sessions })
      }
    }
    if (hosts.length === 1) {
      return directories
    }
    partitioned.push({
      key: hostHeaderKey(host),
      label: hostLabel(host),
      sessions: directories.flatMap((directory) => directory.sessions)
    })
    partitioned.push(...directories)
  }
  return partitioned
}

/** Host rows list no sessions of their own and carry the count; a collapsed host hides its directories. */
export function visibleAiVaultGroups<Session extends HostSession>(
  groups: readonly HostGroup<Session>[],
  collapsed: ReadonlySet<string>
): HostGroup<Session>[] {
  const visible: HostGroup<Session>[] = []
  let hostCollapsed = false
  for (const group of groups) {
    if (isHostHeaderKey(group.key)) {
      hostCollapsed = collapsed.has(group.key)
      const header = { ...group, sessions: [], [HOST_SESSION_COUNT]: group.sessions.length }
      visible.push(header)
    } else if (!hostCollapsed) {
      visible.push(group)
    }
  }
  return visible
}

/** The count a host row shows; undefined for every other group. */
export function readAiVaultHostSessionCount(group: object): number | undefined {
  const count: unknown = Reflect.get(group, HOST_SESSION_COUNT)
  return typeof count === 'number' ? count : undefined
}

function labeledKeys<Session extends HostSession>(groups: readonly HostGroup<Session>[]): string[] {
  return groups.filter((group) => group.label !== null).map((group) => group.key)
}

/** With collapseUnseen, a group not yet recorded shows collapsed; otherwise it follows the panel. */
export function presentAiVaultCollapsedGroups<Session extends HostSession>(
  groups: readonly HostGroup<Session>[],
  held: ReadonlySet<string>,
  inversions: AiVaultGroupInversions,
  collapseUnseen: boolean
): ReadonlySet<string> {
  const collapsed = new Set<string>()
  for (const key of labeledKeys(groups)) {
    const inverted = inversions.get(key) ?? (collapseUnseen && !held.has(key))
    if (inverted !== held.has(key)) {
      collapsed.add(key)
    }
  }
  return collapsed
}

// Listed keys always stay: a dropped one would show as unseen and collapse again on every render.
function capInversions(
  inversions: Map<string, boolean>,
  listed: readonly string[]
): AiVaultGroupInversions {
  if (inversions.size <= MAX_REMEMBERED_GROUPS) {
    return inversions
  }
  const keep = new Set(listed)
  const older = [...inversions.keys()].filter((key) => !keep.has(key))
  const room = Math.max(0, MAX_REMEMBERED_GROUPS - keep.size)
  for (const key of older.slice(older.length - room)) {
    keep.add(key)
  }
  return new Map([...inversions].filter(([key]) => keep.has(key)))
}

/** Records unseen groups as collapsed. Returns the same map when every group was seen. */
export function rememberAiVaultGroups<Session extends HostSession>(
  inversions: AiVaultGroupInversions,
  groups: readonly HostGroup<Session>[],
  held: ReadonlySet<string>
): AiVaultGroupInversions {
  const listed = labeledKeys(groups)
  const unseen = listed.filter((key) => !inversions.has(key))
  if (unseen.length === 0) {
    return inversions
  }
  const next = new Map(inversions)
  for (const key of unseen) {
    next.set(key, !held.has(key))
  }
  return capInversions(next, listed)
}

/** Collapses every host row and directory, including directories under a collapsed host. */
export function collapseAllAiVaultGroups<Session extends HostSession>(
  inversions: AiVaultGroupInversions,
  groups: readonly HostGroup<Session>[],
  held: ReadonlySet<string>
): AiVaultGroupInversions {
  const listed = labeledKeys(groups)
  if (listed.length === 0) {
    return inversions
  }
  const next = new Map(inversions)
  for (const key of listed) {
    next.delete(key)
    next.set(key, !held.has(key))
  }
  return capInversions(next, listed)
}

export function registerAiVaultListPresentation(): void {
  hostRows = true
  registerAiVaultFolderLabel(fullDirectoryLabel)
}
