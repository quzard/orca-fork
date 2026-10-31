import { defineMethod } from '../../../main/runtime/rpc/core'
import {
  GitWorkspaceRepositoriesParams,
  GitWorkspaceRepositoryBranchCompareParams,
  GitWorkspaceRepositoryBranchDiffParams,
  GitWorkspaceRepositoryDiffParams,
  GitWorkspaceRepositoryStatusParams,
  GitWorkspaceSetCompareTargetParams
} from '../../git-workspace/params'
import {
  FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD,
  FORK_GIT_WORKSPACE_STATUS_METHOD
} from '../../git-workspace/constants'
import {
  listWorkspaceRepositories,
  readWorkspaceRepositoryBranchCompare,
  readWorkspaceRepositoryBranchDiff,
  readWorkspaceRepositoryDiff,
  readWorkspaceRepositoryStatus,
  writeWorkspaceCompareTarget
} from './reads'

// 桌面本机、orcad 和 orca serve 共用这一份方法表（rpc/methods/index.ts 摊进 ALL_RPC_METHODS）。
export const FORK_GIT_WORKSPACE_METHODS = [
  defineMethod({
    name: FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoriesParams,
    handler: (params, ctx) =>
      listWorkspaceRepositories(ctx, params.worktree, params.refresh === true)
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_STATUS_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryStatusParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryStatus(
        ctx,
        params.worktree,
        params.repositoryPath,
        params.admissionTier,
        params.refresh === true
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryBranchCompareParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryBranchCompare(
        ctx,
        params.worktree,
        params.repositoryPath,
        params.baseRef,
        params.admissionTier
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_DIFF_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryDiffParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryDiff(ctx, params.worktree, params.repositoryPath, params)
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryBranchDiffParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryBranchDiff(ctx, params.worktree, params.repositoryPath, params)
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD,
    permission: 'workspace',
    params: GitWorkspaceSetCompareTargetParams,
    handler: (params, ctx) =>
      writeWorkspaceCompareTarget(
        ctx,
        params.worktree,
        params.repositoryPath,
        params.branch,
        params.ref
      )
  })
]
