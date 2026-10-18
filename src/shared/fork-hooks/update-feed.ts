// fork: fork 构建只从 quzard/orca-fork 的公开 Releases 匿名更新。
// 登记后不读上游发布、更新日志、nudge 或 agent 状态规则；未登记时上游行为不变。

export const FORK_GITHUB_UPDATE_OWNER = 'quzard'
export const FORK_GITHUB_UPDATE_REPO = 'orca-fork'

/** 版本列表、指定版本和发行说明都用这一句，不请求上游仓库。 */
export const FORK_UPSTREAM_RELEASE_BLOCKED =
  'Fork builds do not list or download upstream releases.'

/** 只有公开 provider。没有 token 字段，electron-updater 不读 GH_TOKEN / GITHUB_TOKEN，也不带 Authorization。 */
export type ForkGithubUpdateFeed = {
  provider: 'github'
  owner: typeof FORK_GITHUB_UPDATE_OWNER
  repo: typeof FORK_GITHUB_UPDATE_REPO
  private: false
}

export type ForkReleaseFeedDecision =
  | { kind: 'upstream' }
  | { kind: 'skip' }
  | { kind: 'ready'; feed: ForkGithubUpdateFeed }

let forkBuild = false
let feedRegistered = false

/** 主进程、渲染进程和 orcad 都登记。登记后所有上游发布读取都停掉，与有没有发布源无关。 */
export function registerForkBuild(enabled = true): void {
  forkBuild = enabled
}

export function isForkBuild(): boolean {
  return forkBuild || feedRegistered
}

/** 只在桌面主进程登记。orcad 不检查更新。 */
export function registerForkUpdateFeed(enabled = true): void {
  feedRegistered = enabled
}

export function forkUpdateFeedRegistered(): boolean {
  return feedRegistered
}

/** 每次返回新对象，调用方改了也不影响下一次。 */
export function forkGithubUpdateFeed(): ForkGithubUpdateFeed {
  return {
    provider: 'github',
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    private: false
  }
}

/**
 * upstream：不是 fork 构建，走上游公开源。
 * skip：fork 构建但这个进程没登记更新源，不 setFeedURL，也不 checkForUpdates。
 * ready：只把这个匿名公开源交给 setFeedURL。
 */
export function forkReleaseFeedDecision(): ForkReleaseFeedDecision {
  if (feedRegistered) {
    return { kind: 'ready', feed: forkGithubUpdateFeed() }
  }
  return forkBuild ? { kind: 'skip' } : { kind: 'upstream' }
}
