import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forkGithubUpdateFeed } from './update-feed'
import { installPrivateGithubDifferentialDownload } from './private-github-blockmap'
import {
  FORK_UPDATE_TOKEN_REJECTED_LOG,
  TOKEN_FALLBACK_NOT_INSTALLED_LOG,
  anonymousFeedOptions,
  installPrivateGithubTokenFallback,
  type AnonymousGithubProvider
} from './private-github-token-fallback'

const require = createRequire(import.meta.url)
const updaterRequire = createRequire(require.resolve('electron-updater'))
const { HttpError } = updaterRequire('builder-util-runtime') as {
  HttpError: new (statusCode: number) => Error
}
const { PrivateGitHubProvider } = require('electron-updater/out/providers/PrivateGitHubProvider')
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider')

const TOKEN = 'github_pat_rejected_test_value'
const CURRENT = '1.4.228-local.1.abcdef123456'
const NEXT_TAG = 'v1.4.229-local.2.abcdef123456'
const ZIP = 'orca-macos-arm64.zip'
const RELEASES = 'https://github.com/quzard/orca-fork/releases'

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>1</id><link rel="alternate" type="text/html" href="${RELEASES}/tag/${NEXT_TAG}"/><title>${NEXT_TAG}</title><content>No content.</content></entry></feed>`

const YML = `version: ${NEXT_TAG.slice(1)}
files:
  - url: ${ZIP}
    sha512: abc
    size: 1
path: ${ZIP}
sha512: abc
releaseDate: '2026-10-17T00:00:00.000Z'
`

type Call = { url: string; headers: Record<string, unknown> }
type RequestOptions = {
  protocol?: string
  hostname?: string
  path?: string
  headers?: Record<string, unknown>
}

// 每个用例一个子类，补丁只装在子类原型上，不影响真实的 PrivateGitHubProvider。
function setup(apiStatus: number) {
  const calls: Call[] = []
  const executor = {
    request: async (options: RequestOptions) => {
      const url = `${options.protocol}//${options.hostname}${options.path}`
      calls.push({ url, headers: { ...options.headers } })
      if (options.hostname === 'api.github.com') {
        throw new HttpError(apiStatus)
      }
      if (url === `${RELEASES}.atom`) {
        return ATOM
      }
      if (url === `${RELEASES}/download/${NEXT_TAG}/local-mac.yml`) {
        return YML
      }
      throw new HttpError(404)
    }
  }
  class TestPrivateProvider extends PrivateGitHubProvider {}
  installPrivateGithubDifferentialDownload({
    privateGithubPrototype: TestPrivateProvider.prototype,
    httpExecutorPrototype: { createRequest: () => undefined }
  })
  installPrivateGithubTokenFallback({
    privateGithubPrototype: TestPrivateProvider.prototype,
    createAnonymousProvider: (options, updater, runtimeOptions) =>
      new GitHubProvider(options, updater, runtimeOptions) as AnonymousGithubProvider
  })
  const updater = { allowPrerelease: true, currentVersion: CURRENT, channel: null }
  const runtime = { executor, platform: 'darwin', isUseMultipleRangeRequest: false }
  const provider = new TestPrivateProvider(forkGithubUpdateFeed(TOKEN), updater, TOKEN, runtime)
  provider.setRequestHeaders(null)
  return { calls, provider }
}

function authorizationOf(call: Call): unknown {
  return Object.entries(call.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1]
}

describe('fork update token rejected by GitHub', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([401, 403])(
    'falls back to the anonymous public provider for this check on HTTP %i',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const info = vi.spyOn(console, 'info').mockImplementation(() => {})
      const { calls, provider } = setup(status)

      const result = (await provider.getLatestVersion()) as { version: string; tag: string }

      expect(result.version).toBe(NEXT_TAG.slice(1))
      expect(
        calls[0].url.startsWith('https://api.github.com/repos/quzard/orca-fork/releases')
      ).toBe(true)
      const anonymous = calls.slice(1)
      expect(anonymous.map((call) => call.url)).toEqual([
        `${RELEASES}.atom`,
        `${RELEASES}/download/${NEXT_TAG}/local-mac.yml`
      ])
      for (const call of anonymous) {
        expect(authorizationOf(call)).toBeUndefined()
      }
      const files = provider.resolveFiles(result) as { url: URL }[]
      expect(files[0].url.href).toBe(`${RELEASES}/download/${NEXT_TAG}/${ZIP}`)
      expect(provider.fileExtraDownloadHeaders).toBeNull()
      const [, newBlockmap] = await provider.getBlockMapFiles(files[0].url, CURRENT, result.version)
      expect(newBlockmap.href).toBe(`${RELEASES}/download/${NEXT_TAG}/${ZIP}.blockmap`)

      expect(warn).toHaveBeenCalledWith(`${FORK_UPDATE_TOKEN_REJECTED_LOG} (HTTP ${status})`)
      const logged = JSON.stringify([...warn.mock.calls, ...info.mock.calls])
      expect(logged).not.toContain(TOKEN)
      expect(JSON.stringify(calls.map((call) => call.url))).not.toContain('stablyai')
      expect(JSON.stringify(calls.map((call) => call.url))).not.toContain('onorca')
    }
  )

  it('rethrows other failures, keeps the token headers, and retries the token on the next check', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rejected = setup(401)
    await rejected.provider.getLatestVersion()
    expect(rejected.provider.fileExtraDownloadHeaders).toBeNull()

    const failing = setup(500)
    warn.mockClear()
    await expect(failing.provider.getLatestVersion()).rejects.toThrow()
    expect(failing.calls).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
    expect(authorizationOf({ url: '', headers: failing.provider.fileExtraDownloadHeaders })).toBe(
      `token ${TOKEN}`
    )
  })

  it('clears the anonymous fallback when the next check on the same provider starts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { calls, provider } = setup(401)
    await provider.getLatestVersion()
    expect(provider.fileExtraDownloadHeaders).toBeNull()
    const before = calls.length
    await provider.getLatestVersion()
    // 第二次检查先用令牌请求 API，再回落匿名。
    expect(calls[before].url.startsWith('https://api.github.com/')).toBe(true)
    expect(authorizationOf(calls[before])).toBe(`token ${TOKEN}`)
  })

  it('drops the token from the anonymous provider options', () => {
    const options = anonymousFeedOptions({ ...forkGithubUpdateFeed(TOKEN) })
    expect(options).toEqual({
      provider: 'github',
      owner: 'quzard',
      repo: 'orca-fork',
      private: false
    })
    expect(JSON.stringify(options)).not.toContain(TOKEN)
  })

  it('installs on the real electron-updater providers', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    installPrivateGithubTokenFallback()
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining(TOKEN_FALLBACK_NOT_INSTALLED_LOG))
    expect(PrivateGitHubProvider.prototype.forkTokenFallbackPatched).toBe(true)
  })
})
