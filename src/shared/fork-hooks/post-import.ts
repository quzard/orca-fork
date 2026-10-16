// fork: 添加仓库之后的回调。没有登记时立即返回，不增加 await。

import type { ExecutionHostId } from '../execution-host'

export type ForkPostImportPhase = 'registered' | 'handoff'

export type ForkImportedProject = {
  path: string
  worktreePath?: string
  projectId?: string
  status?: string
}

export type ForkPostImportDetails = {
  phase: ForkPostImportPhase
  repoId: string
  source?: string
  executionHostId?: ExecutionHostId
  path?: string
  worktreePath?: string
  projectPaths?: readonly string[]
  /** Set when the scanned parent is not itself a git repo. */
  includeParentFolder?: boolean
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
  /** Import rows for the selected directories. Omitted by older callers. */
  importedProjects?: readonly ForkImportedProject[]
}

export type ForkPostImportContext = Omit<ForkPostImportDetails, 'phase' | 'repoId'>

type PostImportHook = (details: ForkPostImportDetails) => void | Promise<void>

let postImportHook: PostImportHook | undefined
let pendingContext: ForkPostImportContext | undefined

export function registerPostImportHook(next: PostImportHook): void {
  postImportHook = next
}

export function noteForkPostImportContext(context: ForkPostImportContext): void {
  if (!postImportHook) {
    return
  }
  pendingContext = context
}

export function runForkPostImport(details: ForkPostImportDetails): Promise<void> | void {
  const context = pendingContext
  pendingContext = undefined
  if (!postImportHook) {
    return
  }
  return Promise.resolve(postImportHook({ ...context, ...details }))
}
