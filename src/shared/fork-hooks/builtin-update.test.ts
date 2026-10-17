import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { upstreamStableSupersedesForkBuild } from './builtin-update'

const updaterRequire = createRequire(
  new URL('../../../node_modules/electron-updater/package.json', import.meta.url)
)

describe('fork builtin update versions', () => {
  it('treats an upstream stable release as newer than the fork local prerelease', () => {
    expect(upstreamStableSupersedesForkBuild('1.4.228-local.1.abcdef', '1.4.228')).toBe(true)
    expect(upstreamStableSupersedesForkBuild('1.4.228-local.1.abcdef', '1.4.229')).toBe(true)
    expect(
      upstreamStableSupersedesForkBuild('1.4.228-local.2.abcdef', '1.4.228-local.1.ffffff')
    ).toBe(false)
  })

  it('sorts a later local build above an earlier one with electron-updater semver', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: electron-updater 依赖 semver 7，gt / prerelease 就是 isUpdateAvailable 用的比较。
    const semver = updaterRequire('semver') as {
      gt: (left: string, right: string) => boolean
      prerelease: (version: string) => readonly (string | number)[] | null
    }
    const earlier = '1.4.228-local.1000.aaa'
    const later = '1.4.228-local.2000.bbb'
    expect(semver.prerelease(later)?.[0]).toBe('local')
    expect(semver.gt(later, earlier)).toBe(true)
    expect(semver.gt(earlier, later)).toBe(false)
    expect(semver.gt('1.4.228', later)).toBe(true)
  })
})
