// fork: 桌面密钥后端。未登记时使用调用方传入的 Electron safeStorage 实现。
import type { SecretStore } from '../secret-store'

type SecretStoreFactory = () => SecretStore

export type GuardedSecretBackend = {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(cipher: Buffer): string
}

let factory: SecretStoreFactory | undefined
let guardedBackend: GuardedSecretBackend | undefined

export function registerDesktopSecretStore(next: SecretStoreFactory): void {
  factory = next
}

export function createDesktopSecretStore(fallback: SecretStoreFactory): SecretStore {
  return (factory ?? fallback)()
}

/** Plugins and account sessions call guardedSafeStorage directly. Unset keeps the keychain. */
export function registerGuardedSecretBackend(next: GuardedSecretBackend | undefined): void {
  guardedBackend = next
}

export function readGuardedSecretBackend(): GuardedSecretBackend | undefined {
  return guardedBackend
}
