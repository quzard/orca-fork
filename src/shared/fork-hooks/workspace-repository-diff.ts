import type { RuntimeClientTarget } from '../runtime-client-target'

// 编辑器加载 diff 时的最小输入。未登记时调用方立刻拿到 null，不额外 await。
export type WorkspaceRepositoryDiffInput = {
  file: {
    worktreeId: string
    relativePath: string
    branchOldPath?: string
  }
  worktreePath: string
  connectionId: string | undefined
  target: RuntimeClientTarget
  effectiveDiffSource: string | undefined
  compareAgainstHead: boolean
  branchCompare: {
    baseRef: string
    baseOid?: string | null
    headOid?: string | null
    mergeBase?: string | null
  } | null
  // 发现结果说这不是嵌套仓库时，用上游读取。冷缓存不能先返回 null，否则会拿根仓库去 diff。
  readUpstream: () => Promise<unknown>
}

type WorkspaceRepositoryDiffReader = (
  input: WorkspaceRepositoryDiffInput
) => Promise<unknown> | null

let reader: WorkspaceRepositoryDiffReader | null = null

export function registerWorkspaceRepositoryDiff(next: WorkspaceRepositoryDiffReader): void {
  reader = next
}

export function resetWorkspaceRepositoryDiffForTests(): void {
  reader = null
}

export function forkWorkspaceRepositoryDiff(
  input: WorkspaceRepositoryDiffInput
): Promise<unknown> | null {
  return reader ? reader(input) : null
}
