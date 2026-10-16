import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCAL_SECRET_STORAGE } from './macos-file-secret-store'
import { macosFileSecretDirectory, usesPackagedMacosFileSecretStore } from './desktop-secret-store'

describe('packaged macOS file secret store gate', () => {
  it('replaces the keychain only for a packaged macOS app that is not an isolated profile', () => {
    expect(
      usesPackagedMacosFileSecretStore({ platform: 'darwin', packaged: true, isolated: false })
    ).toBe(true)
    expect(
      usesPackagedMacosFileSecretStore({ platform: 'darwin', packaged: false, isolated: false })
    ).toBe(false)
    expect(
      usesPackagedMacosFileSecretStore({ platform: 'darwin', packaged: true, isolated: true })
    ).toBe(false)
    expect(
      usesPackagedMacosFileSecretStore({ platform: 'linux', packaged: true, isolated: false })
    ).toBe(false)
    expect(macosFileSecretDirectory('/Users/example')).toBe(
      join('/Users/example', LOCAL_SECRET_STORAGE.root, LOCAL_SECRET_STORAGE.directory)
    )
    expect(macosFileSecretDirectory()).toBe(
      join(homedir(), LOCAL_SECRET_STORAGE.root, LOCAL_SECRET_STORAGE.directory)
    )
  })
})
