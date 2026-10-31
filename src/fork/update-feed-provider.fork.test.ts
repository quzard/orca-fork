import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from 'electron-updater/out/providerFactory'
import { forkUpdateFeed, registerForkBuild } from '../shared/fork-hooks/update-feed'

const ENV_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN'] as const
const saved = Object.fromEntries(ENV_TOKENS.map((name) => [name, process.env[name]]))

type SeenRequest = { url: string; headers: Record<string, string> }

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <link rel="alternate" type="text/html" href="https://github.com/quzard/orca-fork/releases/tag/v1.4.229-local.2.bbbbbbbbbbbb"/>
    <title>v1.4.229-local.2.bbbbbbbbbbbb</title>
    <content>notes</content>
  </entry>
</feed>`

const CHANNEL_FILE = `version: 1.4.229-local.2.bbbbbbbbbbbb
files:
  - url: Orca-1.4.229-local.2.bbbbbbbbbbbb-arm64-mac.zip
    sha512: abc
    size: 1
path: Orca-1.4.229-local.2.bbbbbbbbbbbb-arm64-mac.zip
sha512: abc
releaseDate: '2026-10-17T00:00:00.000Z'
`

function recordingProvider(seen: SeenRequest[]): {
  constructor: { name: string }
  getLatestVersion: () => Promise<{ version: string }>
  resolveFiles: (info: unknown) => { url: URL }[]
} {
  const executor = {
    request: async (options: {
      protocol?: string
      hostname?: string
      path?: string
      headers?: Record<string, string>
    }) => {
      const url = `${options.protocol}//${options.hostname}${options.path}`
      seen.push({ url, headers: { ...options.headers } })
      return options.path?.endsWith('.atom') ? ATOM : CHANNEL_FILE
    }
  }
  const updater = { allowPrerelease: true, currentVersion: '1.4.228-local.1.aaaaaaaaaaaa' }
  const runtime = { executor, platform: 'darwin', isUseMultipleRangeRequest: false }
  const feed = forkUpdateFeed()
  if (!feed) {
    throw new Error('register the fork build first')
  }
  return createClient(feed, updater as never, runtime as never) as never
}

describe('fork update feed provider', () => {
  afterEach(() => {
    registerForkBuild(false)
    for (const name of ENV_TOKENS) {
      if (saved[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = saved[name]
      }
    }
  })

  it('has no feed until a fork build registers, then only the public quzard/orca-fork one', () => {
    expect(forkUpdateFeed()).toBeNull()
    registerForkBuild()
    const feed = forkUpdateFeed()
    expect(feed).toEqual({ provider: 'github', owner: 'quzard', repo: 'orca-fork', private: false })
    // A caller mutating its copy cannot leak a token into the next one.
    Object.assign(feed ?? {}, { token: 'x' })
    expect(forkUpdateFeed()).not.toHaveProperty('token')
  })

  it('reads quzard/orca-fork anonymously, ignoring GH_TOKEN / GITHUB_TOKEN', async () => {
    registerForkBuild()
    process.env.GH_TOKEN = 'env-token-must-not-be-used'
    process.env.GITHUB_TOKEN = 'env-token-must-not-be-used'
    const seen: SeenRequest[] = []
    const provider = recordingProvider(seen)
    expect(provider.constructor.name).toBe('GitHubProvider')

    const info = await provider.getLatestVersion()
    expect(info.version).toBe('1.4.229-local.2.bbbbbbbbbbbb')
    const files = provider.resolveFiles(info)

    expect(seen.length).toBeGreaterThanOrEqual(2)
    for (const request of seen) {
      expect(request.url.startsWith('https://github.com/quzard/orca-fork/releases')).toBe(true)
      expect(Object.keys(request.headers).map((key) => key.toLowerCase())).not.toContain(
        'authorization'
      )
      expect(JSON.stringify(request)).not.toContain('env-token-must-not-be-used')
    }
    for (const file of files) {
      expect(String(file.url)).toMatch(
        /^https:\/\/github\.com\/quzard\/orca-fork\/releases\/download\//
      )
    }
    expect(JSON.stringify(seen)).not.toMatch(/stablyai|onorca|api\.github\.com/)
  })
})
