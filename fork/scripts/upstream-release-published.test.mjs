import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assessUpstreamRelease,
  fetchUpstreamRelease,
  verifyUpstreamRelease
} from './upstream-release-published.mjs'

const published = (tag, extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-11-16T10:30:50Z',
  ...extra
})

const failure = (props) => Object.assign(new Error('command failed'), props)

describe('upstream release published check', () => {
  it('accepts only a published full release for the same tag', () => {
    assert.doesNotThrow(() => assessUpstreamRelease('v1.4.261', published('v1.4.261')))
    assert.throws(() => assessUpstreamRelease('v1.4.261', null), /no published GitHub release/)
    assert.throws(
      () => assessUpstreamRelease('v1.4.261', published('v1.4.261', { draft: true })),
      /still a draft/
    )
    assert.throws(
      () => assessUpstreamRelease('v1.4.261', published('v1.4.261', { prerelease: true })),
      /marked prerelease/
    )
    assert.throws(
      () => assessUpstreamRelease('v1.4.261', published('v1.4.261', { published_at: null })),
      /no publish date/
    )
    assert.throws(
      () => assessUpstreamRelease('v1.4.261', published('v1.4.260')),
      /returned v1\.4\.260/
    )
  })

  it('reads the release with gh and treats HTTP 404 as not published', () => {
    const calls = []
    const ok = (cmd, args) => {
      calls.push([cmd, ...args])
      return JSON.stringify(published('v1.4.261'))
    }
    assert.equal(fetchUpstreamRelease('v1.4.261', ok).tag_name, 'v1.4.261')
    assert.deepEqual(calls, [['gh', 'api', 'repos/stablyai/orca/releases/tags/v1.4.261']])
    const missing = () => {
      throw failure({ status: 1, stderr: 'gh: Not Found (HTTP 404)' })
    }
    assert.equal(fetchUpstreamRelease('v1.4.260', missing), null)
    const offline = () => {
      throw failure({ status: 1, stderr: 'error connecting to api.github.com' })
    }
    assert.throws(() => fetchUpstreamRelease('v1.4.261', offline), /cannot read upstream release/)
  })

  it('falls back to curl when gh is not installed', () => {
    const run = (status, body) => (cmd) => {
      if (cmd === 'gh') {
        throw failure({ code: 'ENOENT' })
      }
      return `${body}\n${status}`
    }
    assert.equal(
      fetchUpstreamRelease('v1.4.261', run('200', JSON.stringify(published('v1.4.261')))).draft,
      false
    )
    assert.equal(fetchUpstreamRelease('v1.4.260', run('404', '{}')), null)
    assert.throws(() => fetchUpstreamRelease('v1.4.261', run('403', '{}')), /HTTP 403/)
  })

  it('skips only with the explicit escape and rejects any other value', () => {
    const never = () => assert.fail('must not read GitHub')
    assert.equal(
      verifyUpstreamRelease('v1.4.261', {
        env: { ORCA_UPSTREAM_RELEASE_CHECK: 'skip' },
        fetchRelease: never
      }),
      'skipped'
    )
    assert.throws(
      () =>
        verifyUpstreamRelease('v1.4.261', {
          env: { ORCA_UPSTREAM_RELEASE_CHECK: '1' },
          fetchRelease: never
        }),
      /must be unset or 'skip'/
    )
    assert.equal(
      verifyUpstreamRelease('v1.4.261', { env: {}, fetchRelease: published }),
      'published'
    )
    assert.throws(
      () => verifyUpstreamRelease('v1.4.261', { env: {}, fetchRelease: () => null }),
      /no published GitHub release/
    )
  })
})
