import { afterEach, describe, expect, it } from 'vitest'
import {
  FORK_GITHUB_UPDATE_OWNER,
  FORK_GITHUB_UPDATE_REPO,
  forkReleaseFeedDecision,
  forkUpdateFeedRegistered,
  forkUpstreamReleaseReadsBlocked,
  registerForkUpdateFeed,
  registerForkUpstreamReleaseReadsBlocked,
  resolveForkUpdateFeed
} from './update-feed'

describe('fork update feed hook', () => {
  afterEach(() => {
    registerForkUpdateFeed(null)
    registerForkUpstreamReleaseReadsBlocked(false)
  })

  it('stays on the upstream feed until a fork registers', () => {
    expect(forkUpdateFeedRegistered()).toBe(false)
    expect(forkReleaseFeedDecision()).toEqual({ kind: 'upstream' })
    expect(resolveForkUpdateFeed()).toBeNull()
  })

  it('skips the check when the registered resolver yields no feed', () => {
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
      repo: 'orca-fork',
      private: true,
      token: 'stub-token'
    })
    expect(forkReleaseFeedDecision().kind).toBe('ready')
    expect(forkUpstreamReleaseReadsBlocked()).toBe(true)
  })

  it('is ready with the anonymous public feed when there is no token', () => {
    registerForkUpdateFeed(() => ({
      provider: 'github',
      owner: FORK_GITHUB_UPDATE_OWNER,
      repo: FORK_GITHUB_UPDATE_REPO,
      private: false
    }))
    const decision = forkReleaseFeedDecision()
    expect(decision).toEqual({
      kind: 'ready',
      feed: { provider: 'github', owner: 'quzard', repo: 'orca-fork', private: false }
    })
    expect(JSON.stringify(decision)).not.toContain('token')
    expect(JSON.stringify(decision)).not.toContain('stablyai')
    expect(forkUpstreamReleaseReadsBlocked()).toBe(true)
  })
})
