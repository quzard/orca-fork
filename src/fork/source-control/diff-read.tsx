import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { WorkspaceRepositoryDiffInput } from '../../shared/fork-hooks/workspace-repository-diff'
import {
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD
} from '../git-workspace/constants'
import { repositoryForRootRelativePath } from './discovered-repos'
import { callWorkspaceGit } from './rpc-client'

function oldPathInside(repositoryPath: string, oldPath: string | undefined): string | undefined {
  if (!oldPath) {
    return undefined
  }
  const normalized = oldPath.split('\\').join('/')
  const prefix = `${repositoryPath}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined
}

// 同步返回。未命中嵌套仓库时是 null，调用方不额外 await。
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
  const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
  if (!match) {
    return null
  }
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
