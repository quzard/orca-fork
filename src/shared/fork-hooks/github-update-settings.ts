// fork: 更新设置里的令牌输入。未登记时这一行不渲染。
import type { ReactNode } from 'react'

let render: (() => ReactNode) | undefined

export function registerForkGithubUpdateSettings(next: (() => ReactNode) | undefined): void {
  render = next
}

export function renderForkGithubUpdateSettings(): ReactNode {
  return render?.() ?? null
}
