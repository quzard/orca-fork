// fork: GitHub 更新令牌。明文放在 ~/.orca/github-update-token，模式 0600。
// 不进钥匙串，也不走 safeStorage（macOS 上 safeStorage 会打开钥匙串）。
// 写盘复用 writeSecureFile，和 orcad 凭证密钥离开钥匙串后的做法一致。

import { readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { writeSecureFile } from '../shared/secure-file'

export const GITHUB_UPDATE_TOKEN_DIR = '.orca'
export const GITHUB_UPDATE_TOKEN_FILE_NAME = 'github-update-token'

export function githubUpdateTokenPath(home: string = homedir()): string {
  return join(home, GITHUB_UPDATE_TOKEN_DIR, GITHUB_UPDATE_TOKEN_FILE_NAME)
}

/** 文件不存在或为空时返回 undefined。读失败也返回 undefined，不把路径错误打进日志。 */
export function readGithubUpdateToken(home: string = homedir()): string | undefined {
  const path = githubUpdateTokenPath(home)
  try {
    const token = readFileSync(path, 'utf8').trim()
    return token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}

export function githubUpdateTokenStatus(home: string = homedir()): { configured: boolean } {
  return { configured: readGithubUpdateToken(home) !== undefined }
}

/**
 * 空字符串删除文件。写入成功且权限收紧后返回 true。
 * 权限收不紧时删掉刚写的文件并返回 false，避免令牌留在更宽的模式上。
 */
export function writeGithubUpdateToken(token: string, home: string = homedir()): boolean {
  const path = githubUpdateTokenPath(home)
  const trimmed = token.trim()
  if (!trimmed) {
    rmSync(path, { force: true })
    return true
  }
  const restricted = writeSecureFile(path, trimmed, { durable: true })
  if (!restricted) {
    rmSync(path, { force: true })
    return false
  }
  return true
}
