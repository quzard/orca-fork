import { useMemo } from 'react'
<<<<<<< HEAD
import { parseWslUncPath } from '../../../../shared/wsl-paths'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree/id'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  createNormalizedPathInsideOrEqualMatcher,
  isRuntimePathAbsolute,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { matchForkCwdCandidates } from '../../../../shared/fork-hooks/ai-vault-cwd'
=======
>>>>>>> 55dffb479a8366fb48b49f1bc893f16a0b9455ea
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  buildAiVaultSessionWorktreeMap,
  type AiVaultSessionWorktreeInfo
} from '../../../../shared/ai-vault-session-worktree'

export {
  aiVaultWorktreeCompactPath,
  canJumpToAiVaultSessionWorktree,
  resolveAiVaultSessionWorktreeDisplay,
  resolveAiVaultSessionWorktreeInfo,
  withAiVaultCurrentWorktreeStatus,
  type AiVaultSessionWorktreeInfo,
  type AiVaultSessionWorktreeStatus
} from '../../../../shared/ai-vault-session-worktree'
export {
  aiVaultResumeInSessionWorkspaceLabel,
  aiVaultSessionWorkspaceHeading,
  aiVaultWorktreeJumpTooltip,
  aiVaultWorktreeStatusLabel,
  isAiVaultFolderWorkspaceId,
  isAiVaultSessionInCurrentWorktree,
  shouldShowAiVaultSessionWorktreeLine,
  shouldShowAiVaultWorktreeStatusBadge
} from './ai-vault-session-worktree-affordances'

/** Include worktrees and folder: rows; put git first to win equal-path ties in the stable sort. */
export function aiVaultSessionOwnerWorkspaces(
  worktrees: readonly Worktree[],
  folderWorkspaces: readonly FolderWorkspace[]
): readonly Worktree[] {
  return folderWorkspaces.length === 0
    ? worktrees
    : [...worktrees, ...folderWorkspaces.map(folderWorkspaceToWorktree)]
}

export function useAiVaultSessionOwnerWorkspaces(
  worktrees: readonly Worktree[],
  { folderWorkspaces }: { folderWorkspaces: readonly FolderWorkspace[] }
): readonly Worktree[] {
  return useMemo(
    () => aiVaultSessionOwnerWorkspaces(worktrees, folderWorkspaces),
    [folderWorkspaces, worktrees]
  )
}

<<<<<<< HEAD
export function resolveAiVaultSessionWorktreeInfo({
  session,
  repos = [],
  worktrees,
  activeWorktreeId
}: {
  session: AiVaultSession
  repos?: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
  worktrees: readonly Worktree[]
  activeWorktreeId: string | null
}): AiVaultSessionWorktreeInfo | null {
  return withAiVaultCurrentWorktreeStatus(
    resolveWorktreeInfoFromCandidates(session, buildWorktreeCandidates(worktrees, repos)),
    activeWorktreeId
  )
}

/** Stamp current at read time so workspace switches do not rebuild the session map. */
export function withAiVaultCurrentWorktreeStatus(
  worktreeInfo: AiVaultSessionWorktreeInfo | null,
  activeWorktreeId: string | null
): AiVaultSessionWorktreeInfo | null {
  if (!worktreeInfo?.worktreeId || worktreeInfo.worktreeId !== activeWorktreeId) {
    return worktreeInfo
  }
  return worktreeInfo.status === 'current' ? worktreeInfo : { ...worktreeInfo, status: 'current' }
}

function resolveWorktreeInfoFromCandidates(
  session: AiVaultSession,
  candidates: readonly WorktreeCandidate[]
): AiVaultSessionWorktreeInfo | null {
  if (!session.cwd) {
    return null
  }

  const sessionHostId = normalizeExecutionHostId(session.executionHostId)
  // fork: symlink aliases pick the more specific path. No aliases keeps the cwd sort.
  const best = matchForkCwdCandidates(session, candidates, {
    normalize: normalizeRuntimePathForComparison,
    owns: (candidate, normalizedCwd) => candidate.ownsNormalizedCwd(normalizedCwd),
    pathLength: (candidate) => candidate.normalizedPathLength,
    tieBreak: compareWorktreeCandidates
  }).find((candidate) => !sessionHostId || candidate.hostId === sessionHostId)
  if (!best) {
    return {
      status: 'unavailable',
      label: compactPathLabel(session.cwd),
      path: session.cwd
    }
  }

  return {
    status: best.status,
    label: best.worktree.displayName || compactPathLabel(best.path),
    path: best.path,
    worktreeId: best.worktree.id
  }
}

export function extractWorktreePathFromSessionTitle(title: string): string | null {
  const trimmed = title.trim()
  if (!trimmed) {
    return null
  }

  const suffixMatch = trimmed.match(/\s-\s*Worktree:\s*(.+)$/i)
  if (suffixMatch?.[1]) {
    return suffixMatch[1].trim()
  }

  const inlineMatch = trimmed.match(/\bWorktree:\s*(.+)$/i)
  return inlineMatch?.[1]?.trim() ?? null
}

export function resolveAiVaultSessionWorktreeDisplay(args: {
  session: AiVaultSession
  repos?: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
  worktrees: readonly Worktree[]
  activeWorktreeId: string | null
}): AiVaultSessionWorktreeInfo | null {
  return withAiVaultCurrentWorktreeStatus(
    resolveWorktreeDisplayFromCandidates(
      args.session,
      buildWorktreeCandidates(args.worktrees, args.repos ?? [])
    ),
    args.activeWorktreeId
  )
}

function resolveWorktreeDisplayFromCandidates(
  session: AiVaultSession,
  candidates: readonly WorktreeCandidate[]
): AiVaultSessionWorktreeInfo | null {
  const resolved = resolveWorktreeInfoFromCandidates(session, candidates)
  if (resolved) {
    return resolved
  }

  const cwd = session.cwd?.trim()
  if (cwd) {
    return unavailableWorktreeInfo(cwd)
  }

  const titlePath = extractWorktreePathFromSessionTitle(session.title)
  if (titlePath) {
    return unavailableWorktreeInfo(titlePath)
  }

  const branch = session.branch?.trim()
  if (branch) {
    return {
      status: 'unavailable',
      label: branch,
      path: branch
    }
  }

  return null
}

=======
>>>>>>> 55dffb479a8366fb48b49f1bc893f16a0b9455ea
/** Keep active-worktree state out of this map; callers stamp current per row to avoid rebuilding candidates × sessions. */
export function useAiVaultSessionWorktreeMap({
  sessions,
  repos = [],
  worktrees
}: {
  sessions: readonly AiVaultSession[]
  repos?: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
  worktrees: readonly Worktree[]
}): ReadonlyMap<string, AiVaultSessionWorktreeInfo> {
  return useMemo(
    () => buildAiVaultSessionWorktreeMap({ sessions, repos, worktrees }),
    [repos, sessions, worktrees]
  )
}
