// fork: Electron-only secret store. orcad must not import this file.

import {
  registerDesktopSecretStore,
  registerGuardedSecretBackend
} from '../shared/fork-hooks/desktop-secret-store'
import { createForkDesktopSecretStore } from './desktop-secret-store'
import { MacosFileSecretStore } from './macos-file-secret-store'
import { registerForkUpdateFeed } from '../shared/fork-hooks/update-feed'
import { registerComputerUsePermissionHelperArgs } from '../shared/fork-hooks/computer-use-permission'
import { FORK_PERMISSION_DRAG_CARD_ARG } from './computer-use/permission-card'

/** Desktop main process, before preflight. Not called from orcad. */
export function registerForkElectronModules(): void {
  registerDesktopSecretStore(() => {
    const store = createForkDesktopSecretStore()
    // Plugin secrets and cloud sessions call guardedSafeStorage, not the desktop store.
    registerGuardedSecretBackend(store instanceof MacosFileSecretStore ? store : undefined)
    return store
  })
  // 更新源只在桌面进程登记：匿名读 quzard/orca-fork 的公开 Releases。orcad 不检查更新。
  registerForkUpdateFeed()
  // F006：权限窗口显示可拖拽的应用卡片，只在还缺权限时出现。
  registerComputerUsePermissionHelperArgs([FORK_PERMISSION_DRAG_CARD_ARG])
}
