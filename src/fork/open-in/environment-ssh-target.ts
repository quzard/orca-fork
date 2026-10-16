/** SSH host a managed server's workspaces open through. A deleted target refuses the launch. */
export function resolveEnvironmentSshTargetId(args: {
  runtimeEnvironmentId?: string | null
  orcadDeploymentSshTargetId?: string | null
  ownerUnresolved?: boolean
  sshTargetLabels: ReadonlyMap<string, string>
  sshTargetsHydrated: boolean
}): string | null {
  if (args.ownerUnresolved) {
    return null
  }
  const environmentId = args.runtimeEnvironmentId?.trim()
  if (!environmentId) {
    return null
  }
  const targetId = args.orcadDeploymentSshTargetId?.trim()
  if (!targetId) {
    return null
  }
  if (args.sshTargetsHydrated && !args.sshTargetLabels.has(targetId)) {
    return null
  }
  return targetId
}
