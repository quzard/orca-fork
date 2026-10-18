import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  forkReleaseFeedDecision,
  registerForkUpdateFeed,
  resolveForkUpdateFeed
} from '../shared/fork-hooks/update-feed'
import {
  githubUpdateTokenPath,
  githubUpdateTokenStatus,
  readGithubUpdateToken,
  writeGithubUpdateToken
} from './github-update-token'
import { forkGithubUpdateFeed, registerForkGithubUpdateFeed } from './update-feed'

const homes: string[] = []

describe('github update token file', () => {
  afterEach(() => {
    registerForkUpdateFeed(null)
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('writes a 0600 file under ~/.orca and never reports the token', () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-gh-token-'))
    homes.push(home)
    expect(readGithubUpdateToken(home)).toBeUndefined()
    expect(githubUpdateTokenStatus(home)).toEqual({ configured: false })

    expect(writeGithubUpdateToken('  github_pat_test  ', home)).toBe(true)
    const path = githubUpdateTokenPath(home)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(statSync(join(home, '.orca')).mode & 0o777).toBe(0o700)
    expect(readGithubUpdateToken(home)).toBe('github_pat_test')
    expect(Object.keys(githubUpdateTokenStatus(home))).toEqual(['configured'])
    expect(githubUpdateTokenStatus(home).configured).toBe(true)

    expect(writeGithubUpdateToken('   ', home)).toBe(true)
    expect(readGithubUpdateToken(home)).toBeUndefined()
    expect(githubUpdateTokenStatus(home)).toEqual({ configured: false })
  })

  it('reads the public repo anonymously without a token file and uses the token when present', () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-gh-token-'))
    homes.push(home)
    const previous = process.env.HOME
    process.env.HOME = home
    const anonymous = {
      provider: 'github',
      owner: 'quzard',
      repo: 'orca-fork',
      private: false
    }
    try {
      expect(forkGithubUpdateFeed(undefined)).toEqual(anonymous)
      expect('token' in forkGithubUpdateFeed(undefined)).toBe(false)
      expect(forkGithubUpdateFeed('')).toEqual(anonymous)
      registerForkGithubUpdateFeed()
      expect(resolveForkUpdateFeed()).toEqual(anonymous)
      expect(forkReleaseFeedDecision()).toEqual({ kind: 'ready', feed: anonymous })

      writeGithubUpdateToken('github_pat_test', home)
      const feed = resolveForkUpdateFeed()
      expect(feed).toEqual({
        provider: 'github',
        owner: 'quzard',
        repo: 'orca-fork',
        private: true,
        token: 'github_pat_test'
      })
      expect(forkReleaseFeedDecision().kind).toBe('ready')

      // 清掉令牌后下一次检查回到匿名，不留旧令牌。
      writeGithubUpdateToken('', home)
      expect(resolveForkUpdateFeed()).toEqual(anonymous)
      expect(JSON.stringify(resolveForkUpdateFeed())).not.toContain('github_pat_test')
    } finally {
      if (previous === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = previous
      }
    }
  })
})
