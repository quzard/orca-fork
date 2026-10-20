// fork: the workspace context menu's Sleep and Delete labels. Unregistered, upstream's English.

export type WorktreeContextMenuLabelCounts = {
  isMultiContext: boolean
  sleepCount: number
  deleteCount: number
}

export type WorktreeContextMenuLabels = {
  sleepLabel: string
  deleteLabel: string
}

type LabelsHook = (counts: WorktreeContextMenuLabelCounts) => WorktreeContextMenuLabels

let labelsHook: LabelsHook | undefined

export function registerWorktreeContextMenuLabels(next: LabelsHook | undefined): void {
  labelsHook = next
}

/**
 * `upstream` is upstream's own label for `kind`, returned unchanged when the fork registered
 * nothing. `count` is the number of workspaces that label acts on.
 */
export function forkMenuLabel(
  kind: 'sleep' | 'delete',
  isMultiContext: boolean,
  count: number,
  upstream: string
): string {
  if (!labelsHook) {
    return upstream
  }
  return kind === 'sleep'
    ? labelsHook({ isMultiContext, sleepCount: count, deleteCount: 0 }).sleepLabel
    : labelsHook({ isMultiContext, sleepCount: 0, deleteCount: count }).deleteLabel
}
