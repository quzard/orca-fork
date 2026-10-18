import { afterEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`sealed:${value}`)),
  decryptString: vi.fn((cipher: Buffer) => cipher.toString().replace('sealed:', ''))
}))
vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

const {
  guardedSafeStorage,
  resetSafeStorageWithholdForTests,
  safeStorageWithheldReason,
  withholdSafeStorage
} = await import('../../main/host/safe-storage-availability')
const { registerGuardedSecretBackend } =
  await import('../../shared/fork-hooks/desktop-secret-store')

describe('guardedSafeStorage with a fork file backend', () => {
  afterEach(() => {
    resetSafeStorageWithholdForTests()
    registerGuardedSecretBackend(undefined)
    vi.clearAllMocks()
  })

  it('sends plugin and account calls through a registered file backend', () => {
    registerGuardedSecretBackend({
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`file:${value}`),
      decryptString: (cipher) => cipher.toString().replace('file:', '')
    })
    withholdSafeStorage('no default keychain')

    expect(safeStorageWithheldReason()).toBeNull()
    expect(guardedSafeStorage.isEncryptionAvailable()).toBe(true)
    expect(guardedSafeStorage.decryptString(guardedSafeStorage.encryptString('token'))).toBe(
      'token'
    )
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled()
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })

  it('keeps the keychain withhold when no backend is registered', () => {
    withholdSafeStorage('no default keychain')
    expect(safeStorageWithheldReason()).toBe('no default keychain')
    expect(guardedSafeStorage.isEncryptionAvailable()).toBe(false)
  })
})
