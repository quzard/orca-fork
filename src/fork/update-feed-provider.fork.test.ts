import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from 'electron-updater/out/providerFactory'
import { forkGithubUpdateFeed } from './update-feed'

const ENV_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN'] as const
const saved = Object.fromEntries(ENV_TOKENS.map((name) => [name, process.env[name]]))

function client(token: string | undefined): { constructor: { name: string }; baseUrl: URL } {
  const updater = { allowPrerelease: true, currentVersion: '1.4.228-local.1.abcdef123456' }
  const runtime = { executor: {}, platform: 'darwin', isUseMultipleRangeRequest: false }
  return createClient(forkGithubUpdateFeed(token), updater as never, runtime as never) as never
}

describe('fork update feed provider selection', () => {
  afterEach(() => {
    for (const name of ENV_TOKENS) {
      if (saved[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = saved[name]
      }
    }
  })

  it('uses the public GitHub provider for quzard/orca-fork without a token, even with GH_TOKEN set', () => {
    process.env.GH_TOKEN = 'env-token-must-not-be-used'
    process.env.GITHUB_TOKEN = 'env-token-must-not-be-used'
    const provider = client(undefined)
    expect(provider.constructor.name).toBe('GitHubProvider')
    expect(String(provider.baseUrl)).toBe('https://github.com/')
    expect(JSON.stringify(forkGithubUpdateFeed(undefined))).not.toContain('stablyai')
  })

  it('uses the private GitHub provider when the token file has a value', () => {
    delete process.env.GH_TOKEN
    delete process.env.GITHUB_TOKEN
    expect(client('github_pat_test').constructor.name).toBe('PrivateGitHubProvider')
  })
})
