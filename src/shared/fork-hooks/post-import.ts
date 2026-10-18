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

export function registerPostImportHook(next: PostImportHook | undefined): void {
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

type ProjectAddFinish<S extends string> = (
  repoId: string,
  source: S,
  executionHostId?: ExecutionHostId
) => Promise<void>

const handoffWrappers = new WeakMap<object, unknown>()

/**
 * Runs the `handoff` callback after `finish`, also when `finish` throws (its error still
 * propagates). Unregistered, `finish` runs alone and nothing extra is awaited.
 */
export function withForkPostImportHandoff<S extends string>(
  finish: ProjectAddFinish<S>
): ProjectAddFinish<S> {
  // One wrapper per callback, so a memoized callback keeps its identity.
  const cached = handoffWrappers.get(finish) as ProjectAddFinish<S> | undefined
  if (cached) {
    return cached
  }
  const wrapped: ProjectAddFinish<S> = async (repoId, source, executionHostId) => {
    if (!postImportHook) {
      return finish(repoId, source, executionHostId)
    }
    try {
      await finish(repoId, source, executionHostId)
    } finally {
      await runForkPostImport({ phase: 'handoff', repoId, source, executionHostId })
    }
  }
  handoffWrappers.set(finish, wrapped)
  return wrapped
}
