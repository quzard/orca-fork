import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assessUpstreamRelease,
  fetchUpstreamRelease,
  lookupUpstreamReleaseState,
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

// A fake `execFileSync`: gh answers from `gh`, curl answers `<body>\n<status>` from `curl`; every
// call is recorded with its argv and options so tests can see what would have been spawned.
function fakeRun({ gh, curl }) {
  const calls = []
  const run = (cmd, args, options) => {
    calls.push({ cmd, args, options })
    const answer = cmd === 'gh' ? gh : curl
    if (answer instanceof Error) {
      throw answer
    }
    if (typeof answer === 'function') {
      return answer(args, options)
    }
    return answer
  }
  return { run, calls }
}

const curlAnswer = (status, body) =>
  `${typeof body === 'string' ? body : JSON.stringify(body)}\n${status}`
const RATE_LIMIT = {
  message:
    'API rate limit exceeded for 203.0.113.7. (Authenticated requests get a higher rate limit.)',
  documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting'
}

describe('gh to curl fallback', () => {
  it('falls back to curl when gh is installed but not logged in, and passes on a published release', () => {
    const { run, calls } = fakeRun({
      gh: failure({
        status: 4,
        stderr: 'To get started with GitHub CLI, please run:  gh auth login'
      }),
      curl: curlAnswer('200', published('v1.4.261'))
    })
    const release = fetchUpstreamRelease('v1.4.261', run, {})
    assert.doesNotThrow(() => assessUpstreamRelease('v1.4.261', release))
    assert.deepEqual(
      calls.map((call) => call.cmd),
      ['gh', 'curl']
    )
  })

  it('falls back to curl on gh 401 or an expired token', () => {
    for (const stderr of ['gh: Bad credentials (HTTP 401)', 'HTTP 401: token expired']) {
      const { run } = fakeRun({
        gh: failure({ status: 1, stderr }),
        curl: curlAnswer('200', published('v1.4.261'))
      })
      assert.equal(fetchUpstreamRelease('v1.4.261', run, {}).tag_name, 'v1.4.261')
    }
  })

  it('keeps a definitive gh 404 and does not ask curl', () => {
    const { run, calls } = fakeRun({
      gh: failure({ status: 1, stderr: 'gh: Not Found (HTTP 404)' }),
      curl: curlAnswer('200', published('v1.4.260'))
    })
    assert.equal(fetchUpstreamRelease('v1.4.260', run, {}), null)
    assert.deepEqual(
      calls.map((call) => call.cmd),
      ['gh']
    )
  })

  it('keeps a gh draft answer and does not ask curl', () => {
    const { run, calls } = fakeRun({
      gh: JSON.stringify(published('v1.4.262', { draft: true })),
      curl: curlAnswer('200', published('v1.4.262'))
    })
    assert.equal(
      lookupUpstreamReleaseState('v1.4.262', {
        env: {},
        fetchRelease: (tag) => fetchUpstreamRelease(tag, run, {})
      }),
      'draft'
    )
    assert.equal(calls.length, 1)
  })

  it('fails closed when neither gh nor curl gives a definitive answer', () => {
    const { run } = fakeRun({
      gh: failure({ status: 4, stderr: 'not logged in' }),
      curl: failure({ status: 6, stderr: 'curl: (6) Could not resolve host: api.github.com' })
    })
    assert.throws(
      () => fetchUpstreamRelease('v1.4.261', run, {}),
      /cannot read upstream release v1\.4\.261: gh failed: not logged in; curl: curl failed: curl: \(6\) Could not resolve host/
    )
  })

  it('shows status and GitHub message on a curl 403 rate limit', () => {
    const { run } = fakeRun({
      gh: failure({ code: 'ENOENT' }),
      curl: curlAnswer('403', RATE_LIMIT)
    })
    assert.throws(
      () => fetchUpstreamRelease('v1.4.261', run, {}),
      (error) => {
        assert.match(error.message, /HTTP 403: API rate limit exceeded for 203\.0\.113\.7/)
        assert.match(
          error.message,
          /GitHub API rate limit: log in with gh auth login, set GH_TOKEN/
        )
        assert.doesNotMatch(error.message, /documentation_url/)
        return true
      }
    )
    const { run: run429 } = fakeRun({
      gh: failure({ code: 'ENOENT' }),
      curl: curlAnswer('429', 'slow down')
    })
    assert.throws(
      () => fetchUpstreamRelease('v1.4.261', run429, {}),
      /HTTP 429: slow down \(GitHub API rate limit/
    )
  })

  it('sends GH_TOKEN to curl through stdin only, never in argv or error text', () => {
    const token = 'ghp_FAKEtoken0123456789abcdef'
    for (const env of [{ GH_TOKEN: token }, { GITHUB_TOKEN: token }]) {
      const { run, calls } = fakeRun({
        gh: failure({ status: 1, stderr: `HTTP 401: Bad credentials ${token}` }),
        curl: curlAnswer('500', { message: `server echoed ${token}` })
      })
      assert.throws(
        () => fetchUpstreamRelease('v1.4.261', run, env),
        (error) => {
          assert.ok(!error.message.includes(token), error.message)
          assert.match(error.message, /\[redacted\]/)
          assert.match(error.message, /HTTP 500/)
          return true
        }
      )
      const curl = calls.find((call) => call.cmd === 'curl')
      for (const call of calls) {
        assert.ok(
          !call.args.some((arg) => arg.includes(token)),
          `${call.cmd} argv carried the token`
        )
      }
      assert.deepEqual(
        curl.args.slice(curl.args.indexOf('-H', 4), curl.args.indexOf('-H', 4) + 2),
        ['-H', '@-']
      )
      assert.equal(curl.options.input, `Authorization: Bearer ${token}\n`)
      assert.equal(curl.options.stdio[0], 'pipe')
    }
    const { run, calls } = fakeRun({
      gh: failure({ code: 'ENOENT' }),
      curl: curlAnswer('200', published('v1.4.261'))
    })
    fetchUpstreamRelease('v1.4.261', run, {})
    const curl = calls.find((call) => call.cmd === 'curl')
    assert.ok(!curl.args.includes('@-'))
    assert.equal(curl.options.input, undefined)
  })
})
