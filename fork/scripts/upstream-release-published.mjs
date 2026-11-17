import { execFileSync } from 'node:child_process'

// --check 还要求基线 tag 在上游 GitHub 上有已发布的正式 release：不是草稿，也不是预发布。
// 上游的稳定 tag vX.Y.Z 一向作为正式 release 发布（预发布不用 vX.Y.Z 这种 tag），
// 所以这里与 STABLE_TAG 一致：草稿和预发布都算没发布。只有 tag、没有 release 也算没发布。
// 离线或测试时显式设 ORCA_UPSTREAM_RELEASE_CHECK=skip 跳过，跳过会打警告；其它值直接报错。
export const UPSTREAM_REPO = 'stablyai/orca'
export const RELEASE_CHECK_ENV = 'ORCA_UPSTREAM_RELEASE_CHECK'

export function assessUpstreamRelease(tagName, release) {
  if (!release) {
    throw new Error(
      `upstream ${tagName} has no published GitHub release in ${UPSTREAM_REPO} (missing or still a draft)`
    )
  }
  if (release.tag_name !== tagName) {
    throw new Error(`upstream release lookup for ${tagName} returned ${release.tag_name}`)
  }
  if (release.draft) {
    throw new Error(`upstream ${tagName} GitHub release is still a draft`)
  }
  if (release.prerelease) {
    throw new Error(
      `upstream ${tagName} GitHub release is marked prerelease; stable tags ship as full releases`
    )
  }
  if (!release.published_at) {
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

// gh 已登录时走 gh（带认证，也读代理环境变量）；没有 gh 才用 curl。
// 404 当作「没有已发布的 release」（未授权时草稿也是 404），其它失败直接报错，不当作通过。
export function fetchUpstreamRelease(tagName, run = execFileSync) {
  const path = `repos/${UPSTREAM_REPO}/releases/tags/${tagName}`
  const exec = (cmd, args) =>
    run(cmd, args, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    return readJson(exec('gh', ['api', path]), tagName)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      const stderr = error?.stderr ? String(error.stderr) : ''
      if (/HTTP 404/.test(stderr)) {
        return null
      }
      throw new Error(`cannot read upstream release ${tagName}: ${stderr.trim() || error.message}`)
    }
  }
  const out = exec('curl', [
    '-sS',
    '-L',
    '-H',
    'Accept: application/vnd.github+json',
    '-w',
    '\n%{http_code}',
    `https://api.github.com/${path}`
  ])
  const cut = out.lastIndexOf('\n')
  const status = out.slice(cut + 1).trim()
  if (status === '404') {
    return null
  }
  if (status !== '200') {
    throw new Error(`cannot read upstream release ${tagName}: HTTP ${status}`)
  }
  return readJson(out.slice(0, cut), tagName)
}

/** 'published' when the release is a full release, 'skipped' only with the explicit escape. */
export function verifyUpstreamRelease(tagName, options = {}) {
  const env = options.env ?? process.env
  const mode = env[RELEASE_CHECK_ENV]
  if (mode === 'skip') {
    return 'skipped'
  }
  if (mode !== undefined && mode !== '') {
    throw new Error(`${RELEASE_CHECK_ENV} must be unset or 'skip', got '${mode}'`)
  }
  const fetchRelease = options.fetchRelease ?? fetchUpstreamRelease
  assessUpstreamRelease(tagName, fetchRelease(tagName))
  return 'published'
}
