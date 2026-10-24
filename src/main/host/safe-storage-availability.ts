import { safeStorage } from 'electron'
import { readGuardedSecretBackend } from '../../shared/fork-hooks/desktop-secret-store'

let withheldReason: string | null = null

/** Withhold synchronous safeStorage calls after a probe finds an unreachable keychain, avoiding headless prompt hangs. */
export function withholdSafeStorage(reason: string): void {
  withheldReason ??= reason
}

export function safeStorageWithheldReason(): string | null {
  // fork: a file backend is the credential store, so a keychain withhold does not apply.
  return readGuardedSecretBackend() ? null : withheldReason
}

export class SafeStorageWithheldError extends Error {
  constructor(reason: string) {
    super(`secrets_unavailable: ${reason}`)
    this.name = 'SafeStorageWithheldError'
  }
}

/** `safeStorage` behind the run-wide withhold; use this, never `electron.safeStorage`. */
export const guardedSafeStorage = {
  isEncryptionAvailable(): boolean {
    const backend = readGuardedSecretBackend()
    if (backend) {
      return backend.isEncryptionAvailable()
    }
    return withheldReason === null && safeStorage.isEncryptionAvailable()
  },
  encryptString(plainText: string): Buffer {
    const backend = readGuardedSecretBackend()
    if (backend) {
      return backend.encryptString(plainText)
    }
    if (withheldReason !== null) {
      throw new SafeStorageWithheldError(withheldReason)
    }
    return safeStorage.encryptString(plainText)
  },
  decryptString(cipher: Buffer): string {
    const backend = readGuardedSecretBackend()
    if (backend) {
      return backend.decryptString(cipher)
    }
    if (withheldReason !== null) {
      throw new SafeStorageWithheldError(withheldReason)
    }
    return safeStorage.decryptString(cipher)
  }
}

export function resetSafeStorageWithholdForTests(): void {
  withheldReason = null
}
