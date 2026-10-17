// fork: Electron-only secret store. orcad must not import this file.

import {
  registerDesktopSecretStore,
  registerGuardedSecretBackend
} from '../shared/fork-hooks/desktop-secret-store'
import { createForkDesktopSecretStore } from './desktop-secret-store'
import { registerForkGithubUpdateTokenIpc } from './github-update-token-ipc'
import { MacosFileSecretStore } from './macos-file-secret-store'
import { registerForkGithubUpdateFeed } from './update-feed'

/** Desktop main process, before preflight. Not called from orcad. */
export function registerForkElectronModules(): void {
  registerDesktopSecretStore(() => {
    const store = createForkDesktopSecretStore()
    // Plugin secrets and cloud sessions call guardedSafeStorage, not the desktop store.
    registerGuardedSecretBackend(store instanceof MacosFileSecretStore ? store : undefined)
    return store
  })
  // 令牌文件和私有发布源只在桌面进程登记。orcad 不检查 GitHub 更新。
  registerForkGithubUpdateTokenIpc()
  registerForkGithubUpdateFeed()
}
