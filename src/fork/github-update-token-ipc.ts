// fork: 设置页只交换「有没有令牌」。令牌本身留在主进程。

import { ipcMain } from 'electron'
import {
  FORK_GITHUB_UPDATE_TOKEN_SET_CHANNEL,
  FORK_GITHUB_UPDATE_TOKEN_STATUS_CHANNEL
} from '../shared/fork-hooks/update-feed'
import { githubUpdateTokenStatus, writeGithubUpdateToken } from './github-update-token'

const TOKEN_MUST_BE_STRING = 'GitHub token must be a string'
const TOKEN_FILE_NOT_RESTRICTED = 'Could not restrict the GitHub token file'

export function registerForkGithubUpdateTokenIpc(): void {
  ipcMain.handle(FORK_GITHUB_UPDATE_TOKEN_STATUS_CHANNEL, () => githubUpdateTokenStatus())
  ipcMain.handle(FORK_GITHUB_UPDATE_TOKEN_SET_CHANNEL, (_event, token: unknown) => {
    if (typeof token !== 'string') {
      throw new Error(TOKEN_MUST_BE_STRING)
    }
    // 失败信息里不带令牌内容。
    if (!writeGithubUpdateToken(token)) {
      throw new Error(TOKEN_FILE_NOT_RESTRICTED)
    }
    return githubUpdateTokenStatus()
  })
}
