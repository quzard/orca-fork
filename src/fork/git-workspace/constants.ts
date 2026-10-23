import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'

export { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY }

export const FORK_GIT_WORKSPACE_REPOSITORIES_METHOD = 'git.workspaceRepositories'
export const FORK_GIT_WORKSPACE_STATUS_METHOD = 'git.workspaceRepositories.status'
export const FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD = 'git.workspaceRepositories.branchCompare'
export const FORK_GIT_WORKSPACE_DIFF_METHOD = 'git.workspaceRepositories.diff'
export const FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD = 'git.workspaceRepositories.branchDiff'
export const FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD =
  'git.workspaceRepositories.setCompareTarget'

export const FORK_GIT_WORKSPACE_METHOD_NAMES = [
  FORK_GIT_WORKSPACE_REPOSITORIES_METHOD,
  FORK_GIT_WORKSPACE_STATUS_METHOD,
  FORK_GIT_WORKSPACE_BRANCH_COMPARE_METHOD,
  FORK_GIT_WORKSPACE_DIFF_METHOD,
  FORK_GIT_WORKSPACE_BRANCH_DIFF_METHOD,
  FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD
] as const

// 与上游 scanNestedRepos 的缺省深度、数量一致；超时用导入扫描的 15 秒。
export const WORKSPACE_REPOSITORY_MAX_DEPTH = 3
export const WORKSPACE_REPOSITORY_MAX_REPOS = 100
export const WORKSPACE_REPOSITORY_TIMEOUT_MS = 15_000
export const WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS = 5_000
export const WORKSPACE_REPOSITORY_POLL_CONCURRENCY = 4
export const WORKSPACE_REPOSITORY_POLL_INTERVAL_MS = 4_000
export const WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS = 2_000
export const WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS = 30_000

export const SOURCE_CONTROL_SCOPE_CURRENT = 'current'
export const SOURCE_CONTROL_SCOPE_WORKSPACE = 'workspace'
export const SOURCE_CONTROL_SCOPE_STORAGE_KEY = 'orca.fork.source-control-scope'
export const SOURCE_CONTROL_PANEL_TAB = 'source-control'
export const SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID = 'source-control-scope-current'
export const SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID = 'source-control-scope-workspace'
export const SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID = 'source-control-scope-update-host'

export const COMPARE_TARGET_DIRECTORY = 'fork'
export const COMPARE_TARGET_FILE_NAME = 'git-workspace-compare-targets.json'
export const COMPARE_TARGET_MAX_REF_LENGTH = 256

export const REPOSITORY_PATH_REJECTED = 'repository_path_rejected'
export const REPOSITORY_FILE_PATH_REJECTED = 'repository_file_path_rejected'
export const REPOSITORY_UNINITIALIZED = 'repository_uninitialized'
