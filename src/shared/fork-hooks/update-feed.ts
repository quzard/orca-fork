// fork: 未登记时，发布更新仍走上游的公开地址。

export const FORK_GITHUB_UPDATE_OWNER = 'quzard'
export const FORK_GITHUB_UPDATE_REPO = 'orca-fork'

/** 没有令牌时，菜单检查和设置页都显示这一句，不访问上游。 */
export const FORK_GITHUB_UPDATE_TOKEN_HINT =
  'Save a fine-grained GitHub token with read-only Contents access to quzard/orca-fork. Without a token, this build does not check for updates.'

export const FORK_GITHUB_UPDATE_TOKEN_SAVED =
  'A token is saved on this computer. Update checks use quzard/orca-fork releases only.'

export const FORK_GITHUB_UPDATE_TOKEN_STATUS_CHANNEL = 'fork:github-update-token:status'
export const FORK_GITHUB_UPDATE_TOKEN_SET_CHANNEL = 'fork:github-update-token:set'

export const FORK_GITHUB_TOKEN_FIELD_TITLE = 'GitHub token'

/** 版本列表、指定版本和发行说明都用这一句，不请求上游仓库。 */
export const FORK_UPSTREAM_RELEASE_BLOCKED =
  'Fork builds do not list or download upstream releases.'

export type ForkGithubUpdateFeed = {
  provider: 'github'
  owner: string
  repo: string
  private: true
  token: string
}

export type ForkReleaseFeedDecision =
  | { kind: 'upstream' }
  | { kind: 'skip' }
  | { kind: 'ready'; feed: ForkGithubUpdateFeed }

let resolver: (() => ForkGithubUpdateFeed | null) | null = null
let upstreamReadsBlocked = false

export function registerForkUpdateFeed(next: (() => ForkGithubUpdateFeed | null) | null): void {
  resolver = next
}

export function forkUpdateFeedRegistered(): boolean {
  return resolver !== null
}

/** 主进程和渲染进程都登记。有私有源时同样视为挡住上游读取。 */
export function registerForkUpstreamReleaseReadsBlocked(blocked = true): void {
  upstreamReadsBlocked = blocked
}

export function forkUpstreamReleaseReadsBlocked(): boolean {
  return upstreamReadsBlocked || resolver !== null
}

/** 已登记的私有发布源。没有令牌时返回 null，调用方不得改去打上游。 */
export function resolveForkUpdateFeed(): ForkGithubUpdateFeed | null {
  return resolver ? resolver() : null
}

/**
 * upstream：未登记，继续公开源。
 * skip：已登记但没有令牌，不 setFeedURL，也不 checkForUpdates。
 * ready：只把这个对象交给 setFeedURL，日志里不要打印 token。
 */
export function forkReleaseFeedDecision(): ForkReleaseFeedDecision {
  if (!resolver) {
    return { kind: 'upstream' }
  }
  const feed = resolver()
  if (!feed?.token) {
    return { kind: 'skip' }
  }
  return { kind: 'ready', feed }
}
