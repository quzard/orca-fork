import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { WorkspaceRepositoryDiffInput } from '../../shared/fork-hooks/workspace-repository-diff'
import {
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD
} from '../git-workspace/constants'
import type { WorkspaceRepositoryList } from '../git-workspace/types'
import {
  hasDiscoveredRepositories,
  rememberDiscoveredRepositories,
  repositoryForRootRelativePath
} from './discovered-repos'
import { callWorkspaceGit } from './rpc-client'

function oldPathInside(repositoryPath: string, oldPath: string | undefined): string | undefined {
  if (!oldPath) {
    return undefined
  }
  const normalized = oldPath.split('\\').join('/')
  const prefix = `${repositoryPath}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined
}

function readMatchedDiff(
  input: WorkspaceRepositoryDiffInput,
  match: { repositoryPath: string; filePath: string }
): Promise<unknown> | null {
  const worktree = toRuntimeWorktreeSelector(input.file.worktreeId)
  if (input.effectiveDiffSource === 'branch') {
    const compare = input.branchCompare
    if (!compare?.baseOid || !compare.headOid || !compare.mergeBase) {
      return null
    }
    const oldPath = oldPathInside(match.repositoryPath, input.file.branchOldPath)
    return callWorkspaceGit(input.target, FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD, {
      worktree,
      repositoryPath: match.repositoryPath,
      filePath: match.filePath,
      ...(oldPath ? { oldPath } : {}),
      compare: {
        baseRef: compare.baseRef,
        baseOid: compare.baseOid,
        headOid: compare.headOid,
        mergeBase: compare.mergeBase
      }
    })
  }
  return callWorkspaceGit(input.target, FORK_GIT_WORKSPACE_DIFF_METHOD, {
    worktree,
    repositoryPath: match.repositoryPath,
    filePath: match.filePath,
    staged: input.effectiveDiffSource === 'staged',
    compareAgainstHead: input.compareAgainstHead
  })
}

async function discoverThenRead(input: WorkspaceRepositoryDiffInput): Promise<unknown> {
  const list = await callWorkspaceGit<WorkspaceRepositoryList>(
    input.target,
    FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
    { worktree: toRuntimeWorktreeSelector(input.file.worktreeId), refresh: false }
  )
  rememberDiscoveredRepositories(input.file.worktreeId, list.repositories)
  const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
  // 发现失败不能退回根仓库。只有确认不在嵌套仓库里才用上游读取。
  if (!match) {
    return input.readUpstream()
  }
  return readMatchedDiff(input, match) ?? input.readUpstream()
}

// 提交 diff 和已经扫过、确定不在嵌套仓库里的路径同步返回 null。缓存是冷的时先发现。
export function readNestedRepositoryDiff(
  input: WorkspaceRepositoryDiffInput
): Promise<unknown> | null {
  if (
    !input.effectiveDiffSource ||
    input.effectiveDiffSource === 'commit' ||
    input.effectiveDiffSource.startsWith('combined')
  ) {
    return null
  }
  if (!hasDiscoveredRepositories(input.file.worktreeId)) {
    return discoverThenRead(input)
  }
  const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
  return match ? readMatchedDiff(input, match) : null
}
