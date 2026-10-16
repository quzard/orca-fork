// Card prefix. Collisions are resolved per host so two hosts can share a basename.
import { relativePathInsideRoot } from '../../shared/cross-platform-path'
import type { ExecutionHostId } from '../../shared/execution-host'
import {
  getRepoDisplayLabelKey,
  getRepoDisplayLabelsByPath
} from '../../shared/repo-display-labels'
import type { Repo } from '../../shared/repo-types'

export function directoryLabelsForHost(
  repos: readonly Repo[],
  hostId: ExecutionHostId
): Map<string, string> {
  const items = repos.map((repo) => ({
    path: repo.path,
    displayName: repo.displayName,
    executionHostId: hostId
  }))
  return getRepoDisplayLabelsByPath(items)
}

export function directoryLabelForRepo(
  repo: Repo | undefined,
  labels: ReadonlyMap<string, string>,
  hostId: ExecutionHostId
): string | undefined {
  if (!repo) {
    return undefined
  }
  return (
    labels.get(
      getRepoDisplayLabelKey({
        path: repo.path,
        executionHostId: hostId
      })
    ) ?? repo.displayName
  )
}

// A single checkout under a group drops the group's parent directory from the card.
// A repo that itself lives under that parent keeps the disambiguated name.
export function groupedCardDirectoryLabel(args: {
  repo: Repo | undefined
  worktreePath: string
  labels: ReadonlyMap<string, string>
  hostId: ExecutionHostId
  parentPath: string | null | undefined
  sameRepoCount: number
  pending: boolean
}): string | undefined {
  const disambiguated = directoryLabelForRepo(args.repo, args.labels, args.hostId)
  if (!disambiguated || !args.parentPath || args.sameRepoCount !== 1 || args.pending) {
    return disambiguated
  }
  const worktreeDirectory = relativePathInsideRoot(args.parentPath, args.worktreePath)
  const registeredDirectory = args.repo
    ? relativePathInsideRoot(args.parentPath, args.repo.path)
    : null
  if (registeredDirectory != null) {
    return disambiguated
  }
  return worktreeDirectory || disambiguated
}
