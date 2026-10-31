import type { GitStatusEntry, GitUpstreamStatus } from '../../shared/git-status-types'

export type WorkspaceRepositoryKind = 'root' | 'nested' | 'submodule'

export type WorkspaceRepositoryRecord = {
  repositoryPath: string
  kind: WorkspaceRepositoryKind
  uninitialized: boolean
  depth: number
  realPath: string
}

export type WorkspaceRepositoryList = {
  repositories: WorkspaceRepositoryRecord[]
  truncated: boolean
  timedOut: boolean
}

export type CompareTargetSource = 'override' | 'default' | 'unset'

export type CompareTargetResolution = {
  ref: string | null
  source: CompareTargetSource
}

export type WorkspaceRepositoryStatus = {
  repositoryPath: string
  uninitialized: boolean
  branch: string | null
  head: string | null
  entries: GitStatusEntry[]
  upstreamStatus?: GitUpstreamStatus
  didHitLimit?: boolean
  // git status 读失败时的错误。这时 entries 为空不代表没改动。
  readError?: string
  compareTarget: CompareTargetResolution
  // 比较目标 ref 的当前提交。HEAD 不变时它前进了就要重做分支比较。
  baseOid?: string | null
}
