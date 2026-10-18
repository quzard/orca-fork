// fork: 桌面更新只读 quzard/orca-fork 的 GitHub Releases。仓库公开，令牌可选。
// 有 0600 令牌文件时走私有 provider（API 限额更高）；没有就匿名读公开 provider。令牌不写日志。

import {
  FORK_GITHUB_UPDATE_OWNER,
  FORK_GITHUB_UPDATE_REPO,
  registerForkUpdateFeed,
  type ForkGithubUpdateFeed
} from '../shared/fork-hooks/update-feed'
import { readGithubUpdateToken } from './github-update-token'

export function forkGithubUpdateFeed(token: string | undefined): ForkGithubUpdateFeed {
  if (token) {
    return {
      provider: 'github',
      owner: FORK_GITHUB_UPDATE_OWNER,
      repo: FORK_GITHUB_UPDATE_REPO,
      private: true,
      token
    }
  }
  // 没有 token 字段且 private 为 false：electron-updater 用公开 provider，也不会去读 GH_TOKEN / GITHUB_TOKEN。
  return {
    provider: 'github',
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    private: false
  }
}

/** 桌面主进程登记。orcad 不调用。每次检查都重新读令牌文件，删掉文件后下一次检查就改成匿名。 */
export function registerForkGithubUpdateFeed(): void {
  registerForkUpdateFeed(() => forkGithubUpdateFeed(readGithubUpdateToken()))
}
