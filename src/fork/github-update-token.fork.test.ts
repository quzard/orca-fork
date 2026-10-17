import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerForkUpdateFeed, resolveForkUpdateFeed } from '../shared/fork-hooks/update-feed'
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

  it('builds a private feed only when the token file has a value', () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-gh-token-'))
    homes.push(home)
    const previous = process.env.HOME
    process.env.HOME = home
    try {
      expect(forkGithubUpdateFeed(undefined)).toBeNull()
      expect(forkGithubUpdateFeed('github_pat_test')?.token).toBe('github_pat_test')
      registerForkGithubUpdateFeed()
      expect(resolveForkUpdateFeed()).toBeNull()
      writeGithubUpdateToken('github_pat_test', home)
      const feed = resolveForkUpdateFeed()
      expect(feed?.owner).toBe('quzard')
      expect(feed?.repo).toBe('orca')
      expect(feed?.private).toBe(true)
      expect(feed?.token).toBe('github_pat_test')
    } finally {
      if (previous === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = previous
      }
    }
  })
})
