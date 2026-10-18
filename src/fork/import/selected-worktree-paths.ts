import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { mergeExternalWorktreeInboxPaths } from '../../shared/external-worktree-inbox'

/** Selected directories that are not the repo's own checkout. */
function selectedLinkedWorktreePaths(repoPath: string, selectedPaths: readonly string[]): string[] {
  const repoKey = normalizeRuntimePathForComparison(repoPath)
  return selectedPaths.filter(
    (path) => path.trim().length > 0 && normalizeRuntimePathForComparison(path) !== repoKey
  )
}

export function mergeSelectedWorktreeInbox(
  existing: readonly string[] | undefined,
  baseline: readonly string[] | undefined,
  repoPath: string,
  selectedPaths: readonly string[]
): {
  importedExternalWorktreePaths: string[]
  externalWorktreeInboxBaselinePaths: string[]
} | null {
  const linked = selectedLinkedWorktreePaths(repoPath, selectedPaths)
  const importedExternalWorktreePaths = mergeExternalWorktreeInboxPaths(existing, linked)
  if (importedExternalWorktreePaths.length === (existing?.length ?? 0)) {
    return null
  }
  return {
    importedExternalWorktreePaths,
    externalWorktreeInboxBaselinePaths: mergeExternalWorktreeInboxPaths(baseline, linked)
  }
}
