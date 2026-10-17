// fork: 把 blockmap 资产解析装到 electron-updater 的私有 GitHub provider 上。
// 装不上时不抛给更新检查，整包下载仍然可用。

import {
  guardPrivateGithubAssetRequest,
  type AssetRequestOptions
} from './private-github-asset-redirect'
import {
  BLOCKMAP_ASSETS_NOT_LOADED,
  DIFFERENTIAL_LOOKUP_NOT_INSTALLED_LOG,
  GITHUB_RELEASE_JSON_ACCEPT,
  OLD_BLOCKMAP_UNAVAILABLE_LOG,
  githubReleaseTagUrl,
  headersForGithubHost,
  readGithubReleaseAssetPayload,
  readGithubReleaseAssets,
  resolvePrivateGithubBlockmapUrls,
  unavailableOldBlockmapUrl,
  type GithubReleaseAsset
} from './private-github-blockmap-urls'

type HeaderMap = Record<string, string | string[] | undefined>

type PrivateGithubProviderState = {
  options: { owner: string; repo: string }
  basePath: string
  baseApiUrl: URL
  forkLatestReleaseAssets?: GithubReleaseAsset[]
  forkPrivateGithubBlockmapPatched?: boolean
  getLatestVersion: () => Promise<unknown>
  getBlockMapFiles: (baseUrl: URL, oldVersion: string, newVersion: string) => URL[] | Promise<URL[]>
  configureHeaders: (accept: string) => HeaderMap
  httpRequest: (url: URL, headers: HeaderMap) => Promise<string>
}

type HttpExecutorState = {
  forkPrivateGithubBlockmapPatched?: boolean
  createRequest: (options: AssetRequestOptions, callback: unknown) => unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function releaseAssetsField(info: unknown): unknown {
  if (!isRecord(info) || !('assets' in info)) {
    return undefined
  }
  return info.assets
}

async function loadOldReleaseAssets(
  provider: PrivateGithubProviderState,
  version: string
): Promise<GithubReleaseAsset[] | null> {
  const url = githubReleaseTagUrl(provider.baseApiUrl, provider.basePath, version)
  try {
    // 失败原因可能含请求细节，不能拼进日志。令牌只留在 configureHeaders 的返回值里。
    const payload = await provider.httpRequest(
      url,
      provider.configureHeaders(GITHUB_RELEASE_JSON_ACCEPT)
    )
    return readGithubReleaseAssetPayload(payload)
  } catch {
    return null
  }
}

async function blockmapUrlsForProvider(
  provider: PrivateGithubProviderState,
  installerUrl: URL,
  oldVersion: string,
  newVersion: string
): Promise<[URL, URL]> {
  const latestAssets = provider.forkLatestReleaseAssets
  if (!latestAssets) {
    throw new Error(BLOCKMAP_ASSETS_NOT_LOADED)
  }
  const oldAssets = await loadOldReleaseAssets(provider, oldVersion)
  const urls = resolvePrivateGithubBlockmapUrls({
    installerUrl,
    latestAssets,
    oldAssets,
    oldVersion,
    newVersion,
    owner: provider.options.owner,
    repo: provider.options.repo,
    apiHostname: provider.baseApiUrl.hostname
  })
  if (
    urls[0].href === unavailableOldBlockmapUrl(provider.options.owner, provider.options.repo).href
  ) {
    console.info(OLD_BLOCKMAP_UNAVAILABLE_LOG)
  }
  return urls
}

function patchProvider(prototype: PrivateGithubProviderState): void {
  if (prototype.forkPrivateGithubBlockmapPatched) {
    return
  }
  const originalGetLatestVersion = prototype.getLatestVersion
  prototype.getLatestVersion = async function (this: PrivateGithubProviderState) {
    const info = await originalGetLatestVersion.call(this)
    // 空列表也要覆盖。否则下一次检查会继续用上一份 release 的资产。
    this.forkLatestReleaseAssets = readGithubReleaseAssets(releaseAssetsField(info))
    return info
  }
  prototype.getBlockMapFiles = function (
    this: PrivateGithubProviderState,
    baseUrl: URL,
    oldVersion: string,
    newVersion: string
  ) {
    return blockmapUrlsForProvider(this, baseUrl, oldVersion, newVersion)
  }
  prototype.forkPrivateGithubBlockmapPatched = true
}

function patchExecutor(prototype: HttpExecutorState): void {
  if (prototype.forkPrivateGithubBlockmapPatched) {
    return
  }
  const originalCreateRequest = prototype.createRequest
  prototype.createRequest = function (
    this: HttpExecutorState,
    options: AssetRequestOptions,
    callback: unknown
  ) {
    options.headers = headersForGithubHost(
      options.protocol,
      options.hostname,
      options.path,
      options.headers,
      options.port
    )
    const request = originalCreateRequest.call(this, options, callback)
    return guardPrivateGithubAssetRequest(request, options, callback, originalCreateRequest, this)
  }
  prototype.forkPrivateGithubBlockmapPatched = true
}

function isProviderPrototype(value: unknown): value is PrivateGithubProviderState {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.getLatestVersion === 'function' &&
    typeof value.getBlockMapFiles === 'function' &&
    typeof value.configureHeaders === 'function' &&
    typeof value.httpRequest === 'function'
  )
}

function isExecutorPrototype(value: unknown): value is HttpExecutorState {
  return isRecord(value) && typeof value.createRequest === 'function'
}

function functionPrototype(value: unknown): unknown {
  if (typeof value !== 'function') {
    return undefined
  }
  return value.prototype
}

function loadPatchTargets(): {
  privateGithubPrototype: PrivateGithubProviderState
  httpExecutorPrototype: HttpExecutorState
} {
  // 和 electron-updater-loader 一样运行时 require，避免在 dev 启动时加载更新器。
  const providerModule: unknown = require('electron-updater/out/providers/PrivateGitHubProvider')
  const executorModule: unknown = require('electron-updater/out/electronHttpExecutor')
  const providerPrototype = functionPrototype(
    isRecord(providerModule) ? providerModule.PrivateGitHubProvider : undefined
  )
  const executorPrototype = functionPrototype(
    isRecord(executorModule) ? executorModule.ElectronHttpExecutor : undefined
  )
  if (!isProviderPrototype(providerPrototype) || !isExecutorPrototype(executorPrototype)) {
    throw new Error('electron-updater private GitHub provider is unavailable')
  }
  return {
    privateGithubPrototype: providerPrototype,
    httpExecutorPrototype: executorPrototype
  }
}

/** 在 setFeedURL 之前调用。重复调用无效果。加载失败时更新检查仍走整包下载。 */
export function installPrivateGithubDifferentialDownload(targets?: {
  privateGithubPrototype: PrivateGithubProviderState
  httpExecutorPrototype: HttpExecutorState
}): void {
  let resolved = targets
  if (!resolved) {
    try {
      resolved = loadPatchTargets()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.info(`${DIFFERENTIAL_LOOKUP_NOT_INSTALLED_LOG}: ${message}`)
      return
    }
  }
  patchProvider(resolved.privateGithubPrototype)
  patchExecutor(resolved.httpExecutorPrototype)
}
