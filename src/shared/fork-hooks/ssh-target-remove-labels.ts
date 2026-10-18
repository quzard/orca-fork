// fork: the confirm and busy labels of the "Remove SSH Target" dialog. Upstream hardcodes them in
// English; unregistered, they come back unchanged.

export type SshTargetRemoveLabels = { actionLabel: string; busyLabel: string }

let labelsHook: (() => SshTargetRemoveLabels) | undefined

export function registerSshTargetRemoveLabels(
  next: (() => SshTargetRemoveLabels) | undefined
): void {
  labelsHook = next
}

/** `upstream` is upstream's own English, returned unchanged when the fork registered nothing. */
export function sshTargetRemoveLabels(upstream: SshTargetRemoveLabels): SshTargetRemoveLabels {
  return labelsHook ? labelsHook() : upstream
}
