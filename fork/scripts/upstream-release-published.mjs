import { execFileSync } from 'node:child_process'

// --check 要求基线 tag 在上游 GitHub 上有已发布的正式 release；--write 只升到有已发布 release 的 tag。
// 上游的稳定 tag vX.Y.Z 一向作为正式 release 发布（预发布不用 vX.Y.Z 这种 tag），
// 所以草稿、预发布、只有 tag 没有 release 都算没发布。
// 离线或测试时显式设 ORCA_UPSTREAM_RELEASE_CHECK=skip 跳过，跳过会打警告；其它值直接报错。
export const UPSTREAM_REPO = 'stablyai/orca'
export const RELEASE_CHECK_ENV = 'ORCA_UPSTREAM_RELEASE_CHECK'
const BODY_LIMIT = 300

/** 'published' or why it is not (definitive answers only); throws when the answer is malformed. */
export function releaseState(tagName, release) {
  if (!release) {
    return 'no release (missing or draft)'
  }
  if (release.tag_name !== tagName) {
    throw new Error(`upstream release lookup for ${tagName} returned ${release.tag_name}`)
  }
  if (release.draft) {
    return 'draft'
  }
  if (release.prerelease) {
    return 'prerelease'
  }
  return release.published_at ? 'published' : 'no publish date'
}

export function assessUpstreamRelease(tagName, release) {
  const state = releaseState(tagName, release)
  if (state === 'no release (missing or draft)') {
    throw new Error(
      `upstream ${tagName} has no published GitHub release in ${UPSTREAM_REPO} (missing or still a draft)`
    )
  }
  if (state === 'draft') {
    throw new Error(`upstream ${tagName} GitHub release is still a draft`)
  }
  if (state === 'prerelease') {
    throw new Error(
      `upstream ${tagName} GitHub release is marked prerelease; stable tags ship as full releases`
    )
  }
  if (state !== 'published') {
    throw new Error(`upstream ${tagName} GitHub release has no publish date`)
  }
}

function readJson(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`cannot parse the GitHub response for ${label}`)
  }
}

function envToken(env) {
  return env.GH_TOKEN || env.GITHUB_TOKEN || ''
}

/** Error text never carries a token, even if a tool echoed one back. */
function redact(text, env) {
  let out = String(text ?? '')
  for (const secret of [env.GH_TOKEN, env.GITHUB_TOKEN]) {
    if (secret) {
      out = out.split(secret).join('[redacted]')
    }
  }
  return out
}

function bodyMessage(body) {
  const trimmed = body.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    // not JSON: show the text itself
  }
  return trimmed.length > BODY_LIMIT ? `${trimmed.slice(0, BODY_LIMIT)}…` : trimmed
}

/** gh: a release JSON or HTTP 404 is definitive; anything else (not installed, not logged in,
 *  401, expired token, network) returns { error } so the caller tries curl. */
function readWithGh(path, exec, env) {
  try {
    return { release: exec('gh', ['api', path]) }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { error: 'gh is not installed' }
    }
    const stderr = error?.stderr ? String(error.stderr).trim() : ''
    if (/HTTP 404/.test(stderr)) {
      return { release: null }
    }
    return { error: `gh failed: ${redact(stderr || error?.message, env)}` }
  }
}

/** curl: 200 and 404 are definitive; any other status throws with GitHub's message. The token,
 *  when set, goes in through stdin (-H @-), never in argv. */
function readWithCurl(path, exec, env, tagName) {
  const token = envToken(env)
  const args = ['-sS', '-L', '-H', 'Accept: application/vnd.github+json']
  if (token) {
    args.push('-H', '@-')
  }
  args.push('-w', '\n%{http_code}', `https://api.github.com/${path}`)
  let out
  try {
    out = exec('curl', args, token ? { input: `Authorization: Bearer ${token}\n` } : {})
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : ''
    throw new Error(`curl failed: ${redact(stderr || error?.message, env)}`)
  }
  const cut = out.lastIndexOf('\n')
  const status = out.slice(cut + 1).trim()
  const body = cut === -1 ? '' : out.slice(0, cut)
  if (status === '404') {
    return null
  }
  if (status === '200') {
    return readJson(body, tagName)
  }
  const message = redact(bodyMessage(body), env)
  const limited = status === '429' || (status === '403' && /rate limit/i.test(message))
  const hint = limited
    ? ' (GitHub API rate limit: log in with gh auth login, set GH_TOKEN, or set ORCA_UPSTREAM_RELEASE_CHECK=skip)'
    : ''
  throw new Error(`HTTP ${status}${message ? `: ${message}` : ''}${hint}`)
}

/** The release JSON, or null when GitHub definitively has no published release for the tag.
 *  Throws when neither gh nor curl gave a definitive answer (fail closed). */
export function fetchUpstreamRelease(tagName, run = execFileSync, env = process.env) {
  const path = `repos/${UPSTREAM_REPO}/releases/tags/${tagName}`
  const exec = (cmd, args, extra = {}) =>
    run(cmd, args, {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: [extra.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      ...extra
    })
  const gh = readWithGh(path, exec, env)
  if (!gh.error) {
    return gh.release === null ? null : readJson(gh.release, tagName)
  }
  try {
    return readWithCurl(path, exec, env, tagName)
  } catch (error) {
    throw new Error(
      `cannot read upstream release ${tagName}: ${gh.error}; curl: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function releaseCheckMode(env) {
  const mode = env[RELEASE_CHECK_ENV]
  if (mode !== undefined && mode !== '' && mode !== 'skip') {
    throw new Error(`${RELEASE_CHECK_ENV} must be unset or 'skip', got '${mode}'`)
  }
  return mode === 'skip' ? 'skip' : 'check'
}

/** 'published' when the release is a full release, 'skipped' only with the explicit escape. */
export function verifyUpstreamRelease(tagName, options = {}) {
  const env = options.env ?? process.env
  if (releaseCheckMode(env) === 'skip') {
    return 'skipped'
  }
  const fetchRelease = options.fetchRelease ?? ((tag) => fetchUpstreamRelease(tag, undefined, env))
  assessUpstreamRelease(tagName, fetchRelease(tagName))
  return 'published'
}

/** For --write: 'published', 'skipped' (explicit escape), or a definitive reason it is not
 *  released. Throws when the lookup is not definitive. */
export function lookupUpstreamReleaseState(tagName, options = {}) {
  const env = options.env ?? process.env
  if (releaseCheckMode(env) === 'skip') {
    return 'skipped'
  }
  const fetchRelease = options.fetchRelease ?? ((tag) => fetchUpstreamRelease(tag, undefined, env))
  return releaseState(tagName, fetchRelease(tagName))
}
