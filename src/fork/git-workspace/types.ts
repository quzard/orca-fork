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
  compareTarget: CompareTargetResolution
}
