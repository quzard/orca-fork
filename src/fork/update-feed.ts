// fork: 桌面更新只读 quzard/orca-fork 的 GitHub Releases。令牌来自 0600 文件，不写日志。

import {
  FORK_GITHUB_UPDATE_OWNER,
  FORK_GITHUB_UPDATE_REPO,
  registerForkUpdateFeed,
  type ForkGithubUpdateFeed
} from '../shared/fork-hooks/update-feed'
import { readGithubUpdateToken } from './github-update-token'

export function forkGithubUpdateFeed(token: string | undefined): ForkGithubUpdateFeed | null {
  if (!token) {
    return null
  }
  return {
    provider: 'github',
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    private: true,
    token
  }
}

/** 桌面主进程登记。orcad 不调用。 */
export function registerForkGithubUpdateFeed(): void {
  registerForkUpdateFeed(() => forkGithubUpdateFeed(readGithubUpdateToken()))
}
