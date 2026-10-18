// fork: Chinese (and fork English) for the workspace context menu's Sleep and Delete labels.
import { translate } from '../../renderer/src/i18n/i18n'
import {
  registerWorktreeContextMenuLabels,
  type WorktreeContextMenuLabelCounts,
  type WorktreeContextMenuLabels
} from '../../shared/fork-hooks/worktree-context-menu-labels'

const KEY = 'fork.sidebar.contextMenu'

/** Same choice as upstream: a count only in a multi-select with something to act on. */
export function forkWorktreeContextMenuLabels({
  isMultiContext,
  sleepCount,
  deleteCount
}: WorktreeContextMenuLabelCounts): WorktreeContextMenuLabels {
  const sleepLabel =
    isMultiContext && sleepCount > 0
      ? sleepCount === 1
        ? translate(`${KEY}.sleepOne`, 'Sleep {{count}} Workspace', { count: sleepCount })
        : translate(`${KEY}.sleepMany`, 'Sleep {{count}} Workspaces', { count: sleepCount })
      : translate(`${KEY}.sleep`, 'Sleep')
  const deleteLabel =
    isMultiContext && deleteCount > 0
      ? deleteCount === 1
        ? translate(`${KEY}.deleteOne`, 'Delete {{count}} Workspace', { count: deleteCount })
        : translate(`${KEY}.deleteMany`, 'Delete {{count}} Workspaces', { count: deleteCount })
      : translate(`${KEY}.deleteSelected`, 'Delete Selected')
  return { sleepLabel, deleteLabel }
}

export function registerForkWorktreeContextMenuLabels(): void {
  registerWorktreeContextMenuLabels(forkWorktreeContextMenuLabels)
}
