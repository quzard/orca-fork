// Hosts with no sessions, not the active or selected host, and not connected go under "Other configured hosts".
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '../../shared/execution-host'

type VaultHostMenuOption = { id: string; label: string }

// The folded hosts of a main-menu list, keyed by that list, so the menu needs no extra prop.
const otherHostsByMenu = new WeakMap<object, readonly VaultHostMenuOption[]>()

export function splitVaultHostMenu<T extends VaultHostMenuOption>(
  options: readonly T[],
  args: {
    historyHostIds: ReadonlySet<string>
    activeHostId: string | null
    connectedHostIds: ReadonlySet<string>
    selected: string
  }
): readonly T[] {
  const main: T[] = []
  const other: T[] = []
  for (const option of options) {
    const hostId = normalizeExecutionHostId(option.id)
    const keep =
      option.id === ALL_EXECUTION_HOSTS_SCOPE ||
      option.id === args.selected ||
      hostId === null ||
      hostId === LOCAL_EXECUTION_HOST_ID ||
      hostId === args.activeHostId ||
      args.historyHostIds.has(hostId) ||
      args.connectedHostIds.has(hostId)
    if (keep) {
      main.push(option)
    } else {
      other.push(option)
    }
  }
  if (other.length === 0) {
    return options
  }
  otherHostsByMenu.set(main, other)
  return main
}

export function otherVaultHosts(menu: object): readonly VaultHostMenuOption[] {
  return otherHostsByMenu.get(menu) ?? []
}
