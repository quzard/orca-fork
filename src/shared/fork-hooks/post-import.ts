// fork: 添加仓库之后的回调。没有登记时立即返回，不增加 await。

import { getRepoExecutionHostId, type ExecutionHostId } from '../execution-host'
import type { Repo } from '../repo-types'

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

/** addRepo registered `repo` at `path`. Unregistered, returns nothing so the caller adds no await. */
export function runForkRepoRegistered(
  repo: Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>,
  path: string
): Promise<void> | void {
  return runForkPostImport({
    phase: 'registered',
    repoId: repo.id,
    path,
    executionHostId: getRepoExecutionHostId(repo)
  })
}

/** 上游导入完成后带回的项目组。包装层不解释它，只原样往下传。 */
export type ForkProjectAddOutcome = { importedProjectGroupId?: string }

type ProjectAddFinish<S extends string> = (
  repoId: string,
  source: S,
  executionHostId?: ExecutionHostId,
  // 上游把导入得到的项目组 id 放在第 4 个参数，包装时必须原样传下去。
  outcome?: ForkProjectAddOutcome
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
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the only value stored under `finish` is the wrapper built below from that same `finish`.
  const cached = handoffWrappers.get(finish) as ProjectAddFinish<S> | undefined
  if (cached) {
    return cached
  }
  const wrapped: ProjectAddFinish<S> = async (repoId, source, executionHostId, outcome) => {
    if (!postImportHook) {
      return finish(repoId, source, executionHostId, outcome)
    }
    try {
      await finish(repoId, source, executionHostId, outcome)
    } finally {
      await runForkPostImport({ phase: 'handoff', repoId, source, executionHostId })
    }
  }
  handoffWrappers.set(finish, wrapped)
  return wrapped
}
