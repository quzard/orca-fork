import { isRemoteSshEditorCommand } from '../../shared/remote-ssh-editor-launcher'
import type {
  OpenInRouteAdjustment,
  OpenInRouteContext
} from '../../shared/fork-hooks/open-in-launcher'
import { resolveEnvironmentSshTargetId } from './environment-ssh-target'

const REMOTE_SSH_OPEN_METADATA = 'Remote SSH'

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
  // 上游把分类挪到 remote-ssh-editor-launcher。Cursor 和 Zed 也算远端编辑器。
  const command = context.command
  if (!isRemoteSshEditorCommand(command)) {
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
