// fork: main-process registrations. Imported from the desktop and from orcad, before scans.

import { registerAiVaultServiceHeap } from '../../shared/fork-hooks/ai-vault'
import { registerDeferBrowserSessionProxy } from '../../shared/fork-hooks/startup'
import { registerTerminalWorkspaceResolver } from '../../shared/fork-hooks/terminal-lifecycle'
import { aiVaultServiceHeapMiB } from './ai-vault/heap'
import { installAiVaultForkServicePolicy } from './ai-vault/service-policy'
import { resolveFolderTerminalWorkspace } from '../terminal/folder-workspace-resolver'
import { getGitRepoRoot } from '../../main/git/repo-detection'
import { registerImportedWorktreePath } from '../../shared/fork-hooks/imported-worktree-path'
import { registerForkBuild } from '../../shared/fork-hooks/update-feed'
import { registerKeepFolderWorkspacesOnGroupDeleteInMain } from '../../shared/fork-hooks/project-group-delete'
import { registerDisownedHostFileOpen } from '../../shared/fork-hooks/terminal-disowned-host-file'
import {
  forgetTerminalHtmlPreviewServe,
  registerSshHtmlPreviewRead
} from '../../shared/fork-hooks/terminal-html-preview'
import { onDocPreviewGrantRevoked } from '../../main/browser/doc-preview-grant-registry'
import { openManagedDisownedHostFile } from './disowned-host-file-open'
import { readConnectedSshHtmlPreview } from './ssh-html-preview-read'
import { keepFolderWorkspacesOnGroupDelete } from './project-group-delete'

// registerForkMainModules 可能进两次。撤销监听只挂一次，避免同一条授权被忘掉两遍。
let htmlPreviewRevokeWatched = false

/** Desktop and orcad. The renderer must not import this file. */
export function registerForkMainModules(): void {
  // orcad 不走 registerForkModules，这里也登记，免得它去拉上游的 agent 状态规则。
  registerForkBuild()
  installAiVaultForkServicePolicy()
  registerAiVaultServiceHeap(() => aiVaultServiceHeapMiB())
  registerDeferBrowserSessionProxy(true)
  registerTerminalWorkspaceResolver(resolveFolderTerminalWorkspace)
  registerImportedWorktreePath(getGitRepoRoot)
  registerKeepFolderWorkspacesOnGroupDeleteInMain(keepFolderWorkspacesOnGroupDelete)
  // 直连 SSH 的 HTML 预览在桌面读文件。orcad 没有这条连接时读取函数返回 null。
  registerSshHtmlPreviewRead(readConnectedSshHtmlPreview)
  if (!htmlPreviewRevokeWatched) {
    htmlPreviewRevokeWatched = true
    onDocPreviewGrantRevoked((grant) => forgetTerminalHtmlPreviewServe(grant.id))
  }
}

/**
 * orcad: the fork's registrations, then the host adapters. One call, so orcad-entry.ts stays within
 * its 300-line limit with upstream's lines unchanged.
 */
export function installForkOrcadHost(installHostAdapters: () => void): void {
  registerForkMainModules()
  // 只有托管 orcad 放开「没有工作区认领、但文件存在」的只读打开。桌面运行时不登记。
  registerDisownedHostFileOpen(openManagedDisownedHostFile)
  installHostAdapters()
}

// 转出给 orcad-entry 已有的那一行 import。监听地址和终端准入不是 fork 行为，只为留在 300 行上限内。
export { resolveOrcadServeBind } from './orcad-serve-bind'
