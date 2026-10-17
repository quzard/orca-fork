// fork: 差分下载的 followRedirect 不会经过 prepareRedirectUrlOptions。
// 原生跟随会把 Authorization 原样带到签名域名，所以这里改成中止后重发。

import {
  DIFFERENTIAL_REDIRECT_HOP_LIMIT,
  DIFFERENTIAL_REDIRECT_STOPPED,
  GITHUB_API_HOSTNAME,
  headersForGithubHost
} from './private-github-blockmap-urls'

type HeaderMap = Record<string, string | string[] | undefined>

const REDIRECT_EVENT = 'redirect'
const ERROR_EVENT = 'error'
const ABORT_EVENT = 'abort'

export type AssetRequestOptions = {
  protocol?: string
  hostname?: string
  host?: string
  port?: string
  path?: string
  headers?: HeaderMap | null
}

type RequestListener = (...args: unknown[]) => void

type RedirectableRequest = {
  on: (event: string, listener: RequestListener) => unknown
  followRedirect: () => void
  abort?: () => void
  end?: () => void
  listeners?: (event: string) => RequestListener[]
  removeAllListeners?: (event: string) => void
  forkRedirectGuarded?: boolean
}

type CreateRequest = (this: unknown, options: AssetRequestOptions, callback: unknown) => unknown

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRedirectableRequest(value: unknown): value is RedirectableRequest {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.on === 'function' && typeof value.followRedirect === 'function'
}

function copyListeners(request: RedirectableRequest, event: string): RequestListener[] {
  if (typeof request.listeners !== 'function') {
    return []
  }
  return request.listeners(event).slice()
}

function redirectTarget(redirectUrl: string | undefined): URL | null {
  if (!redirectUrl) {
    return null
  }
  try {
    const target = new URL(redirectUrl)
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      return null
    }
    return target
  } catch {
    return null
  }
}

function applyRedirectTarget(options: AssetRequestOptions, target: URL): void {
  options.protocol = target.protocol
  options.hostname = target.hostname
  options.host = target.host
  if (target.port) {
    options.port = target.port
  } else {
    delete options.port
  }
  const requestPath = `${target.pathname}${target.search}`
  options.path = requestPath
  options.headers = headersForGithubHost(target.hostname, requestPath, options.headers)
}

// 中止前先摘掉 error/abort，避免差分下载把这次主动中止当成失败。
function detachFailureListeners(request: RedirectableRequest): {
  errorListeners: RequestListener[]
  abortListeners: RequestListener[]
} {
  const errorListeners = copyListeners(request, ERROR_EVENT)
  const abortListeners = copyListeners(request, ABORT_EVENT)
  if (typeof request.removeAllListeners === 'function') {
    request.removeAllListeners(ERROR_EVENT)
    request.removeAllListeners(ABORT_EVENT)
  }
  return { errorListeners, abortListeners }
}

function stopRedirect(request: RedirectableRequest): void {
  const { errorListeners } = detachFailureListeners(request)
  const error = new Error(DIFFERENTIAL_REDIRECT_STOPPED)
  for (const listener of errorListeners) {
    listener(error)
  }
  if (typeof request.abort === 'function') {
    request.abort()
  }
}

function endRequest(request: unknown): void {
  if (isRecord(request) && typeof request.end === 'function') {
    request.end()
  }
}

function reissueWithoutToken(
  request: RedirectableRequest,
  options: AssetRequestOptions,
  target: URL,
  callback: unknown,
  createRequest: CreateRequest,
  executor: unknown,
  hop: number
): void {
  applyRedirectTarget(options, target)
  const { errorListeners, abortListeners } = detachFailureListeners(request)
  if (typeof request.abort === 'function') {
    request.abort()
  }
  // 必须保持原来的 this，ElectronHttpExecutor 用它取 net session。
  const next = guardPrivateGithubAssetRequest(
    createRequest.call(executor, options, callback),
    options,
    callback,
    createRequest,
    executor,
    hop + 1
  )
  if (isRedirectableRequest(next)) {
    for (const listener of errorListeners) {
      next.on(ERROR_EVENT, listener)
    }
    for (const listener of abortListeners) {
      next.on(ABORT_EVENT, listener)
    }
  }
  endRequest(next)
}

// 非 api.github.com 不调用原生 followRedirect。Range 和签名查询串留在新请求上。
export function guardPrivateGithubAssetRequest(
  request: unknown,
  options: AssetRequestOptions,
  callback: unknown,
  createRequest: CreateRequest,
  executor: unknown,
  hop = 0
): unknown {
  if (!isRedirectableRequest(request) || request.forkRedirectGuarded) {
    return request
  }
  request.forkRedirectGuarded = true
  let pendingRedirectUrl: string | undefined
  const originalOn = request.on.bind(request)
  const originalFollow = request.followRedirect.bind(request)
  const followWithoutToken = (redirectUrl: string | undefined): void => {
    const target = redirectTarget(redirectUrl)
    if (!target) {
      stopRedirect(request)
      return
    }
    if (target.hostname.toLowerCase() === GITHUB_API_HOSTNAME) {
      originalFollow()
      return
    }
    if (hop >= DIFFERENTIAL_REDIRECT_HOP_LIMIT) {
      stopRedirect(request)
      return
    }
    reissueWithoutToken(request, options, target, callback, createRequest, executor, hop)
  }
  request.followRedirect = () => {
    followWithoutToken(pendingRedirectUrl)
  }
  request.on = (event, listener) => {
    if (event !== REDIRECT_EVENT) {
      return originalOn(event, listener)
    }
    return originalOn(event, (...args: unknown[]) => {
      const redirectUrl = args[2]
      pendingRedirectUrl = typeof redirectUrl === 'string' ? redirectUrl : undefined
      listener(...args)
    })
  }
  if (hop > 0) {
    originalOn(REDIRECT_EVENT, (...args: unknown[]) => {
      const redirectUrl = args[2]
      followWithoutToken(typeof redirectUrl === 'string' ? redirectUrl : undefined)
    })
  }
  return request
}
