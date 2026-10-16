import type { AiVaultSession } from '../ai-vault-types'

type AliasSession = Pick<AiVaultSession, 'cwd' | 'cwdAliases'>

/** Cwd plus symlink aliases. With no aliases this is the original cwd alone. */
export function forkSessionComparisonCwds(session: AliasSession): readonly string[] {
  if (!session.cwd) {
    return []
  }
  const aliases = session.cwdAliases
  if (!aliases || aliases.length === 0) {
    return [session.cwd]
  }
  return [session.cwd, ...aliases]
}

/** Cache key for project attribution. No aliases keeps the original cwd, including null. */
export function forkSessionCwdCacheKey(session: AliasSession): string | null {
  if (!session.cwd || !session.cwdAliases || session.cwdAliases.length === 0) {
    return session.cwd
  }
  return JSON.stringify([session.cwd, ...session.cwdAliases])
}

/** Alias-aware owner order. Without aliases this is the original cwd filter and tie-break. */
export function matchForkCwdCandidates<T>(
  session: AliasSession,
  candidates: readonly T[],
  options: RankOptions<T>
): T[] {
  const ranked = rankForkCwdOwners(session, candidates, options)
  if (ranked) {
    return ranked
  }
  if (!session.cwd) {
    return []
  }
  const normalizedCwd = options.normalize(session.cwd)
  return candidates
    .filter((candidate) => options.owns(candidate, normalizedCwd))
    .sort(options.tieBreak)
}

type RankOptions<T> = {
  normalize: (path: string) => string
  owns: (candidate: T, normalizedCwd: string) => boolean
  pathLength: (candidate: T) => number
  tieBreak: (left: T, right: T) => number
}

/**
 * Prefer the workspace whose path leaves the shortest remainder under any alias.
 * Returns null when the session has no aliases, so callers keep their original sort.
 */
export function rankForkCwdOwners<T>(
  session: AliasSession,
  candidates: readonly T[],
  options: RankOptions<T>
): T[] | null {
  if (!session.cwd || !session.cwdAliases || session.cwdAliases.length === 0) {
    return null
  }
  const normalizedCwds = forkSessionComparisonCwds(session).map(options.normalize)
  return candidates
    .flatMap((candidate) => {
      const lengths = normalizedCwds
        .filter((path) => options.owns(candidate, path))
        .map((path) => path.length)
      if (lengths.length === 0) {
        return []
      }
      return [
        {
          candidate,
          cwdDistance: Math.min(...lengths) - options.pathLength(candidate)
        }
      ]
    })
    .sort(
      (left, right) =>
        left.cwdDistance - right.cwdDistance || options.tieBreak(left.candidate, right.candidate)
    )
    .map((entry) => entry.candidate)
}
