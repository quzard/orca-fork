import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { guardedSafeStorage } from '../../main/host/safe-storage-availability'
import { usesIsolatedProfile } from '../../shared/electron-isolated-profile-switches'
import type { SecretStore } from '../../shared/secret-store'
import { LOCAL_SECRET_STORAGE, MacosFileSecretStore } from './macos-file-secret-store'

export function usesPackagedMacosFileSecretStore(input: {
  platform: string
  packaged: boolean
  isolated: boolean
}): boolean {
  return input.platform === 'darwin' && input.packaged && !input.isolated
}

export function macosFileSecretDirectory(home = homedir()): string {
  return join(home, LOCAL_SECRET_STORAGE.root, LOCAL_SECRET_STORAGE.directory)
}

/**
 * Plugin secrets and account sessions call guardedSafeStorage directly, not the desktop store.
 * `satisfies` fails the typecheck if upstream adds a method this would leave on the keychain.
 */
export function routeGuardedSafeStorage(store: SecretStore): void {
  Object.assign(guardedSafeStorage, {
    isEncryptionAvailable: () => store.isEncryptionAvailable(),
    encryptString: (plainText: string) => store.encryptString(plainText),
    decryptString: (cipher: Buffer) => store.decryptString(cipher)
  } satisfies typeof guardedSafeStorage)
}

/** Runs in preflight. Null keeps upstream's keychain-backed store (dev, isolated profiles). */
export function createPackagedMacosSecretStore(): SecretStore | null {
  const gate = {
    platform: process.platform,
    packaged: app.isPackaged,
    isolated: usesIsolatedProfile()
  }
  if (!usesPackagedMacosFileSecretStore(gate)) {
    return null
  }
  const store = new MacosFileSecretStore(macosFileSecretDirectory())
  routeGuardedSafeStorage(store)
  return store
}
