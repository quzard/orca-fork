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

// 参数 schema 在 src/fork，生成的 catalog 把这些方法列为未编目，类型对齐检查要跳过它们。
export type ForkGitWorkspaceMethodName = (typeof FORK_GIT_WORKSPACE_METHOD_NAMES)[number]

// 发现只看工作区根的直接子目录。数量上限和超时仍用来截断这一层。
export const WORKSPACE_REPOSITORY_MAX_REPOS = 100
export const WORKSPACE_REPOSITORY_TIMEOUT_MS = 15_000
// 远端调用的超时要比扫描本身长，扫描超时才能带着 timedOut 回来。
export const WORKSPACE_REPOSITORY_LIST_RPC_TIMEOUT_MS = WORKSPACE_REPOSITORY_TIMEOUT_MS + 5_000
export const WORKSPACE_REPOSITORY_RPC_TIMEOUT_MS = 15_000
export const WORKSPACE_REPOSITORY_DISCOVERY_CACHE_MS = 5_000
// 能力没有或发现失败后，短时间内不再为这个工作区探测。
export const WORKSPACE_REPOSITORY_DISCOVERY_SKIP_MS = 15_000
// diff 标签按这份记录分流。面板没开时它会变旧，过了这个时间先重新发现。
export const WORKSPACE_REPOSITORY_DISCOVERY_STALE_MS = 60_000
export const WORKSPACE_REPOSITORY_POLL_CONCURRENCY = 4
export const WORKSPACE_REPOSITORY_POLL_INTERVAL_MS = 4_000
// 一轮跑得慢就多等几倍再跑下一轮，和上游状态轮询一样按耗时退避。
export const WORKSPACE_REPOSITORY_POLL_IDLE_MULTIPLIER = 3
// HEAD 不变时比较目标的提交仍可能被 fetch 推进。满一分钟再比一次。
export const WORKSPACE_REPOSITORY_BRANCH_COMPARE_INTERVAL_MS = 60_000
export const WORKSPACE_REPOSITORY_POLL_BACKOFF_START_MS = 2_000
export const WORKSPACE_REPOSITORY_POLL_BACKOFF_MAX_MS = 30_000

export const SOURCE_CONTROL_SCOPE_CURRENT = 'current'
export const SOURCE_CONTROL_SCOPE_WORKSPACE = 'workspace'
export const SOURCE_CONTROL_SCOPE_STORAGE_KEY = 'orca.fork.source-control-scope'
export const SOURCE_CONTROL_PANEL_TAB = 'source-control'
export const SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID = 'source-control-scope-current'
export const SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID = 'source-control-scope-workspace'
export const SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID = 'source-control-scope-update-host'
export const SOURCE_CONTROL_ONLY_CHANGED_STORAGE_KEY = 'orca.fork.source-control-only-changed'
export const SOURCE_CONTROL_ONLY_CHANGED_TEST_ID = 'source-control-only-changed'
export const SOURCE_CONTROL_REPO_TEST_ID = 'source-control-repo'
export const SOURCE_CONTROL_REPO_OTHER_TEST_ID = 'source-control-repo-other'
export const SOURCE_CONTROL_REPO_CHANGE_COUNT_TEST_ID = 'source-control-repo-change-count'
export const SOURCE_CONTROL_REPO_AHEAD_TEST_ID = 'source-control-repo-ahead'

export const COMPARE_TARGET_DIRECTORY = 'fork'
export const COMPARE_TARGET_FILE_NAME = 'git-workspace-compare-targets.json'
export const COMPARE_TARGET_MAX_REF_LENGTH = 256

export const REPOSITORY_PATH_REJECTED = 'repository_path_rejected'
export const REPOSITORY_UNINITIALIZED = 'repository_uninitialized'
