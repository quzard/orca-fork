import { assertGitDiffWithinTransportBudget } from '../../../shared/git-diff-transport-budget'
import { remoteRpcContentBudget } from '../../../shared/remote-rpc-content-budget'
import type { GitBranchCompareResult, GitDiffResult } from '../../../shared/git-diff-compare-types'
import { getBranchDiff } from '../../../main/git/status'
import {
  localGitOptionsForTarget,
  requireRuntimeGitProvider,
  type RuntimeGitTarget
} from '../../../main/runtime/runtime-git-command-target'
import { REPOSITORY_UNINITIALIZED } from '../../git-workspace/constants'
import type { WorkspaceRepositoryList, WorkspaceRepositoryStatus } from '../../git-workspace/types'
import { forkGitTargetResolver } from './bind-target'
import { resolveWorkspaceCompareTarget } from './compare-target'
import { CompareTargetStore } from './compare-target-store'
import { discoverWorkspaceRepositories } from './discover'
import { assertFilePathInsideRepository, locateWorkspaceRepository } from './guard'

type RpcClient = {
  clientKind?: 'mobile' | 'runtime'
  requestId?: string
  signal?: AbortSignal
}

function contentBudget(client: RpcClient): number | undefined {
  return client.clientKind && client.requestId
    ? remoteRpcContentBudget(client.requestId)
    : undefined
}

function providerFor(target: RuntimeGitTarget, signal?: AbortSignal) {
  const localGitOptions = localGitOptionsForTarget(target)
  // 把这次请求的 signal 放进本地 git 选项，WSL 路由仍由 requireRuntimeGitProvider 决定。
  return requireRuntimeGitProvider({
    ...target,
    localGitOptions: signal ? { ...localGitOptions, signal } : localGitOptions
  })
}

async function openRepository(
  worktree: string,
  repositoryPath: string,
  refresh: boolean,
  signal?: AbortSignal
) {
  const target = await forkGitTargetResolver()(worktree)
  const gitOptions = localGitOptionsForTarget(target)
  const discovery = await discoverWorkspaceRepositories(target.worktree.path, {
    gitOptions,
    refresh,
    signal
  })
  const entry = await locateWorkspaceRepository(
    target.worktree.path,
    repositoryPath,
    discovery.repositories
  )
  return { target, gitOptions, entry }
}

function compareKey(target: RuntimeGitTarget, repositoryPath: string, branch: string) {
  return {
    hostId: target.worktree.hostId ?? target.executionHostId,
    worktreePath: target.worktree.path,
    repositoryPath,
    branch
  }
}

export async function listWorkspaceRepositories(
  worktree: string,
  refresh: boolean,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryList> {
  const target = await forkGitTargetResolver()(worktree)
  return discoverWorkspaceRepositories(target.worktree.path, {
    gitOptions: localGitOptionsForTarget(target),
    refresh,
    signal
  })
}

export async function readWorkspaceRepositoryStatus(
  worktree: string,
  repositoryPath: string,
  admissionTier: 'interactive' | 'status' | 'background' | undefined,
  signal?: AbortSignal
): Promise<WorkspaceRepositoryStatus> {
  const opened = await openRepository(worktree, repositoryPath, false, signal)
  if (opened.entry.uninitialized) {
    return {
      repositoryPath: opened.entry.repositoryPath,
      uninitialized: true,
      branch: null,
      head: null,
      entries: [],
      compareTarget: { ref: null, source: 'unset' }
    }
  }
  const status = await providerFor(opened.target, signal).getStatus(opened.entry.realPath, {
    admissionTier: admissionTier ?? 'status',
    includeLineStats: false,
    signal
  })
  const branch = status.branch ?? null
  const compareTarget = await resolveWorkspaceCompareTarget({
    store: CompareTargetStore.fromUserData(),
    key: compareKey(opened.target, opened.entry.repositoryPath, branch ?? ''),
    repoAbsolutePath: opened.entry.realPath,
    gitOptions: opened.gitOptions
  })
  return {
    repositoryPath: opened.entry.repositoryPath,
    uninitialized: false,
    branch,
    head: status.head ?? null,
    entries: status.entries,
    ...(status.upstreamStatus ? { upstreamStatus: status.upstreamStatus } : {}),
    ...(status.didHitLimit ? { didHitLimit: true } : {}),
    compareTarget
  }
}

export async function readWorkspaceRepositoryBranchCompare(
  worktree: string,
  repositoryPath: string,
  baseRef: string,
  admissionTier: 'interactive' | 'status' | 'background' | undefined,
  signal?: AbortSignal
): Promise<GitBranchCompareResult> {
  const opened = await openRepository(worktree, repositoryPath, false, signal)
  if (opened.entry.uninitialized) {
    throw new Error(REPOSITORY_UNINITIALIZED)
  }
  return providerFor(opened.target, signal).getBranchCompare(opened.entry.realPath, baseRef, {
    admissionTier: admissionTier ?? 'background'
  })
}

export async function readWorkspaceRepositoryDiff(
  worktree: string,
  repositoryPath: string,
  filePath: string,
  staged: boolean,
  compareAgainstHead: boolean | undefined,
  client: RpcClient
): Promise<GitDiffResult> {
  const opened = await openRepository(worktree, repositoryPath, false, client.signal)
  if (opened.entry.uninitialized) {
    throw new Error(REPOSITORY_UNINITIALIZED)
  }
  const relativePath = assertFilePathInsideRepository(filePath)
  return assertGitDiffWithinTransportBudget(
    await providerFor(opened.target, client.signal).getDiff(
      opened.entry.realPath,
      relativePath,
      staged,
      compareAgainstHead
    ),
    contentBudget(client)
  )
}

export async function readWorkspaceRepositoryBranchDiff(
  worktree: string,
  repositoryPath: string,
  filePath: string,
  oldPath: string | undefined,
  compare: { headOid: string; mergeBase: string },
  client: RpcClient
): Promise<GitDiffResult> {
  const opened = await openRepository(worktree, repositoryPath, false, client.signal)
  if (opened.entry.uninitialized) {
    throw new Error(REPOSITORY_UNINITIALIZED)
  }
  // 和上游 git.branchDiff 一样：先确认这条路由能在本机（含 WSL）执行。
  requireRuntimeGitProvider(opened.target)
  return assertGitDiffWithinTransportBudget(
    await getBranchDiff(
      opened.entry.realPath,
      {
        headOid: compare.headOid,
        mergeBase: compare.mergeBase,
        filePath: assertFilePathInsideRepository(filePath),
        ...(oldPath ? { oldPath: assertFilePathInsideRepository(oldPath) } : {})
      },
      {
        ...opened.gitOptions,
        admissionTier: 'interactive',
        ...(client.signal ? { signal: client.signal } : {})
      }
    ),
    contentBudget(client)
  )
}

export async function writeWorkspaceCompareTarget(
  worktree: string,
  repositoryPath: string,
  branch: string,
  ref: string | null
): Promise<{ repositoryPath: string; branch: string; ref: string | null }> {
  const opened = await openRepository(worktree, repositoryPath, false)
  CompareTargetStore.fromUserData().set(
    compareKey(opened.target, opened.entry.repositoryPath, branch),
    ref
  )
  return { repositoryPath: opened.entry.repositoryPath, branch, ref }
}
