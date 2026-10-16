import React, { useCallback, useState } from 'react'
import type { WorkspacePort } from '../../shared/workspace-ports'
import {
  SshPortForwardDialog,
  type PortForwardDialogState
} from '@/components/right-sidebar/ssh-port-forward-dialog'
import { workspacePortForwardEnabled } from './workspace-port-forward-flag'

/** Per-port Forward for a managed-server workspace. Hidden until the renderer registers it. */
export function useWorkspacePortForward(args: {
  sshForwardTargetId: string | null
  activeWorktreeId?: string
}): {
  onForward: ((port: WorkspacePort) => void) | undefined
  dialog: React.ReactNode
} {
  const { sshForwardTargetId } = args
  const [dialogState, setDialogState] = useState<PortForwardDialogState>({ mode: 'closed' })
  const openAddDialog = useCallback(
    (port: WorkspacePort) => {
      if (!sshForwardTargetId) {
        return
      }
      setDialogState({
        mode: 'add',
        defaults: {
          remotePort: port.port,
          remoteHost: 'localhost',
          label: port.processName,
          targetId: sshForwardTargetId
        }
      })
    },
    [sshForwardTargetId]
  )
  if (!workspacePortForwardEnabled() || !sshForwardTargetId) {
    return { onForward: undefined, dialog: null }
  }
  return {
    onForward: openAddDialog,
    dialog: (
      <SshPortForwardDialog
        state={dialogState}
        activeConnectionId={sshForwardTargetId}
        onClose={() => setDialogState({ mode: 'closed' })}
      />
    )
  }
}
