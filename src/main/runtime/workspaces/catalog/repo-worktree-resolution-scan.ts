import { resolveRegisteredMissingRepoWorktreeScan } from '../../../../shared/fork-hooks/missing-worktree-metadata'
import type { GitWorktreeInfo } from '../../../../shared/worktree/types'
import { listWorktreesSharedStrictAllowingTrueEmpty } from '../../../git/worktrees/catalog/worktree-scan-cache'
import type { LocalProjectWorktreeGitOptions } from '../../../workspaces/execution-host/project-runtime-git-options'

export type RuntimeWorktreeScanResult =
  | { ok: true; worktrees: GitWorktreeInfo[] }
  | { ok: false; worktrees: GitWorktreeInfo[]; trueEmpty?: boolean }

/** Runtime readers never treat an empty catalog as success; `trueEmpty` tells the shared owner it was confirmed. */
export async function scanLocalRepoWorktreesForResolution(
  repoPath: string,
  options: LocalProjectWorktreeGitOptions
): Promise<RuntimeWorktreeScanResult> {
  try {
    // Equivalent requests from other registrations of this path join one Git process.
    const worktrees = options.wslDistro
<<<<<<< HEAD
      ? await listWorktreesStrict(repoPath, options)
      : await listWorktreesStrict(repoPath)
    return { ok: true, worktrees }
  } catch (err) {
    return (
      (await resolveRegisteredMissingRepoWorktreeScan(repoPath, err)) ?? {
        ok: false,
        worktrees: []
      }
    )
=======
      ? await listWorktreesSharedStrictAllowingTrueEmpty(repoPath, options)
      : await listWorktreesSharedStrictAllowingTrueEmpty(repoPath)
    return worktrees.length > 0
      ? { ok: true, worktrees }
      : { ok: false, worktrees: [], trueEmpty: true }
  } catch {
    return { ok: false, worktrees: [] }
>>>>>>> c1f3309c1eec690cf93688b4edbe412ca2dcb175
  }
}
