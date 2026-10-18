// Eye, host menu, and workspace menu entries for hidden workspaces and removal.
import React from 'react'
import { Eye, FolderMinus } from 'lucide-react'
import { DropdownMenuItem } from '../../renderer/src/components/ui/dropdown-menu'
import { Button } from '../../renderer/src/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../renderer/src/components/ui/tooltip'
import { forkTranslate } from '../i18n/fork-translate'
import { getWorktreeExecutionHostId } from '../../shared/execution-host'
import { useAppStore } from '../../renderer/src/store'
import {
  registerHostSectionMenuExtra,
  registerSidebarContextMenu,
  registerSidebarHeaderExtra
} from '../../shared/fork-hooks/sidebar-chrome'
import { workspaceRemovalLabels, removeWorkspaceFromOrca } from './remove-workspace'

function openVisibility(hostId: string | undefined, repoId?: string): void {
  const state = useAppStore.getState()
  const repo =
    (repoId ? state.repos.find((entry) => entry.id === repoId) : undefined) ??
    state.repos.find(
      (entry) =>
        !hostId ||
        entry.executionHostId === hostId ||
        (!entry.executionHostId && hostId === 'local')
    )
  if (!repo) {
    return
  }
  state.openModal('worktree-visibility', { repoId: repo.id, ...(hostId ? { hostId } : {}) })
}

function HeaderEye(): React.JSX.Element {
  const label = forkTranslate('fork.sidebar.hiddenWorkspaces', 'Hidden workspaces')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          className="text-muted-foreground"
          aria-label={label}
          onClick={() => openVisibility(undefined)}
        >
          <Eye className="size-3.5" strokeWidth={2.25} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function registerSidebarMenuSlots(): void {
  registerSidebarHeaderExtra(() => <HeaderEye />)
  registerHostSectionMenuExtra((hostId) => (
    <DropdownMenuItem onSelect={() => openVisibility(hostId)}>
      <Eye className="size-3.5" />
      {forkTranslate('fork.sidebar.hiddenWorkspaces', 'Hidden workspaces')}
    </DropdownMenuItem>
  ))
  registerSidebarContextMenu((worktree) => (
    <>
      <DropdownMenuItem
        onSelect={() =>
          openVisibility(
            worktree.hostId ?? getWorktreeExecutionHostId(worktree, undefined),
            worktree.repoId
          )
        }
      >
        <Eye className="size-3.5" />
        {forkTranslate('fork.sidebar.hiddenWorkspaces', 'Hidden workspaces')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          void removeWorkspaceFromOrca(worktree)
        }}
      >
        <FolderMinus className="size-3.5" />
        {workspaceRemovalLabels.menu}
      </DropdownMenuItem>
    </>
  ))
}
