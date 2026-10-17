// fork: 私有 GitHub Release 的 blockmap 资产地址。
// PrivateGitHubProvider 会把安装包解析成 /releases/assets/<id>，
// 用令牌和 application/octet-stream 下载。
// 基类 getBlockMapFiles 把 .blockmap 拼到这条地址后面，路径里又没有版本号，
// 新旧 blockmap 就变成同一个不存在的地址。
// 令牌只能出现在 api.github.com 上；签名下载域名不带 Authorization。

export const GITHUB_API_HOSTNAME = 'api.github.com'
export const GITHUB_RELEASE_ASSET_ACCEPT = 'application/octet-stream'
export const GITHUB_RELEASE_JSON_ACCEPT = 'application/vnd.github+json'
export const GITHUB_RELEASE_TAG_PREFIX = 'v'
export const BLOCKMAP_FILE_SUFFIX = '.blockmap'
export const GITHUB_RELEASE_ASSET_PATH_MARK = '/releases/assets/'
export const MISSING_OLD_BLOCKMAP_ASSET_ID = 'unavailable'
export const BLOCKMAP_ASSETS_NOT_LOADED = 'private release assets are not loaded'
export const BLOCKMAP_INSTALLER_NOT_ASSET = 'update file is not a private GitHub release asset'
export const BLOCKMAP_ASSET_MISSING_PREFIX = 'release is missing blockmap asset '
export const AUTHORIZATION_HEADER_NAME = 'authorization'
export const DIFFERENTIAL_REDIRECT_HOP_LIMIT = 10
export const DIFFERENTIAL_REDIRECT_STOPPED = 'private github asset redirect was not followed'
export const OLD_BLOCKMAP_UNAVAILABLE_LOG =
  '[updater] old private release blockmap is unavailable; using the cached blockmap or a full download'
export const DIFFERENTIAL_LOOKUP_NOT_INSTALLED_LOG =
  '[updater] differential blockmap lookup was not installed'

const ASSET_ID_IN_PATH = /\/releases\/assets\/(\d+)$/

export type GithubReleaseAsset = {
  name: string
  url: string
}

type HeaderMap = Record<string, string | string[] | undefined>

export type BlockmapResolutionInput = {
  installerUrl: URL
  latestAssets: readonly GithubReleaseAsset[]
  oldAssets: readonly GithubReleaseAsset[] | null
  oldVersion: string
  newVersion: string
  owner: string
  repo: string
  apiHostname: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readGithubReleaseAssets(value: unknown): GithubReleaseAsset[] {
  if (!Array.isArray(value)) {
    return []
  }
  const assets: GithubReleaseAsset[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.url !== 'string') {
      continue
    }
    if (!item.name || !item.url) {
      continue
    }
    assets.push({ name: item.name, url: item.url })
  }
  return assets
}

export function readGithubReleaseAssetPayload(payload: string): GithubReleaseAsset[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !('assets' in parsed)) {
    return null
  }
  return readGithubReleaseAssets(parsed.assets)
}

export function githubReleaseAssetId(assetUrl: string): string | null {
  try {
    return ASSET_ID_IN_PATH.exec(new URL(assetUrl).pathname)?.[1] ?? null
  } catch {
    return null
  }
}

export function githubReleaseTagUrl(baseApiUrl: URL, basePath: string, version: string): URL {
  const tag = `${GITHUB_RELEASE_TAG_PREFIX}${version}`
  return new URL(`${basePath}/tags/${encodeURIComponent(tag)}`, baseApiUrl)
}

export function unavailableOldBlockmapUrl(owner: string, repo: string): URL {
  return new URL(
    `https://${GITHUB_API_HOSTNAME}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${GITHUB_RELEASE_ASSET_PATH_MARK}${MISSING_OLD_BLOCKMAP_ASSET_ID}`
  )
}

export function isGithubReleaseAssetRequest(
  hostname: string | undefined,
  requestPath: string | undefined
): boolean {
  if (hostname?.toLowerCase() !== GITHUB_API_HOSTNAME) {
    return false
  }
  const pathOnly = requestPath?.split('?')[0] ?? ''
  return ASSET_ID_IN_PATH.test(pathOnly)
}

// 差分下载器会把 Accept 改成 */*。GitHub 只有 application/octet-stream 才 302 到文件本体。
export function githubAssetAcceptHeaders(
  hostname: string | undefined,
  requestPath: string | undefined,
  headers: HeaderMap | null | undefined
): HeaderMap | null {
  if (!isGithubReleaseAssetRequest(hostname, requestPath)) {
    return null
  }
  const next: HeaderMap = {}
  if (headers) {
    Object.assign(next, headers)
  }
  delete next.Accept
  next.accept = GITHUB_RELEASE_ASSET_ACCEPT
  return next
}

function copyHeaders(headers: HeaderMap | null | undefined): HeaderMap {
  const next: HeaderMap = {}
  if (headers) {
    Object.assign(next, headers)
  }
  return next
}

function deleteAuthorization(headers: HeaderMap): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === AUTHORIZATION_HEADER_NAME) {
      delete headers[key]
    }
  }
}

// 令牌只发给 api.github.com。签名文件域名，以及没有主机名的请求，都去掉 Authorization。
export function headersForGithubHost(
  hostname: string | undefined,
  requestPath: string | undefined,
  headers: HeaderMap | null | undefined
): HeaderMap {
  if (hostname?.toLowerCase() !== GITHUB_API_HOSTNAME) {
    const next = copyHeaders(headers)
    deleteAuthorization(next)
    return next
  }
  return githubAssetAcceptHeaders(hostname, requestPath, headers) ?? copyHeaders(headers)
}

function assetApiUrl(assetUrl: string, apiHostname: string): URL | null {
  let url: URL
  try {
    url = new URL(assetUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== apiHostname.toLowerCase()) {
    return null
  }
  if (!ASSET_ID_IN_PATH.test(url.pathname)) {
    return null
  }
  return url
}

function findAssetUrl(
  assets: readonly GithubReleaseAsset[],
  name: string,
  apiHostname: string
): URL | null {
  const asset = assets.find((item) => item.name === name)
  return asset ? assetApiUrl(asset.url, apiHostname) : null
}

function oldBlockmapNames(installerName: string, oldVersion: string, newVersion: string): string[] {
  const current = `${installerName}${BLOCKMAP_FILE_SUFFIX}`
  if (oldVersion === newVersion || !installerName.includes(newVersion)) {
    return [current]
  }
  const renamed = `${installerName.replaceAll(newVersion, oldVersion)}${BLOCKMAP_FILE_SUFFIX}`
  return renamed === current ? [current] : [current, renamed]
}

/**
 * 返回 [旧 blockmap, 新 blockmap]，顺序和 electron-updater 的 getBlockMapFiles 一致。
 * 新 blockmap 必须在本次 release 里。旧的优先按同名文件找，文件名带版本时再替换版本。
 * 旧资产缺失时返回一个会 404 的占位地址：缓存里的 current.blockmap 仍可使用，
 * 缓存也没有时，electron-updater 捕获下载失败并整包下载。
 */
export function resolvePrivateGithubBlockmapUrls(input: BlockmapResolutionInput): [URL, URL] {
  const installerId = githubReleaseAssetId(input.installerUrl.href)
  const installer = installerId
    ? input.latestAssets.find((asset) => githubReleaseAssetId(asset.url) === installerId)
    : undefined
  if (!installer) {
    throw new Error(BLOCKMAP_INSTALLER_NOT_ASSET)
  }
  const newUrl = findAssetUrl(
    input.latestAssets,
    `${installer.name}${BLOCKMAP_FILE_SUFFIX}`,
    input.apiHostname
  )
  if (!newUrl) {
    throw new Error(`${BLOCKMAP_ASSET_MISSING_PREFIX}${installer.name}${BLOCKMAP_FILE_SUFFIX}`)
  }
  let oldUrl: URL | null = null
  if (input.oldAssets) {
    for (const name of oldBlockmapNames(installer.name, input.oldVersion, input.newVersion)) {
      oldUrl = findAssetUrl(input.oldAssets, name, input.apiHostname)
      if (oldUrl) {
        break
      }
    }
  }
  if (!oldUrl || oldUrl.href === newUrl.href) {
    oldUrl = unavailableOldBlockmapUrl(input.owner, input.repo)
  }
  return [oldUrl, newUrl]
}
