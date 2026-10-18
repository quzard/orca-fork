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

/** `upstream` is upstream's own English, returned unchanged when the fork registered nothing. */
export function worktreeContextMenuLabels(
  counts: WorktreeContextMenuLabelCounts,
  upstream: WorktreeContextMenuLabels
): WorktreeContextMenuLabels {
  return labelsHook ? labelsHook(counts) : upstream
}
