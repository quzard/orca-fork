// fork (F021/F043): Forward on each detected port of a managed-server workspace. The ports panel's
// dialog slot publishes an opener while it has an SSH forward target; the row slots render from it,
// so the rows and sections take no new props. Unregistered, every slot renders nothing.
import React, { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { Cable } from 'lucide-react'
import type { WorkspacePort } from '../../shared/workspace-ports'
import { Button } from '@/components/ui/button'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SshPortForwardDialog,
  type PortForwardDialogState
} from '@/components/right-sidebar/ssh-port-forward-dialog'
import { forkTranslate } from '../i18n/fork-translate'
import { workspacePortForwardEnabled } from './workspace-port-forward-flag'

type OpenForward = (port: WorkspacePort) => void

let openForward: OpenForward | null = null
const listeners = new Set<() => void>()

function publishOpenForward(next: OpenForward | null): void {
  openForward = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readOpenForward(): OpenForward | null {
  return openForward
}

function useOpenForward(): OpenForward | null {
  return useSyncExternalStore(subscribe, readOpenForward, readOpenForward)
}

function forwardLabel(): string {
  return forkTranslate('auto.components.right.sidebar.PortsPanel.c9d106547a', 'Forward')
}

/** Ports panel slot. Owns the existing forward dialog, prefilled from the chosen port. */
function Dialog({ targetId }: { targetId: string | null }): React.JSX.Element | null {
  const [state, setState] = useState<PortForwardDialogState>({ mode: 'closed' })
  const enabled = workspacePortForwardEnabled() && targetId !== null
  useLayoutEffect(() => {
    if (!enabled || targetId === null) {
      return
    }
    const open: OpenForward = (port) => {
      setState({
        mode: 'add',
        defaults: {
          remotePort: port.port,
          remoteHost: 'localhost',
          label: port.processName,
          targetId
        }
      })
    }
    publishOpenForward(open)
    return () => {
      if (openForward === open) {
        publishOpenForward(null)
      }
    }
  }, [enabled, targetId])
  if (!enabled || targetId === null) {
    return null
  }
  return (
    <SshPortForwardDialog
      state={state}
      activeConnectionId={targetId}
      onClose={() => setState({ mode: 'closed' })}
    />
  )
}

/** Row hover-bar slot. */
function RowButton({ port }: { port: WorkspacePort }): React.JSX.Element | null {
  const open = useOpenForward()
  if (!open) {
    return null
  }
  const label = forwardLabel()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => open(port)}
          aria-label={label}
        >
          <Cable size={13} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Row context-menu slot. */
function MenuItem({
  port,
  className
}: {
  port: WorkspacePort
  className: string
}): React.JSX.Element | null {
  const open = useOpenForward()
  if (!open) {
    return null
  }
  return (
    <ContextMenuItem className={className} onSelect={() => open(port)}>
      <Cable size={13} />
      {forwardLabel()}
    </ContextMenuItem>
  )
}

export const ForkPortForward = { Dialog, RowButton, MenuItem }
