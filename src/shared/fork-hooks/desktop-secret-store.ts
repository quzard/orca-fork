// fork (F038): the desktop SecretStore preflight installs. Unregistered, or when the factory
// declines, preflight constructs upstream's ElectronSecretStore.
import type { SecretStore } from '../secret-store'

let factory: (() => SecretStore | null) | undefined

export function registerDesktopSecretStore(next: () => SecretStore | null): void {
  factory = next
}

export function registeredDesktopSecretStore(): SecretStore | null {
  return factory?.() ?? null
}
