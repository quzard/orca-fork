// fork: 令牌文件在，但 GitHub 拒绝它（HTTP 401/403）时，这一次检查改用匿名公开 provider。
// 只改这一次检查拿到的 provider；下一次检查重新读令牌文件，再试令牌。令牌和错误详情都不写日志。

type HeaderMap = Record<string, string | string[] | undefined>

export const FORK_UPDATE_TOKEN_REJECTED_LOG =
  '[updater] GitHub rejected the saved update token; this check reads the public quzard/orca-fork releases anonymously'

export const TOKEN_FALLBACK_NOT_INSTALLED_LOG =
  '[updater] anonymous fallback for a rejected update token is not installed'

const REJECTED_STATUSES = new Set([401, 403])

export type AnonymousGithubProvider = {
  getLatestVersion: () => Promise<unknown>
  resolveFiles: (updateInfo: unknown) => unknown
  getBlockMapFiles: (baseUrl: URL, oldVersion: string, newVersion: string) => URL[] | Promise<URL[]>
  setRequestHeaders: (value: HeaderMap | null) => void
  readonly fileExtraDownloadHeaders: HeaderMap | null
}

export type CreateAnonymousGithubProvider = (
  options: Record<string, unknown>,
  updater: unknown,
  runtimeOptions: unknown
) => AnonymousGithubProvider

type TokenProviderState = {
  options: Record<string, unknown>
  updater: unknown
  runtimeOptions: unknown
  requestHeaders: HeaderMap | null
  forkTokenRejectedStatus?: number | null
  forkAnonymousFallback?: AnonymousGithubProvider | null
  forkTokenFallbackPatched?: boolean
  getLatestVersion: () => Promise<unknown>
  resolveFiles: (updateInfo: unknown) => unknown
  getBlockMapFiles: (baseUrl: URL, oldVersion: string, newVersion: string) => URL[] | Promise<URL[]>
  httpRequest: (url: URL, headers: HeaderMap, cancellationToken?: unknown) => Promise<string | null>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function rejectedTokenStatus(error: unknown): number | null {
  if (!isRecord(error) || typeof error.statusCode !== 'number') {
    return null
  }
  return REJECTED_STATUSES.has(error.statusCode) ? error.statusCode : null
}

/** 匿名 provider 的配置：去掉 token，private 设为 false。 */
export function anonymousFeedOptions(options: Record<string, unknown>): Record<string, unknown> {
  const { token: _token, ...rest } = options
  return { ...rest, private: false }
}

function findGetter(prototype: object, name: string): ((this: unknown) => unknown) | undefined {
  let current: object | null = prototype
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name)
    if (descriptor) {
      return descriptor.get
    }
    current = Object.getPrototypeOf(current)
  }
  return undefined
}

function patchProvider(
  prototype: TokenProviderState,
  createAnonymous: CreateAnonymousGithubProvider
): void {
  if (prototype.forkTokenFallbackPatched) {
    return
  }
  const originalHttpRequest = prototype.httpRequest
  const originalGetLatestVersion = prototype.getLatestVersion
  const originalResolveFiles = prototype.resolveFiles
  const originalGetBlockMapFiles = prototype.getBlockMapFiles
  const originalExtraHeaders = findGetter(prototype, 'fileExtraDownloadHeaders')

  prototype.httpRequest = async function (
    this: TokenProviderState,
    url: URL,
    headers: HeaderMap,
    cancellationToken?: unknown
  ) {
    try {
      return await originalHttpRequest.call(this, url, headers, cancellationToken)
    } catch (error) {
      const status = rejectedTokenStatus(error)
      if (status !== null) {
        // 原始 HttpError 会被 electron-updater 包成普通错误，状态码只能在这里记下。
        this.forkTokenRejectedStatus = status
      }
      throw error
    }
  }

  prototype.getLatestVersion = async function (this: TokenProviderState) {
    this.forkTokenRejectedStatus = null
    this.forkAnonymousFallback = null
    try {
      return await originalGetLatestVersion.call(this)
    } catch (error) {
      const status = this.forkTokenRejectedStatus ?? rejectedTokenStatus(error)
      if (status === null) {
        throw error
      }
      // 只记状态码。错误信息里有请求细节，不打印。
      console.warn(`${FORK_UPDATE_TOKEN_REJECTED_LOG} (HTTP ${status})`)
      const fallback = createAnonymous(
        anonymousFeedOptions(this.options),
        this.updater,
        this.runtimeOptions
      )
      fallback.setRequestHeaders(this.requestHeaders)
      this.forkAnonymousFallback = fallback
      return fallback.getLatestVersion()
    }
  }

  prototype.resolveFiles = function (this: TokenProviderState, updateInfo: unknown) {
    const fallback = this.forkAnonymousFallback
    return fallback
      ? fallback.resolveFiles(updateInfo)
      : originalResolveFiles.call(this, updateInfo)
  }

  prototype.getBlockMapFiles = function (
    this: TokenProviderState,
    baseUrl: URL,
    oldVersion: string,
    newVersion: string
  ) {
    const fallback = this.forkAnonymousFallback
    return fallback
      ? fallback.getBlockMapFiles(baseUrl, oldVersion, newVersion)
      : originalGetBlockMapFiles.call(this, baseUrl, oldVersion, newVersion)
  }

  // 改走匿名后，下载不能再带上被拒的 authorization 头。
  Object.defineProperty(prototype, 'fileExtraDownloadHeaders', {
    configurable: true,
    get(this: TokenProviderState) {
      const fallback = this.forkAnonymousFallback
      if (fallback) {
        return fallback.fileExtraDownloadHeaders
      }
      return originalExtraHeaders ? originalExtraHeaders.call(this) : null
    }
  })
  prototype.forkTokenFallbackPatched = true
}

function isProviderPrototype(value: unknown): value is TokenProviderState {
  return (
    isRecord(value) &&
    typeof value.getLatestVersion === 'function' &&
    typeof value.resolveFiles === 'function' &&
    typeof value.getBlockMapFiles === 'function' &&
    typeof value.httpRequest === 'function'
  )
}

function loadTargets(): {
  privateGithubPrototype: TokenProviderState
  createAnonymousProvider: CreateAnonymousGithubProvider
} {
  // 运行时 require，和 private-github-blockmap 一样不在 dev 启动时加载更新器。
  const privateModule: unknown = require('electron-updater/out/providers/PrivateGitHubProvider')
  const publicModule: unknown = require('electron-updater/out/providers/GitHubProvider')
  const privateClass = isRecord(privateModule) ? privateModule.PrivateGitHubProvider : undefined
  const publicClass = isRecord(publicModule) ? publicModule.GitHubProvider : undefined
  const prototype: unknown = typeof privateClass === 'function' ? privateClass.prototype : undefined
  if (!isProviderPrototype(prototype) || typeof publicClass !== 'function') {
    throw new Error('electron-updater GitHub providers are unavailable')
  }
  const PublicProvider = publicClass as new (
    options: Record<string, unknown>,
    updater: unknown,
    runtimeOptions: unknown
  ) => AnonymousGithubProvider
  return {
    privateGithubPrototype: prototype,
    createAnonymousProvider: (options, updater, runtimeOptions) =>
      new PublicProvider(options, updater, runtimeOptions)
  }
}

/** 在 installPrivateGithubDifferentialDownload 之后、setFeedURL 之前调用。重复调用无效果。 */
export function installPrivateGithubTokenFallback(targets?: {
  privateGithubPrototype: TokenProviderState
  createAnonymousProvider: CreateAnonymousGithubProvider
}): void {
  let resolved = targets
  if (!resolved) {
    try {
      resolved = loadTargets()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.info(`${TOKEN_FALLBACK_NOT_INSTALLED_LOG}: ${message}`)
      return
    }
  }
  patchProvider(resolved.privateGithubPrototype, resolved.createAnonymousProvider)
}
