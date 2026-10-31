import type { GitBranchCompareResult, GitDiffResult } from '../../../shared/git-diff-compare-types'
import { remoteRpcContentBudget } from '../../../shared/remote-rpc-content-budget'
import type { GitAdmissionTier } from '../../../shared/rpc-contract/git-admission-tier-params'
import type { GitRuntimeOptions } from '../../../main/git/git-runtime-options'
import { resolveRefOid } from '../../../main/git/source-control/compare-ref-oids'
import { RuntimeGitDiffCommands } from '../../../main/runtime/runtime-git-diff-commands'
import { RuntimeGitStatusCommands } from '../../../main/runtime/runtime-git-status-commands'
import {
  localGitOptionsForTarget,
  requireLocalRuntimeGitRoute,
  type RuntimeGitCommandHost,
  type RuntimeGitTarget
} from '../../../main/runtime/runtime-git-command-target'
import type { RpcContext } from '../../../main/runtime/rpc/core'
import { REPOSITORY_UNINITIALIZED } from '../../git-workspace/constants'
import type {
  WorkspaceRepositoryList,
  WorkspaceRepositoryRecord,
  WorkspaceRepositoryStatus
} from '../../git-workspace/types'
import { resolveWorkspaceCompareTarget } from './compare-target'
import { CompareTargetStore, type CompareTargetKey } from './compare-target-store'
import {
  discoverWorkspaceRepositories,
  WORKSPACE_REPOSITORY_MEMBERSHIP_MAX_AGE_MS
} from './discover'
import { locateWorkspaceRepository } from './guard'
import { listedNestedRepositoryRoots, omitNestedRepositoryEntries } from './root-status-entries'

type GitTargetResolver = Pick<RuntimeGitCommandHost, 'resolveRuntimeGitTarget'>

// RPC 上下文里用到的几项。runtime 是承载这个工作区的运行时（桌面本机或主机上的 orcad），测试只给解析函数。
export type WorkspaceRpcCaller = {
  runtime: RpcContext['runtime'] | GitTargetResolver
  clientKind?: 'mobile' | 'runtime'
  requestId?: string
  signal?: AbortSignal
}

// 和上游 git.diff 同一规则：只有 WebSocket 调用方带 clientKind，本机调用不截断。
function contentBudget(caller: WorkspaceRpcCaller): number | undefined {
  return caller.clientKind && caller.requestId
    ? remoteRpcContentBudget(caller.requestId)
    : undefined
}

// resolveRuntimeGitTarget 在运行时的子类上是 protected，RPC 处理函数只拿得到 runtime 本身。
function resolvesGitTargets(runtime: unknown): runtime is GitTargetResolver {
  return (
    typeof runtime === 'object' &&
    runtime !== null &&
    'resolveRuntimeGitTarget' in runtime &&
    typeof runtime.resolveRuntimeGitTarget === 'function'
  )
}

async function workspaceTarget(
  runtime: WorkspaceRpcCaller['runtime'],
  worktree: string
): Promise<RuntimeGitTarget> {
  if (!resolvesGitTargets(runtime)) {
    throw new Error('runtime_git_target_unavailable')
  }
  const target = await runtime.resolveRuntimeGitTarget(worktree)
  // ssh: 和 runtime: 的仓库不在这台机器上。先拒绝，避免用远端路径扫本机磁盘。
  requireLocalRuntimeGitRoute(target)
  return target
}

function discover(
  root: RuntimeGitTarget,
  options: { refresh?: boolean; membership?: boolean; signal?: AbortSignal }
): Promise<WorkspaceRepositoryList> {
  return discoverWorkspaceRepositories(root.worktree.path, {
    gitOptions: localGitOptionsForTarget(root),
    refresh: options.refresh === true,
    ...(options.membership
      ? { maxAgeMs: WORKSPACE_REPOSITORY_MEMBERSHIP_MAX_AGE_MS, acceptPartial: true }
      : {}),
    ...(options.signal ? { signal: options.signal } : {})
  })
}

// 根仓库用上游解析出的目标（含共享链接）。嵌套仓库是自己的检出，没有 Orca 仓库行，不继承根的共享链接。
function repositoryTarget(
  root: RuntimeGitTarget,
  entry: WorkspaceRepositoryRecord
): RuntimeGitTarget {
  if (entry.repositoryPath === '') {
    return root
  }
  return {
    worktree: { ...root.worktree, path: entry.realPath },
    executionHostId: root.executionHostId,
    ...(root.localGitOptions ? { localGitOptions: root.localGitOptions } : {})
  }
}

type OpenedRepository = {
  root: RuntimeGitTarget
  entry: WorkspaceRepositoryRecord
  discovery: WorkspaceRepositoryList
  target: RuntimeGitTarget
  status: RuntimeGitStatusCommands
  diff: RuntimeGitDiffCommands
}

async function openRepository(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string
): Promise<OpenedRepository> {
  const root = await workspaceTarget(caller.runtime, worktree)
  const signal = caller.signal
  let discovery = await discover(root, { membership: true, signal })
  let entry = await locateWorkspaceRepository(
    root.worktree.path,
    repositoryPath,
    discovery.repositories
  ).catch(() => null)
  if (!entry) {
    // 上一轮列表里没有，或者目录换过：按列表的 5 秒缓存再判一次（最多 5 秒重扫一次），仍不在就拒绝。
    discovery = await discover(root, { signal })
    entry = await locateWorkspaceRepository(
      root.worktree.path,
      repositoryPath,
      discovery.repositories
    )
  }
  const target = repositoryTarget(root, entry)
  // 上游的读取命令原样复用，只是目标换成这个仓库：路径校验、WSL 路由和传输上限都跟上游一致。
  const host: RuntimeGitCommandHost = {
    resolveRuntimeGitTarget: async () => target,
    getRuntimeSettings: () => ({})
  }
  return {
    root,
    entry,
    discovery,
    target,
    status: new RuntimeGitStatusCommands(host),
    diff: new RuntimeGitDiffCommands(host)
  }
}

async function openInitialized(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string
): Promise<OpenedRepository> {
  const opened = await openRepository(caller, worktree, repositoryPath)
  if (opened.entry.uninitialized) {
    throw new Error(REPOSITORY_UNINITIALIZED)
  }
  return opened
}

// 键里用工作区根的路径，和以前写进文件的覆盖保持一致。
function compareKey(opened: OpenedRepository, branch: string): CompareTargetKey {
  return {
    hostId: opened.root.worktree.hostId ?? opened.root.executionHostId,
    worktreePath: opened.root.worktree.path,
    repositoryPath: opened.entry.repositoryPath,
    branch
  }
}

async function baseCommitOid(
  repoPath: string,
  ref: string | null,
  gitOptions: GitRuntimeOptions
): Promise<string | null> {
  if (!ref) {
    return null
  }
  try {
    const oid = await resolveRefOid(repoPath, ref, { ...gitOptions, admissionTier: 'background' })
    return oid || null
  } catch {
    return null
  }
}

export async function listWorkspaceRepositories(
  caller: WorkspaceRpcCaller,
  worktree: string,
  refresh: boolean
): Promise<WorkspaceRepositoryList> {
  const root = await workspaceTarget(caller.runtime, worktree)
  return discover(root, { refresh, signal: caller.signal })
}

export async function readWorkspaceRepositoryStatus(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string,
  admissionTier: GitAdmissionTier | undefined,
  refresh: boolean
): Promise<WorkspaceRepositoryStatus> {
  const opened = await openRepository(caller, worktree, repositoryPath)
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
  const status = await opened.status.getRuntimeGitStatus(worktree, {
    admissionTier: admissionTier ?? 'status',
    includeLineStats: false,
    ...(caller.signal ? { signal: caller.signal } : {})
  })
  const branch = status.branch ?? null
  const repoPath = opened.target.worktree.path
  const gitOptions = localGitOptionsForTarget(opened.target)
  const compareTarget = await resolveWorkspaceCompareTarget({
    store: CompareTargetStore.fromUserData(),
    key: compareKey(opened, branch ?? ''),
    repoAbsolutePath: repoPath,
    gitOptions,
    head: status.head ?? null,
    refresh
  })
  // 比较目标解析只给出 ref 名。带上它现在的提交，基线被 fetch 推进时界面才知道要重比。
  const baseOid = await baseCommitOid(repoPath, compareTarget.ref, gitOptions)
  // 根仓库会把嵌套检出报成未跟踪目录。只去掉未跟踪条目；gitlink 指针仍算根仓库的改动。
  const entries =
    opened.entry.repositoryPath === ''
      ? omitNestedRepositoryEntries(
          status.entries,
          listedNestedRepositoryRoots(opened.discovery.repositories)
        )
      : status.entries
  return {
    repositoryPath: opened.entry.repositoryPath,
    uninitialized: false,
    branch,
    head: status.head ?? null,
    entries,
    ...(status.upstreamStatus ? { upstreamStatus: status.upstreamStatus } : {}),
    ...(status.didHitLimit ? { didHitLimit: true } : {}),
    ...(status.readError ? { readError: status.readError } : {}),
    compareTarget,
    baseOid
  }
}

export async function readWorkspaceRepositoryBranchCompare(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string,
  baseRef: string,
  admissionTier: GitAdmissionTier | undefined
): Promise<GitBranchCompareResult> {
  const opened = await openInitialized(caller, worktree, repositoryPath)
  return opened.diff.getRuntimeGitBranchCompare(worktree, baseRef, admissionTier ?? 'background')
}

export async function readWorkspaceRepositoryDiff(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string,
  file: { filePath: string; staged: boolean; compareAgainstHead?: boolean; oldPath?: string }
): Promise<GitDiffResult> {
  const opened = await openInitialized(caller, worktree, repositoryPath)
  return opened.diff.getRuntimeGitDiff(
    worktree,
    file.filePath,
    file.staged,
    file.compareAgainstHead,
    contentBudget(caller),
    file.oldPath
  )
}

export async function readWorkspaceRepositoryBranchDiff(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string,
  file: { filePath: string; oldPath?: string; compare: { mergeBase: string; headOid: string } }
): Promise<GitDiffResult> {
  const opened = await openInitialized(caller, worktree, repositoryPath)
  return opened.diff.getRuntimeGitBranchDiff(
    worktree,
    file.compare,
    file.filePath,
    file.oldPath,
    contentBudget(caller)
  )
}

export async function writeWorkspaceCompareTarget(
  caller: WorkspaceRpcCaller,
  worktree: string,
  repositoryPath: string,
  branch: string,
  ref: string | null
): Promise<{ repositoryPath: string; branch: string; ref: string | null }> {
  const opened = await openRepository(caller, worktree, repositoryPath)
  await CompareTargetStore.fromUserData().set(compareKey(opened, branch), ref)
  return { repositoryPath: opened.entry.repositoryPath, branch, ref }
}
