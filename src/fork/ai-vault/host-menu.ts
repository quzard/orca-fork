// Hosts with no sessions, not the active host, and not a connected SSH target.
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'

export type VaultHostMenuOption = {
  id: string
  label: string
  secondary?: boolean
}

export function markSecondaryVaultHosts<T extends VaultHostMenuOption>(
  options: readonly T[],
  args: {
    historyHostIds: ReadonlySet<string>
    activeHostId: ExecutionHostId | null
    connectedSshTargetIds: ReadonlySet<string>
  }
): (T & { secondary?: boolean })[] {
  return options.map((option) => {
    const host = parseExecutionHostId(option.id)
    const secondary =
      option.id !== ALL_EXECUTION_HOSTS_SCOPE &&
      option.id !== LOCAL_EXECUTION_HOST_ID &&
      option.id !== args.activeHostId &&
      !args.historyHostIds.has(host?.id ?? LOCAL_EXECUTION_HOST_ID) &&
      !(host?.kind === 'ssh' && args.connectedSshTargetIds.has(host.targetId))
    return secondary ? { ...option, secondary: true } : { ...option, secondary: undefined }
  })
}
