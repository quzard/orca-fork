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

export const FORK_GIT_WORKSPACE_METHODS = [
  defineMethod({
    name: FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoriesParams,
    handler: (params, { signal }) =>
      listWorkspaceRepositories(params.worktree, params.refresh === true, signal)
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_STATUS_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryStatusParams,
    handler: (params, { signal }) =>
      readWorkspaceRepositoryStatus(
        params.worktree,
        params.repositoryPath,
        params.admissionTier,
        signal
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryBranchCompareParams,
    handler: (params, { signal }) =>
      readWorkspaceRepositoryBranchCompare(
        params.worktree,
        params.repositoryPath,
        params.baseRef,
        params.admissionTier,
        signal
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_DIFF_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryDiffParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryDiff(
        params.worktree,
        params.repositoryPath,
        params.filePath,
        params.staged,
        params.compareAgainstHead,
        ctx
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
    permission: 'workspace',
    params: GitWorkspaceRepositoryBranchDiffParams,
    handler: (params, ctx) =>
      readWorkspaceRepositoryBranchDiff(
        params.worktree,
        params.repositoryPath,
        params.filePath,
        params.oldPath,
        params.compare,
        ctx
      )
  }),
  defineMethod({
    name: FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD,
    permission: 'workspace',
    params: GitWorkspaceSetCompareTargetParams,
    handler: (params) =>
      writeWorkspaceCompareTarget(params.worktree, params.repositoryPath, params.branch, params.ref)
  })
]
