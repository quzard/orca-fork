// fork: Chinese (and fork English) for the workspace context menu's Sleep and Delete labels.
import { forkTranslate } from '../i18n/fork-translate'
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
        ? forkTranslate(`${KEY}.sleepOne`, 'Sleep {{count}} Workspace', { count: sleepCount })
        : forkTranslate(`${KEY}.sleepMany`, 'Sleep {{count}} Workspaces', { count: sleepCount })
      : forkTranslate(`${KEY}.sleep`, 'Sleep')
  const deleteLabel =
    isMultiContext && deleteCount > 0
      ? deleteCount === 1
        ? forkTranslate(`${KEY}.deleteOne`, 'Delete {{count}} Workspace', { count: deleteCount })
        : forkTranslate(`${KEY}.deleteMany`, 'Delete {{count}} Workspaces', { count: deleteCount })
      : forkTranslate(`${KEY}.deleteSelected`, 'Delete Selected')
  return { sleepLabel, deleteLabel }
}

export function registerForkWorktreeContextMenuLabels(): void {
  registerWorktreeContextMenuLabels(forkWorktreeContextMenuLabels)
}
