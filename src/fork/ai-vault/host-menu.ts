// Hosts with no sessions, not the active host, and not connected go under "Other configured hosts".
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '../../shared/execution-host'

type VaultHostMenuOption = { id: string }

export function markSecondaryVaultHosts<T extends VaultHostMenuOption>(
  options: readonly T[],
  args: {
    historyHostIds: ReadonlySet<string>
    activeHostId: string | null
    connectedHostIds: ReadonlySet<string>
  }
): readonly (T & { secondary?: true })[] {
  return options.map((option) => {
    const hostId = normalizeExecutionHostId(option.id)
    const primary =
      option.id === ALL_EXECUTION_HOSTS_SCOPE ||
      hostId === null ||
      hostId === LOCAL_EXECUTION_HOST_ID ||
      hostId === args.activeHostId ||
      args.historyHostIds.has(hostId) ||
      args.connectedHostIds.has(hostId)
    return primary ? option : { ...option, secondary: true }
  })
}

export function isSecondaryVaultHost(option: object): boolean {
  return 'secondary' in option && option.secondary === true
}
