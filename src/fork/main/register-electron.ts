// fork: Electron main only (secret store, permission helper). orcad must not import this file.

import { registerDesktopSecretStore } from '../../shared/fork-hooks/desktop-secret-store'
import { registerForkModules } from '../register'
import { registerForkMainModules } from './register-main'
import { createPackagedMacosSecretStore } from './desktop-secret-store'
import { registerComputerUsePermissionHelperArgs } from '../../shared/fork-hooks/computer-use-permission'
import { FORK_PERMISSION_DRAG_CARD_ARG } from '../computer-use/permission-card'
import { registerHostFileDocPreviewRead } from '../../shared/fork-hooks/host-file-doc-preview'
import { readGrantedHostDocPreview } from './host-file-doc-preview-read'

/** Desktop main process entry (src/main/index.ts), before preflight. Not called from orcad. */
export function registerForkDesktopMain(): void {
  registerForkModules()
  registerForkElectronModules()
  registerForkMainModules()
}

function registerForkElectronModules(): void {
  registerDesktopSecretStore(createPackagedMacosSecretStore)
  // F006：权限窗口显示可拖拽的应用卡片，只在还缺权限时出现。
  registerComputerUsePermissionHelperArgs([FORK_PERMISSION_DRAG_CARD_ARG])
  // F046：工作区外的服务器文档在桌面预览，逐个文件经主机授权读取。
  registerHostFileDocPreviewRead(readGrantedHostDocPreview)
}
