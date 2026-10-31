import type { DiffSource } from '../editor-tab-view-types'
import type { GitDiffResult } from '../git-diff-compare-types'
import type { RuntimeClientTarget } from '../runtime-client-target'

// 编辑器加载 diff 时的输入，字段名就是 useEditorPanelDiffContentLoader 里的局部变量。
export type WorkspaceRepositoryDiffInput = {
  file: {
    worktreeId: string
    relativePath: string
    branchOldPath?: string
    branchCompare?: {
      baseRef: string
      baseOid?: string | null
      headOid?: string | null
      mergeBase?: string | null
    }
  }
  fileTarget: RuntimeClientTarget
  connectionId: string | undefined
  effectiveDiffSource: DiffSource | undefined
  compareAgainstHead: boolean
}

// 返回 null 时调用方同步走上游读取。冷缓存要先发现再决定，所以把上游读取交进来，不能先返回 null。
type WorkspaceRepositoryDiffReader = (
  input: WorkspaceRepositoryDiffInput,
  readUpstream: () => Promise<GitDiffResult>
) => Promise<GitDiffResult> | null

let reader: WorkspaceRepositoryDiffReader | null = null

export function registerWorkspaceRepositoryDiff(next: WorkspaceRepositoryDiffReader): void {
  reader = next
}

export function resetWorkspaceRepositoryDiffForTests(): void {
  reader = null
}

// 未登记时立刻返回 null，不额外 await。
export function forkWorkspaceRepositoryDiff(
  input: WorkspaceRepositoryDiffInput,
  readUpstream: () => Promise<GitDiffResult>
): Promise<GitDiffResult> | null {
  return reader ? reader(input, readUpstream) : null
}
