import type { ReactNode } from 'react'

// 未登记时原样返回上游面板：不包一层、不读存储、不发请求。
type SourceControlScopeRenderer = (upstream: ReactNode) => ReactNode

let renderer: SourceControlScopeRenderer | null = null

export function registerSourceControlScope(next: SourceControlScopeRenderer): void {
  renderer = next
}

export function resetSourceControlScopeForTests(): void {
  renderer = null
}

export function renderSourceControlScope(upstream: ReactNode): ReactNode {
  return renderer ? renderer(upstream) : upstream
}
