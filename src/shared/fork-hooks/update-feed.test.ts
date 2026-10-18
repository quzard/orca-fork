import { afterEach, describe, expect, it } from 'vitest'
import {
  forkGithubUpdateFeed,
  forkReleaseFeedDecision,
  forkUpdateFeedRegistered,
  isForkBuild,
  registerForkBuild,
  registerForkUpdateFeed
} from './update-feed'

describe('fork update feed hook', () => {
  afterEach(() => {
    registerForkUpdateFeed(false)
    registerForkBuild(false)
  })

  it('stays on the upstream feed until a fork registers', () => {
    expect(forkUpdateFeedRegistered()).toBe(false)
    expect(isForkBuild()).toBe(false)
    expect(forkReleaseFeedDecision()).toEqual({ kind: 'upstream' })
  })

  it('skips the check in a fork build that has no feed (orcad, renderer)', () => {
    registerForkBuild()
    expect(isForkBuild()).toBe(true)
    expect(forkReleaseFeedDecision()).toEqual({ kind: 'skip' })
  })

  it('is ready with only the anonymous public quzard/orca-fork feed', () => {
    registerForkUpdateFeed()
    const decision = forkReleaseFeedDecision()
    expect(decision).toEqual({
      kind: 'ready',
      feed: { provider: 'github', owner: 'quzard', repo: 'orca-fork', private: false }
    })
    expect(Object.keys(forkGithubUpdateFeed()).sort()).toEqual([
      'owner',
      'private',
      'provider',
      'repo'
    ])
    expect(JSON.stringify(decision)).not.toMatch(/token|stablyai/i)
    expect(isForkBuild()).toBe(true)
  })

  it('returns a fresh feed object each time', () => {
    const first = forkGithubUpdateFeed()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: simulates a caller mutating the returned object.
    ;(first as Record<string, unknown>).token = 'x'
    expect(forkGithubUpdateFeed()).not.toHaveProperty('token')
  })
})
