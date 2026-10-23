import type { RuntimeGitTarget } from '../../../main/runtime/runtime-git-command-target'

export type ForkGitTargetResolver = (selector: string) => Promise<RuntimeGitTarget>

let resolver: ForkGitTargetResolver | null = null

// 运行时构造之后绑定。方法不挂到 OrcaRuntime 上，orca-runtime.ts 已经顶着行数上限。
export function bindForkGitTargetResolver(next: ForkGitTargetResolver): void {
  resolver = next
}

export function resetForkGitTargetResolverForTests(): void {
  resolver = null
}

export function forkGitTargetResolver(): ForkGitTargetResolver {
  if (!resolver) {
    throw new Error('fork_git_target_resolver_unbound')
  }
  return resolver
}
