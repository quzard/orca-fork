// Archive one workspace in Orca. The directory and git branch stay on the host.
import { toast } from 'sonner'
import { translate } from '../../renderer/src/i18n/i18n'
import { getWorktreeExecutionHostId } from '../../shared/execution-host'
import { getWorktreeOperationOwnerHostIds } from '../../renderer/src/lib/worktree-operation-route'
import { findRepoForHost } from '../../renderer/src/store/slices/repo-host-identity'
import {
  clearWorktreeSleepIntent,
  markWorktreeSleepIntent
} from '../../renderer/src/lib/worktree-sleep-intent'
import { showWorkspaceListChangedToast } from '../../renderer/src/components/sidebar/stale-workspace-list-toast'
import type { WorktreeDeleteIdentity } from '../../renderer/src/components/sidebar/worktree-delete-request'
import { useAppStore } from '../../renderer/src/store'
import type { Worktree } from '../../shared/worktree/types'
import type { ExecutionHostId } from '../../shared/execution-host'

export const workspaceRemovalLabels = {
  get failed() {
    return translate('fork.workspaceRemoval.failed', 'Could not remove this workspace from Orca')
  },
  get ambiguous() {
    return translate(
      'fork.workspaceRemoval.ambiguous',
      'This workspace has multiple execution hosts. Its terminal ownership must be resolved before removal.'
    )
  },
  get removed() {
    return translate('fork.workspaceRemoval.removed', 'Workspace removed from Orca')
  },
  get undo() {
    return translate('fork.workspaceRemoval.undo', 'Undo')
  },
  get menu() {
    return translate('fork.workspaceRemoval.menu', 'Remove from Orca')
  }
}

function identityMatches(
  worktree: { instanceId?: string } | undefined,
  instanceId: string | undefined
): boolean {
  return Boolean(worktree) && (instanceId === undefined || worktree?.instanceId === instanceId)
}

function dropOrphanWorktree(worktree: Worktree, hostId: ExecutionHostId): void {
  useAppStore.setState((state) => {
    const list = state.worktreesByRepo[worktree.repoId] ?? []
    return {
      worktreesByRepo: {
        ...state.worktreesByRepo,
        [worktree.repoId]: list.filter((entry) => {
          if (entry.id !== worktree.id) {
            return true
          }
          return Boolean(hostId && entry.hostId && entry.hostId !== hostId)
        })
      }
    }
  })
}

export async function removeWorkspaceFromOrca(target: WorktreeDeleteIdentity): Promise<boolean> {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(target.id, target.hostId)
  if (!worktree || !identityMatches(worktree, target.instanceId)) {
    showWorkspaceListChangedToast()
    return false
  }
  const hostId = target.hostId ?? getWorktreeExecutionHostId(worktree, undefined)
  if (getWorktreeOperationOwnerHostIds(state, worktree.id).length > 1) {
    toast.error(workspaceRemovalLabels.ambiguous)
    return false
  }
  const wasActive =
    state.activeWorktreeId === worktree.id &&
    (state.activeWorkspaceExecutionHostId ?? hostId) === hostId
  if (wasActive) {
    markWorktreeSleepIntent(worktree.id)
    state.setActiveWorktree(null)
  }
  try {
    await state.shutdownWorktreeBrowsers(worktree.id)
    await state.shutdownWorktreeTerminals(worktree.id, { keepIdentifiers: true })
    const currentState = useAppStore.getState()
    const current = currentState.getKnownWorktreeById(worktree.id, hostId)
    if (!current || !identityMatches(current, target.instanceId)) {
      showWorkspaceListChangedToast()
      return false
    }
    const ownerRepo = findRepoForHost(currentState.repos, current.repoId, { hostId })
    if (!ownerRepo) {
      dropOrphanWorktree(current, hostId)
      toast.success(workspaceRemovalLabels.removed)
      return true
    }
    const result = await currentState.updateWorktreeMeta(
      worktree.id,
      { isArchived: true },
      { executionHostId: hostId }
    )
    if (!result.ok) {
      throw new Error(result.error ?? workspaceRemovalLabels.failed)
    }
    toast.success(workspaceRemovalLabels.removed, {
      action: {
        label: workspaceRemovalLabels.undo,
        onClick: () => {
          void useAppStore
            .getState()
            .updateWorktreeMeta(worktree.id, { isArchived: false }, { executionHostId: hostId })
            .then((restored) => {
              if (!restored.ok) {
                toast.error(restored.error ?? workspaceRemovalLabels.failed)
              }
            })
        }
      }
    })
    return true
  } catch (error) {
    toast.error(workspaceRemovalLabels.failed, {
      description: error instanceof Error ? error.message : String(error)
    })
    return false
  } finally {
    if (wasActive) {
      clearWorktreeSleepIntent(worktree.id)
    }
  }
}
