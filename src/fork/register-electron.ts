// fork: Electron-only secret store. orcad must not import this file.

import {
  registerDesktopSecretStore,
  registerGuardedSecretBackend
} from '../shared/fork-hooks/desktop-secret-store'
import { createForkDesktopSecretStore } from './desktop-secret-store'
import { MacosFileSecretStore } from './macos-file-secret-store'

/** Desktop main process, before preflight. Not called from orcad. */
export function registerForkElectronModules(): void {
  registerDesktopSecretStore(() => {
    const store = createForkDesktopSecretStore()
    // Plugin secrets and cloud sessions call guardedSafeStorage, not the desktop store.
    registerGuardedSecretBackend(store instanceof MacosFileSecretStore ? store : undefined)
    return store
  })
}
