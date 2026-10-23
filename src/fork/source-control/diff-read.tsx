import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import type { WorkspaceRepositoryDiffInput } from '../../shared/fork-hooks/workspace-repository-diff'
import {
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD
} from '../git-workspace/constants'
import type { WorkspaceRepositoryList } from '../git-workspace/types'
import { desktopGitRouteServesWorkspaceRepos } from './desktop-git-route'
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

// 路径已经落在嵌套仓库里时，失败也不能改拿根仓库的 diff。
function nestedDiff(
  input: WorkspaceRepositoryDiffInput,
  match: { repositoryPath: string; filePath: string }
): Promise<unknown> {
  return (
    readMatchedDiff(input, match) ?? Promise.reject(new Error('nested repository diff unavailable'))
  )
}

async function hostCanDiscover(input: WorkspaceRepositoryDiffInput): Promise<boolean> {
  if (input.target.kind !== 'environment') {
    return desktopGitRouteServesWorkspaceRepos({ connectionId: input.connectionId })
  }
  try {
    return await runtimeEnvironmentSupportsCapability(
      input.target.environmentId,
      FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
    )
  } catch {
    return false
  }
}

async function discoverThenRead(input: WorkspaceRepositoryDiffInput): Promise<unknown> {
  if (!(await hostCanDiscover(input))) {
    return input.readUpstream()
  }
  try {
    const list = await callWorkspaceGit<WorkspaceRepositoryList>(
      input.target,
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      { worktree: toRuntimeWorktreeSelector(input.file.worktreeId), refresh: false }
    )
    rememberDiscoveredRepositories(input.file.worktreeId, list.repositories)
  } catch {
    // 方法不存在、路由拒绝或扫描超时：这次还不知道路径在哪，退回上游。
    return input.readUpstream()
  }
  const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
  return match ? nestedDiff(input, match) : input.readUpstream()
}

// 提交 diff、以及已经扫过且不在嵌套仓库里的路径，同步返回 null。
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
  if (hasDiscoveredRepositories(input.file.worktreeId)) {
    const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
    return match ? nestedDiff(input, match) : null
  }
  // 桌面 ssh: 行同步跳过，不发发现请求。远端主机要等能力探测，所以走异步。
  if (
    input.target.kind !== 'environment' &&
    !desktopGitRouteServesWorkspaceRepos({ connectionId: input.connectionId })
  ) {
    return null
  }
  return discoverThenRead(input)
}
