import type { ReactNode } from 'react'
import type { RuntimeClientTarget } from '../runtime-client-target'

// 未登记时原样返回上游面板：不包一层、不读存储、不发请求。
export type SourceControlScopeModel = {
  activeWorktree?: { id: string } | null
  worktreePath?: string | null
  rightSidebarTab?: string
  activeRepoTarget?: RuntimeClientTarget | null
}

type SourceControlScopeRenderer = (upstream: ReactNode, model: SourceControlScopeModel) => ReactNode

let renderer: SourceControlScopeRenderer | null = null

export function registerSourceControlScope(next: SourceControlScopeRenderer): void {
  renderer = next
}

export function resetSourceControlScopeForTests(): void {
  renderer = null
}

export function renderSourceControlScope(
  upstream: ReactNode,
  model: SourceControlScopeModel
): ReactNode {
  return renderer ? renderer(upstream, model) : upstream
}
