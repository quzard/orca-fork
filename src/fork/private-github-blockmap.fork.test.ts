import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORK_GITHUB_UPDATE_OWNER, FORK_GITHUB_UPDATE_REPO } from '../shared/fork-hooks/update-feed'
import { installPrivateGithubDifferentialDownload } from './private-github-blockmap'
import {
  BLOCKMAP_ASSET_MISSING_PREFIX,
  BLOCKMAP_ASSETS_NOT_LOADED,
  BLOCKMAP_FILE_SUFFIX,
  BLOCKMAP_INSTALLER_NOT_ASSET,
  GITHUB_API_HOSTNAME,
  GITHUB_RELEASE_ASSET_ACCEPT,
  GITHUB_RELEASE_ASSET_PATH_MARK,
  GITHUB_RELEASE_JSON_ACCEPT,
  GITHUB_RELEASE_TAG_PREFIX,
  MISSING_OLD_BLOCKMAP_ASSET_ID,
  OLD_BLOCKMAP_UNAVAILABLE_LOG,
  githubAssetAcceptHeaders,
  githubReleaseAssetId,
  githubReleaseTagUrl,
  resolvePrivateGithubBlockmapUrls,
  unavailableOldBlockmapUrl,
  type GithubReleaseAsset
} from './private-github-blockmap-urls'

const require = createRequire(import.meta.url)
const TOKEN = 'super-secret-value'
const OLD_VERSION = '1.4.228-local.1792224556040'
const NEW_VERSION = '1.4.228-local.1792227870418'
const ZIP_ID = '650040345'
const NEW_BLOCKMAP_ID = '650040346'
const DMG_BLOCKMAP_ID = '650040348'
const OLD_BLOCKMAP_ID = '649000111'
const ZIP_NAME = 'orca-macos-arm64.zip'
const BLOCKMAP_NAME = `${ZIP_NAME}${BLOCKMAP_FILE_SUFFIX}`
const BUG_BLOCKMAP_URL = `https://${GITHUB_API_HOSTNAME}/repos/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}${GITHUB_RELEASE_ASSET_PATH_MARK}${ZIP_ID}${BLOCKMAP_FILE_SUFFIX}`

function assetUrl(id: string): string {
  return `https://${GITHUB_API_HOSTNAME}/repos/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}${GITHUB_RELEASE_ASSET_PATH_MARK}${id}`
}

function asset(id: string, name: string, url = assetUrl(id)): GithubReleaseAsset {
  return { name, url }
}

function latestAssets(): GithubReleaseAsset[] {
  return [
    asset(ZIP_ID, ZIP_NAME),
    asset(NEW_BLOCKMAP_ID, BLOCKMAP_NAME),
    asset('650040347', 'orca-macos-arm64.dmg'),
    asset(DMG_BLOCKMAP_ID, 'orca-macos-arm64.dmg.blockmap')
  ]
}

function oldAssets(): GithubReleaseAsset[] {
  return [
    asset('649000100', ZIP_NAME),
    asset(OLD_BLOCKMAP_ID, BLOCKMAP_NAME),
    asset('649000112', 'orca-macos-arm64.dmg.blockmap')
  ]
}

function resolutionInput(
  overrides: Partial<Parameters<typeof resolvePrivateGithubBlockmapUrls>[0]> = {}
) {
  return {
    installerUrl: new URL(assetUrl(ZIP_ID)),
    latestAssets: latestAssets(),
    oldAssets: oldAssets(),
    oldVersion: OLD_VERSION,
    newVersion: NEW_VERSION,
    owner: FORK_GITHUB_UPDATE_OWNER,
    repo: FORK_GITHUB_UPDATE_REPO,
    apiHostname: GITHUB_API_HOSTNAME,
    ...overrides
  }
}

type HeaderMap = Record<string, string | string[] | undefined>

type ProviderHarness = {
  getLatestVersion: () => Promise<unknown>
  getBlockMapFiles: (baseUrl: URL, oldVersion: string, newVersion: string) => Promise<URL[]>
  configureHeaders: (accept: string) => HeaderMap
  httpRequest: (url: URL, headers: HeaderMap) => Promise<string>
  options: { owner: string; repo: string }
  basePath: string
  baseApiUrl: URL
  calls: { url: string; accept: unknown; authorization: unknown }[]
}

function createProvider(loadOld: () => Promise<string>): ProviderHarness {
  const calls: ProviderHarness['calls'] = []
  const provider: ProviderHarness = {
    options: { owner: FORK_GITHUB_UPDATE_OWNER, repo: FORK_GITHUB_UPDATE_REPO },
    basePath: `/repos/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}/releases`,
    baseApiUrl: new URL(`https://${GITHUB_API_HOSTNAME}`),
    calls,
    async getLatestVersion() {
      return { assets: latestAssets() }
    },
    getBlockMapFiles() {
      throw new Error('default blockmap urls must not be used')
    },
    configureHeaders(accept: string) {
      return { accept, authorization: `token ${TOKEN}` }
    },
    async httpRequest(url: URL, headers: HeaderMap) {
      calls.push({ url: url.href, accept: headers.accept, authorization: headers.authorization })
      return loadOld()
    }
  }
  return provider
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

describe('private GitHub blockmap urls', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves the old and new blockmap asset ids instead of appending .blockmap', () => {
    const [oldUrl, newUrl] = resolvePrivateGithubBlockmapUrls(resolutionInput())

    expect(oldUrl.href).toBe(assetUrl(OLD_BLOCKMAP_ID))
    expect(newUrl.href).toBe(assetUrl(NEW_BLOCKMAP_ID))
    expect(oldUrl.href).not.toBe(newUrl.href)
    expect(oldUrl.href).not.toBe(BUG_BLOCKMAP_URL)
    expect(newUrl.href).not.toBe(BUG_BLOCKMAP_URL)
    expect(newUrl.pathname.endsWith(BLOCKMAP_FILE_SUFFIX)).toBe(false)
    expect(newUrl.href).not.toContain(DMG_BLOCKMAP_ID)

    const [sameReleaseOld, sameReleaseNew] = resolvePrivateGithubBlockmapUrls(
      resolutionInput({ oldAssets: latestAssets() })
    )
    expect(sameReleaseOld.href).not.toBe(sameReleaseNew.href)
    expect(sameReleaseOld.href).toBe(
      unavailableOldBlockmapUrl(FORK_GITHUB_UPDATE_OWNER, FORK_GITHUB_UPDATE_REPO).href
    )
  })

  it('finds a versioned blockmap on the installed release when the file name contains the version', () => {
    const installerName = `Orca-${NEW_VERSION}-arm64-mac.zip`
    const [oldUrl, newUrl] = resolvePrivateGithubBlockmapUrls(
      resolutionInput({
        latestAssets: [
          asset(ZIP_ID, installerName),
          asset(NEW_BLOCKMAP_ID, `${installerName}${BLOCKMAP_FILE_SUFFIX}`)
        ],
        oldAssets: [
          asset(OLD_BLOCKMAP_ID, `Orca-${OLD_VERSION}-arm64-mac.zip${BLOCKMAP_FILE_SUFFIX}`)
        ]
      })
    )

    expect(githubReleaseAssetId(oldUrl.href)).toBe(OLD_BLOCKMAP_ID)
    expect(githubReleaseAssetId(newUrl.href)).toBe(NEW_BLOCKMAP_ID)
  })

  it('falls back when the new blockmap asset is missing or the installer url is not an asset', () => {
    expect(() =>
      resolvePrivateGithubBlockmapUrls(resolutionInput({ latestAssets: [asset(ZIP_ID, ZIP_NAME)] }))
    ).toThrow(`${BLOCKMAP_ASSET_MISSING_PREFIX}${BLOCKMAP_NAME}`)

    expect(() =>
      resolvePrivateGithubBlockmapUrls(resolutionInput({ installerUrl: new URL(BUG_BLOCKMAP_URL) }))
    ).toThrow(BLOCKMAP_INSTALLER_NOT_ASSET)

    try {
      resolvePrivateGithubBlockmapUrls(
        resolutionInput({
          latestAssets: [asset(ZIP_ID, ZIP_NAME)],
          oldAssets: null
        })
      )
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).not.toContain(TOKEN)
      expect(String(error)).not.toContain(BUG_BLOCKMAP_URL)
    }
  })

  it('does not use a blockmap url on another host, and uses a distinct placeholder when the old asset is missing', async () => {
    const evil = asset(
      NEW_BLOCKMAP_ID,
      BLOCKMAP_NAME,
      `https://evil.example${GITHUB_RELEASE_ASSET_PATH_MARK}${NEW_BLOCKMAP_ID}`
    )
    expect(() =>
      resolvePrivateGithubBlockmapUrls(
        resolutionInput({ latestAssets: [asset(ZIP_ID, ZIP_NAME), evil] })
      )
    ).toThrow(BLOCKMAP_ASSET_MISSING_PREFIX)

    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const provider = createProvider(async () => {
      throw new Error(`authorization token ${TOKEN}`)
    })
    installPrivateGithubDifferentialDownload({
      privateGithubPrototype: provider,
      httpExecutorPrototype: { createRequest: () => undefined }
    })
    await provider.getLatestVersion()
    const urls = await provider.getBlockMapFiles(
      new URL(assetUrl(ZIP_ID)),
      OLD_VERSION,
      NEW_VERSION
    )
    expect(urls[1].href).toBe(assetUrl(NEW_BLOCKMAP_ID))
    expect(urls[0].href).toBe(
      unavailableOldBlockmapUrl(FORK_GITHUB_UPDATE_OWNER, FORK_GITHUB_UPDATE_REPO).href
    )
    expect(urls[0].href).not.toBe(urls[1].href)
    expect(urls[0].pathname.endsWith(MISSING_OLD_BLOCKMAP_ASSET_ID)).toBe(true)
    expect(JSON.stringify(urls.map((url) => url.href))).not.toContain(TOKEN)
    expect(info).toHaveBeenCalledWith(OLD_BLOCKMAP_UNAVAILABLE_LOG)
    expect(info.mock.calls.flat().join('\n')).not.toContain(TOKEN)
  })

  it('requests the installed release tag with the json accept header and never puts the token in the url', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const provider = createProvider(async () => JSON.stringify({ assets: oldAssets() }))
    installPrivateGithubDifferentialDownload({
      privateGithubPrototype: provider,
      httpExecutorPrototype: { createRequest: () => undefined }
    })
    await provider.getLatestVersion()
    const [oldUrl, newUrl] = await provider.getBlockMapFiles(
      new URL(assetUrl(ZIP_ID)),
      OLD_VERSION,
      NEW_VERSION
    )

    expect(oldUrl.href).toBe(assetUrl(OLD_BLOCKMAP_ID))
    expect(newUrl.href).toBe(assetUrl(NEW_BLOCKMAP_ID))
    expect(provider.calls).toEqual([
      {
        url: githubReleaseTagUrl(provider.baseApiUrl, provider.basePath, OLD_VERSION).href,
        accept: GITHUB_RELEASE_JSON_ACCEPT,
        authorization: `token ${TOKEN}`
      }
    ])
    expect(provider.calls[0].url).toBe(
      `https://${GITHUB_API_HOSTNAME}/repos/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}/releases/tags/${GITHUB_RELEASE_TAG_PREFIX}${OLD_VERSION}`
    )
    expect(provider.calls[0].url).not.toContain(TOKEN)
    expect(info).not.toHaveBeenCalled()
  })

  it('patches electron-updater so the private provider resolves asset ids', async () => {
    installPrivateGithubDifferentialDownload()
    const providerModule: unknown = require('electron-updater/out/providers/PrivateGitHubProvider')
    const executorModule: unknown = require('electron-updater/out/electronHttpExecutor')
    if (!isRecord(providerModule) || typeof providerModule.PrivateGitHubProvider !== 'function') {
      throw new Error('PrivateGitHubProvider is unavailable')
    }
    if (!isRecord(executorModule) || typeof executorModule.ElectronHttpExecutor !== 'function') {
      throw new Error('ElectronHttpExecutor is unavailable')
    }
    const prototype: unknown = providerModule.PrivateGitHubProvider.prototype
    const executorPrototype: unknown = executorModule.ElectronHttpExecutor.prototype
    if (!isRecord(prototype) || !isRecord(executorPrototype)) {
      throw new Error('updater prototypes are unavailable')
    }
    expect(prototype.forkPrivateGithubBlockmapPatched).toBe(true)
    expect(executorPrototype.forkPrivateGithubBlockmapPatched).toBe(true)

    const provider = Object.assign(Object.create(prototype), {
      options: { owner: FORK_GITHUB_UPDATE_OWNER, repo: FORK_GITHUB_UPDATE_REPO },
      baseApiUrl: new URL(`https://${GITHUB_API_HOSTNAME}`),
      forkLatestReleaseAssets: latestAssets(),
      configureHeaders: () => ({ accept: GITHUB_RELEASE_JSON_ACCEPT }),
      httpRequest: async () => JSON.stringify({ assets: oldAssets() })
    })
    if (typeof provider.getBlockMapFiles !== 'function') {
      throw new Error('patched getBlockMapFiles is missing')
    }
    const urls: unknown = await provider.getBlockMapFiles(
      new URL(assetUrl(ZIP_ID)),
      OLD_VERSION,
      NEW_VERSION
    )
    if (!Array.isArray(urls) || !(urls[0] instanceof URL) || !(urls[1] instanceof URL)) {
      throw new Error('patched getBlockMapFiles did not return urls')
    }
    expect(urls[0].href).toBe(assetUrl(OLD_BLOCKMAP_ID))
    expect(urls[1].href).toBe(assetUrl(NEW_BLOCKMAP_ID))
    expect(urls[1].href).not.toBe(BUG_BLOCKMAP_URL)
  })

  it('throws a token-free error when release assets were not loaded', async () => {
    const provider = createProvider(async () => '{}')
    installPrivateGithubDifferentialDownload({
      privateGithubPrototype: provider,
      httpExecutorPrototype: { createRequest: () => undefined }
    })
    await expect(
      provider.getBlockMapFiles(new URL(assetUrl(ZIP_ID)), OLD_VERSION, NEW_VERSION)
    ).rejects.toThrow(BLOCKMAP_ASSETS_NOT_LOADED)
  })

  it('keeps application/octet-stream on asset requests and strips the token on the signed redirect', () => {
    const seen: HeaderMap[] = []
    const executor = {
      createRequest(options: { hostname?: string; path?: string; headers?: HeaderMap | null }) {
        if (options.headers) {
          seen.push(options.headers)
        }
        return options
      }
    }
    installPrivateGithubDifferentialDownload({
      privateGithubPrototype: createProvider(async () => '{}'),
      httpExecutorPrototype: executor
    })
    installPrivateGithubDifferentialDownload({
      privateGithubPrototype: createProvider(async () => '{}'),
      httpExecutorPrototype: executor
    })
    executor.createRequest({
      hostname: GITHUB_API_HOSTNAME,
      path: new URL(assetUrl(NEW_BLOCKMAP_ID)).pathname,
      headers: { accept: '*/*', Accept: 'application/json', authorization: `token ${TOKEN}` }
    })
    executor.createRequest({
      hostname: GITHUB_API_HOSTNAME,
      path: `/repos/${FORK_GITHUB_UPDATE_OWNER}/${FORK_GITHUB_UPDATE_REPO}/releases`,
      headers: { accept: GITHUB_RELEASE_JSON_ACCEPT }
    })

    expect(seen[0]).toEqual({
      accept: GITHUB_RELEASE_ASSET_ACCEPT,
      authorization: `token ${TOKEN}`
    })
    expect(seen[1]).toEqual({ accept: GITHUB_RELEASE_JSON_ACCEPT })
    expect(
      githubAssetAcceptHeaders(GITHUB_API_HOSTNAME, new URL(BUG_BLOCKMAP_URL).pathname, {})
    ).toBeNull()

    const runtime: unknown = require('builder-util-runtime')
    const executorCtor: unknown = isRecord(runtime) ? runtime.HttpExecutor : undefined
    if (typeof executorCtor !== 'function' || !('prepareRedirectUrlOptions' in executorCtor)) {
      throw new Error('HttpExecutor is unavailable')
    }
    const prepare: unknown = executorCtor.prepareRedirectUrlOptions
    if (typeof prepare !== 'function') {
      throw new Error('prepareRedirectUrlOptions is unavailable')
    }
    const signed =
      'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc'
    const prepared: unknown = prepare(signed, {
      protocol: 'https:',
      hostname: GITHUB_API_HOSTNAME,
      path: new URL(assetUrl(NEW_BLOCKMAP_ID)).pathname,
      headers: {
        accept: GITHUB_RELEASE_ASSET_ACCEPT,
        authorization: `token ${TOKEN}`
      }
    })
    if (!isRecord(prepared) || !isRecord(prepared.headers)) {
      throw new Error('redirect options have no headers')
    }
    expect(prepared.headers.authorization).toBeUndefined()
    expect(prepared.headers.accept).toBe(GITHUB_RELEASE_ASSET_ACCEPT)
    expect(String(prepared.path)).toContain('X-Amz-Signature=abc')
    expect(JSON.stringify(prepared)).not.toContain(TOKEN)
  })
})
