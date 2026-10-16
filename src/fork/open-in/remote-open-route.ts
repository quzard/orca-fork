import { isVsCodeRemoteSshCommand } from '../../shared/vscode-remote-ssh-launcher'
import type {
  OpenInRouteAdjustment,
  OpenInRouteContext
} from '../../shared/fork-hooks/open-in-launcher'
import { isCursorLauncherCommand } from './cursor-remote-url'
import { resolveEnvironmentSshTargetId } from './environment-ssh-target'

export const REMOTE_SSH_OPEN_METADATA = 'Remote SSH'

export type RemoteOpenRouteState = {
  ownerUnresolved?: boolean
  orcadDeploymentSshTargetId?: string | null
  sshTargetLabels: ReadonlyMap<string, string>
  sshTargetsHydrated: boolean
}

export function adjustRemoteOpenRoute(
  context: OpenInRouteContext,
  state: RemoteOpenRouteState
): OpenInRouteAdjustment | null {
  if (context.target !== 'external-editor' || context.ownerUnresolved || state.ownerUnresolved) {
    return null
  }
  const command = context.command
  if (!isVsCodeRemoteSshCommand(command) && !isCursorLauncherCommand(command)) {
    return null
  }
  const directConnectionId = context.connectionId?.trim()
  if (directConnectionId) {
    return {
      disabled: false,
      metadata: REMOTE_SSH_OPEN_METADATA,
      connectionId: directConnectionId
    }
  }
  const targetId = resolveEnvironmentSshTargetId({
    runtimeEnvironmentId: context.runtimeEnvironmentId,
    orcadDeploymentSshTargetId: state.orcadDeploymentSshTargetId,
    ownerUnresolved: context.ownerUnresolved,
    sshTargetLabels: state.sshTargetLabels,
    sshTargetsHydrated: state.sshTargetsHydrated
  })
  if (!targetId) {
    return null
  }
  return { disabled: false, metadata: REMOTE_SSH_OPEN_METADATA, connectionId: targetId }
}
