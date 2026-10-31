// fork: main-process registrations. Imported from the desktop and from orcad, before scans.

import { registerAiVaultServiceHeap } from '../../shared/fork-hooks/ai-vault'
import { registerDeferBrowserSessionProxy } from '../../shared/fork-hooks/startup'
import { aiVaultServiceHeapMiB } from './ai-vault/heap'
import { installAiVaultForkServicePolicy } from './ai-vault/service-policy'
import { getGitRepoRoot } from '../../main/git/repo-detection'
import { registerImportedWorktreePath } from '../../shared/fork-hooks/imported-worktree-path'
import { registerForkBuild } from '../../shared/fork-hooks/update-feed'
import { registerKeepFolderWorkspacesOnGroupDeleteInMain } from '../../shared/fork-hooks/project-group-delete'
import { registerReusedPathUnarchive } from '../../shared/fork-hooks/reused-path-unarchive'
import { keepFolderWorkspacesOnGroupDelete } from './project-group-delete'
import { registerEgoLiteCookieBrowser } from '../ego-lite-cookie-browser'

/** Desktop and orcad. The renderer must not import this file. */
export function registerForkMainModules(): void {
  // orcad 不走 registerForkModules，这里也登记，免得它去拉上游的 agent 状态规则。
  registerForkBuild()
  // orcad 不走 registerForkModules。远端导入在这台机器上发现浏览器，所以这里也登记。
  registerEgoLiteCookieBrowser()
  installAiVaultForkServicePolicy()
  registerAiVaultServiceHeap(() => aiVaultServiceHeapMiB())
  registerDeferBrowserSessionProxy(true)
  registerImportedWorktreePath(getGitRepoRoot)
  registerKeepFolderWorkspacesOnGroupDeleteInMain(keepFolderWorkspacesOnGroupDelete)
  registerReusedPathUnarchive()
}

/**
 * orcad: the fork's registrations, then the host adapters. One call, so orcad-entry.ts stays within
 * its 300-line limit with upstream's lines unchanged.
 */
export function installForkOrcadHost(installHostAdapters: () => void): void {
  registerForkMainModules()
  installHostAdapters()
}

// 转出给 orcad-entry 已有的那一行 import。监听地址和终端准入不是 fork 行为，只为留在 300 行上限内。
export { resolveOrcadServeBind } from './orcad-serve-bind'
