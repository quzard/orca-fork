import { afterEach, describe, expect, it } from 'vitest'
import {
  FORK_GITHUB_UPDATE_OWNER,
  FORK_GITHUB_UPDATE_REPO,
  forkReleaseFeedDecision,
  forkUpdateFeedRegistered,
  registerForkUpdateFeed,
  resolveForkUpdateFeed
} from './update-feed'

describe('fork update feed hook', () => {
  afterEach(() => {
    registerForkUpdateFeed(null)
  })

  it('stays on the upstream feed until a fork registers', () => {
    expect(forkUpdateFeedRegistered()).toBe(false)
    expect(forkReleaseFeedDecision()).toEqual({ kind: 'upstream' })
    expect(resolveForkUpdateFeed()).toBeNull()
  })

  it('skips the check when the fork is registered without a token', () => {
    registerForkUpdateFeed(() => null)
    expect(forkUpdateFeedRegistered()).toBe(true)
    expect(forkReleaseFeedDecision()).toEqual({ kind: 'skip' })
  })

  it('returns only the private quzard feed when a token is present', () => {
    registerForkUpdateFeed(() => ({
      provider: 'github',
      owner: FORK_GITHUB_UPDATE_OWNER,
      repo: FORK_GITHUB_UPDATE_REPO,
      private: true,
      token: 'stub-token'
    }))
    expect(resolveForkUpdateFeed()).toEqual({
      provider: 'github',
      owner: 'quzard',
      repo: 'orca',
      private: true,
      token: 'stub-token'
    })
    expect(forkReleaseFeedDecision().kind).toBe('ready')
  })
})
