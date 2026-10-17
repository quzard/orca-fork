import { afterEach, describe, expect, it, vi } from 'vitest'

const netFetch = vi.hoisted(() => vi.fn())
const netRequest = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: netFetch, request: netRequest }
}))

vi.mock('../main/updater-release-api-token', () => ({
  resolveReleaseApiToken: () => Promise.resolve(null),
  rejectReleaseApiToken: () => undefined
}))

vi.mock('../main/git/gh-rate-limit-breaker', () => ({
  getGhRateLimitBlockedUntilMs: () => null,
  recordGhPrimaryRateLimit: () => undefined
}))

import { fetchNewerReleaseTagsWithReadiness } from '../main/updater-prerelease-feed'
import { listReleaseBuilds, resolveTargetBuild } from '../main/updater-release-builds'
import {
  FORK_UPSTREAM_RELEASE_BLOCKED,
  registerForkUpstreamReleaseReadsBlocked
} from '../shared/fork-hooks/update-feed'
import { getReleaseNotesUrlForVersion } from '../shared/release-channel'

describe('fork updater does not read upstream releases', () => {
  afterEach(() => {
    registerForkUpstreamReleaseReadsBlocked(false)
    netFetch.mockReset()
    netRequest.mockReset()
  })

  it('keeps the upstream feed until a fork build registers', () => {
    expect(getReleaseNotesUrlForVersion('1.4.228')).toContain('github.com/stablyai/orca')
  })

  it('skips version listing, pinned tags, and release-note urls', async () => {
    registerForkUpstreamReleaseReadsBlocked()
    const feed = await fetchNewerReleaseTagsWithReadiness('1.4.228-local.1.aaa', 2)
    await expect(listReleaseBuilds('stable')).resolves.toEqual([])
    await expect(listReleaseBuilds('hourly')).resolves.toEqual([])
    await expect(listReleaseBuilds('daily')).resolves.toEqual([])
    await expect(listReleaseBuilds('adhoc')).resolves.toEqual([])
    expect(() => resolveTargetBuild('rc', 'v1.4.228')).toThrow(FORK_UPSTREAM_RELEASE_BLOCKED)
    const notes = [
      getReleaseNotesUrlForVersion('1.4.228'),
      getReleaseNotesUrlForVersion('1.4.160-hourly.202607281400'),
      getReleaseNotesUrlForVersion('1.4.160-daily.202607281300'),
      getReleaseNotesUrlForVersion(null)
    ]
    for (const url of notes) {
      expect(url).not.toContain('stablyai')
      expect(url).toContain('github.com/quzard/orca')
    }
    expect(feed).toEqual({ tags: [], state: 'no-newer' })
    expect(netFetch).not.toHaveBeenCalled()
    expect(netRequest).not.toHaveBeenCalled()
  })
})
