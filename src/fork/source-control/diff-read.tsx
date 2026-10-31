import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { GitDiffResult } from '../../shared/git-diff-compare-types'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import type { WorkspaceRepositoryDiffInput } from '../../shared/fork-hooks/workspace-repository-diff'
import {
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  WORKSPACE_REPOSITORY_DISCOVERY_SKIP_MS,
  WORKSPACE_REPOSITORY_LIST_RPC_TIMEOUT_MS
} from '../git-workspace/constants'
import type { WorkspaceRepositoryList } from '../git-workspace/types'
import { desktopGitRouteServesWorkspaceRepos } from './desktop-git-route'
import {
  discoveredRepositoriesAreFresh,
  hasDiscoveredRepositories,
  rememberDiscoveredRepositories,
  repositoryForRootRelativePath
} from './discovered-repos'
import { callWorkspaceGit } from './rpc-client'

type NestedMatch = { repositoryPath: string; filePath: string }
type ReadUpstream = () => Promise<GitDiffResult>

const discoverySkips = new Map<string, number>()

export function clearDiscoverySkipsForTests(): void {
  discoverySkips.clear()
}

function discoverySkipped(worktreeId: string, now = Date.now()): boolean {
  const until = discoverySkips.get(worktreeId)
  if (until === undefined) {
    return false
  }
  if (until <= now) {
    discoverySkips.delete(worktreeId)
    return false
  }
  return true
}

function rememberDiscoverySkip(worktreeId: string): void {
  discoverySkips.set(worktreeId, Date.now() + WORKSPACE_REPOSITORY_DISCOVERY_SKIP_MS)
}

// diff 输入没有 executionHostId，只能用 connectionId。漏掉的 ssh: 或 runtime: 会在发现请求里被拒绝，再退回上游。
function localRouteCanDiscover(input: WorkspaceRepositoryDiffInput): boolean {
  return desktopGitRouteServesWorkspaceRepos({ connectionId: input.connectionId })
}

// 标签上的旧路径是根相对路径；只有落在同一个仓库里的才传给仓库。
function oldPathInside(repositoryPath: string, oldPath: string | undefined): string | undefined {
  if (!oldPath) {
    return undefined
  }
  const normalized = oldPath.split('\\').join('/')
  const prefix = `${repositoryPath}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : undefined
}

// 路径已经落在嵌套仓库里时，失败也不能改拿根仓库的 diff。
function nestedDiff(
  input: WorkspaceRepositoryDiffInput,
  match: NestedMatch
): Promise<GitDiffResult> {
  const worktree = toRuntimeWorktreeSelector(input.file.worktreeId)
  const oldPath = oldPathInside(match.repositoryPath, input.file.branchOldPath)
  if (input.effectiveDiffSource === 'branch') {
    const compare = input.file.branchCompare
    if (!compare?.baseOid || !compare.headOid || !compare.mergeBase) {
      return Promise.reject(new Error('nested repository diff unavailable'))
    }
    return callWorkspaceGit<GitDiffResult>(
      input.fileTarget,
      FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
      {
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
      }
    )
  }
  const staged = input.effectiveDiffSource === 'staged'
  return callWorkspaceGit<GitDiffResult>(input.fileTarget, FORK_GIT_WORKSPACE_DIFF_METHOD, {
    worktree,
    repositoryPath: match.repositoryPath,
    filePath: match.filePath,
    staged,
    compareAgainstHead: input.compareAgainstHead,
    // 和上游一样，旧路径只用于暂存区的改名。
    ...(staged && oldPath ? { oldPath } : {})
  })
}

function readByRecord(
  input: WorkspaceRepositoryDiffInput,
  readUpstream: ReadUpstream
): Promise<GitDiffResult> {
  const match = repositoryForRootRelativePath(input.file.worktreeId, input.file.relativePath)
  return match ? nestedDiff(input, match) : readUpstream()
}

async function hostCanDiscover(input: WorkspaceRepositoryDiffInput): Promise<boolean> {
  if (input.fileTarget.kind !== 'environment') {
    return localRouteCanDiscover(input)
  }
  try {
    return await runtimeEnvironmentSupportsCapability(
      input.fileTarget.environmentId,
      FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
    )
  } catch {
    return false
  }
}

async function discoverThenRead(
  input: WorkspaceRepositoryDiffInput,
  readUpstream: ReadUpstream
): Promise<GitDiffResult> {
  const worktreeId = input.file.worktreeId
  try {
    if (!(await hostCanDiscover(input))) {
      throw new Error('workspace repositories unavailable')
    }
    const list = await callWorkspaceGit<WorkspaceRepositoryList>(
      input.fileTarget,
      FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
      { worktree: toRuntimeWorktreeSelector(worktreeId), refresh: false },
      { timeoutMs: WORKSPACE_REPOSITORY_LIST_RPC_TIMEOUT_MS }
    )
    rememberDiscoveredRepositories(worktreeId, list.repositories)
  } catch {
    // 主机没有这个能力、路由拒绝或扫描超时：短时间内不再问。手上有旧记录就按旧记录分流，没有才退回上游。
    rememberDiscoverySkip(worktreeId)
  }
  return readByRecord(input, readUpstream)
}

// 提交 diff、合并视图，以及记录还新鲜且不在嵌套仓库里的路径，同步返回 null。
export function readNestedRepositoryDiff(
  input: WorkspaceRepositoryDiffInput,
  readUpstream: ReadUpstream
): Promise<GitDiffResult> | null {
  const source = input.effectiveDiffSource
  if (!source || source === 'commit' || source.startsWith('combined')) {
    return null
  }
  const worktreeId = input.file.worktreeId
  const settled =
    discoveredRepositoriesAreFresh(worktreeId) ||
    (hasDiscoveredRepositories(worktreeId) && discoverySkipped(worktreeId))
  if (settled) {
    const match = repositoryForRootRelativePath(worktreeId, input.file.relativePath)
    return match ? nestedDiff(input, match) : null
  }
  if (discoverySkipped(worktreeId)) {
    return null
  }
  // 桌面 ssh: 行同步跳过，不发发现请求。远端主机要等能力探测，所以走异步。
  if (input.fileTarget.kind !== 'environment' && !localRouteCanDiscover(input)) {
    return null
  }
  return discoverThenRead(input, readUpstream)
}
