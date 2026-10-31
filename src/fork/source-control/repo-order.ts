import type { GitBranchCompareResult } from '../../shared/git-diff-compare-types'
import type { WorkspaceRepositoryRecord, WorkspaceRepositoryStatus } from '../git-workspace/types'

// 有未提交文件，或比较目标上领先，才算有改动。只落后不算，标题栏仍会显示落后。
// 状态读失败的也算：空列表证明不了干净，让它排前面、展开显示错误，只看有改动时也留着。
export function repositoryHasChanges(
  status: WorkspaceRepositoryStatus | undefined,
  compare: GitBranchCompareResult | undefined
): boolean {
  if (!status || status.uninitialized) {
    return false
  }
  if (status.entries.length > 0 || status.readError) {
    return true
  }
  const summary = compare?.summary
  return summary?.status === 'ready' && (summary.commitsAhead ?? 0) > 0
}

// 比较已经结束、但给不出领先数的终态。还在 loading 或结果没到时不算。
const COMPARE_FINISHED_WITHOUT_AHEAD = new Set<GitBranchCompareResult['summary']['status']>([
  'invalid-base',
  'unborn-head',
  'no-merge-base',
  'error'
])

// 状态还没到，或比较还在算时不算「确定没改动」，过滤开关先留着它。
// 比较已经失败或没有基线，且没有未提交文件，就当作没改动。
export function repositoryKnownUnchanged(
  status: WorkspaceRepositoryStatus | undefined,
  compare: GitBranchCompareResult | undefined
): boolean {
  if (!status || status.uninitialized || repositoryHasChanges(status, compare)) {
    return false
  }
  if (!status.compareTarget.ref) {
    return true
  }
  const summary = compare?.summary
  if (!summary || summary.status === 'loading') {
    return false
  }
  if (summary.status === 'ready') {
    return (summary.commitsAhead ?? 0) === 0
  }
  return COMPARE_FINISHED_WITHOUT_AHEAD.has(summary.status)
}

function byPath(left: WorkspaceRepositoryRecord, right: WorkspaceRepositoryRecord): number {
  return left.repositoryPath.localeCompare(right.repositoryPath)
}

// 根仓库固定在最前：它是当前打开的工作区，收起时只有一行，兄弟仓库重排时它不跳。
// 其余先按有没有改动分成两段，段内按路径。顺序只跟「哪些路径有改动」有关，改动条数变化不重排。
export function orderWorkspaceRepositories(
  repositories: readonly WorkspaceRepositoryRecord[],
  statuses: Readonly<Record<string, WorkspaceRepositoryStatus>>,
  compares: Readonly<Record<string, GitBranchCompareResult>>
): WorkspaceRepositoryRecord[] {
  const root = repositories.find(
    (repository) => repository.repositoryPath === '' && !repository.uninitialized
  )
  const siblings = repositories.filter(
    (repository) => repository.repositoryPath !== '' && !repository.uninitialized
  )
  const changed = siblings
    .filter((repository) =>
      repositoryHasChanges(statuses[repository.repositoryPath], compares[repository.repositoryPath])
    )
    .sort(byPath)
  const rest = siblings
    .filter(
      (repository) =>
        !repositoryHasChanges(
          statuses[repository.repositoryPath],
          compares[repository.repositoryPath]
        )
    )
    .sort(byPath)
  return root ? [root, ...changed, ...rest] : [...changed, ...rest]
}
