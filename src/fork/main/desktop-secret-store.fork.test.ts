import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  app: { isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`keychain:${value}`)),
    decryptString: vi.fn((cipher: Buffer) => cipher.toString().replace('keychain:', ''))
  }
}))
vi.mock('electron', () => electron)

const { LOCAL_SECRET_STORAGE } = await import('./macos-file-secret-store')
const {
  createPackagedMacosSecretStore,
  macosFileSecretDirectory,
  routeGuardedSafeStorage,
  usesPackagedMacosFileSecretStore
} = await import('./desktop-secret-store')
const { guardedSafeStorage, resetSafeStorageWithholdForTests, withholdSafeStorage } =
  await import('../../main/host/safe-storage-availability')
const { registerDesktopSecretStore, registeredDesktopSecretStore } =
  await import('../../shared/fork-hooks/desktop-secret-store')

const fileStore = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`file:${value}`),
  decryptString: (cipher: Buffer) => cipher.toString().replace('file:', ''),
  describeProtectionGap: () => null
}

afterEach(() => {
  resetSafeStorageWithholdForTests()
  vi.clearAllMocks()
})

describe('packaged macOS file secret store', () => {
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

  it('leaves preflight on the keychain store unless a packaged Mac app registered the file store', () => {
    expect(registeredDesktopSecretStore()).toBeNull()
    registerDesktopSecretStore(createPackagedMacosSecretStore)
    expect(registeredDesktopSecretStore()).toBeNull()
    registerDesktopSecretStore(() => fileStore)
    expect(registeredDesktopSecretStore()).toBe(fileStore)
  })

  // Last: routing replaces the methods on upstream's shared guardedSafeStorage object for the run.
  it('sends guardedSafeStorage callers to the file store, past a keychain withhold', () => {
    withholdSafeStorage('no default keychain')
    expect(guardedSafeStorage.isEncryptionAvailable()).toBe(false)
    routeGuardedSafeStorage(fileStore)
    expect(guardedSafeStorage.isEncryptionAvailable()).toBe(true)
    const sealed = guardedSafeStorage.encryptString('token')
    expect(sealed.toString()).toBe('file:token')
    expect(guardedSafeStorage.decryptString(sealed)).toBe('token')
    expect(electron.safeStorage.encryptString).not.toHaveBeenCalled()
    expect(electron.safeStorage.decryptString).not.toHaveBeenCalled()
  })
})
