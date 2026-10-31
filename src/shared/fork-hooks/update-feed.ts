// fork: fork 构建只从 quzard/orca-fork 的公开 Releases 匿名更新。
// 登记后不读上游发布、更新日志、nudge、agent 状态规则或 WSL 主机策略；未登记时上游行为不变。
// 主进程、渲染进程和 orcad 都登记；只有桌面主进程运行更新器。

export const FORK_GITHUB_UPDATE_OWNER = 'quzard'
export const FORK_GITHUB_UPDATE_REPO = 'orca-fork'

/** 版本列表和指定版本都用这一句，不请求上游仓库。 */
export const FORK_UPSTREAM_RELEASE_BLOCKED =
  'Fork builds do not list or download upstream releases.'

/** 只有公开 provider。没有 token 字段，electron-updater 不读 GH_TOKEN / GITHUB_TOKEN，也不带 Authorization。 */
export type ForkGithubUpdateFeed = {
  provider: 'github'
  owner: typeof FORK_GITHUB_UPDATE_OWNER
  repo: typeof FORK_GITHUB_UPDATE_REPO
  private: false
}

let forkBuild = false

export function registerForkBuild(enabled = true): void {
  forkBuild = enabled
}

export function isForkBuild(): boolean {
  return forkBuild
}

/** 交给 setFeedURL 的匿名公开源；不是 fork 构建时为 null。每次返回新对象，调用方改了也不影响下一次。 */
export function forkUpdateFeed(): ForkGithubUpdateFeed | null {
  if (!forkBuild) {
    return null
  }
  return {
    provider: 'github',
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    private: false
  }
}

/** 发行说明页在 quzard/orca-fork 上；`version` 已去掉 tag 前缀。 */
export function forkReleaseNotesUrl(version: string | null): string {
  const releases = `https://github.com/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}/releases`
  return version ? `${releases}/tag/v${version}` : releases
}
