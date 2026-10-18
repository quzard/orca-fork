// fork: main-process registrations. Imported from the desktop and from orcad, before scans.

import { registerAiVaultServiceHeap } from '../../shared/fork-hooks/ai-vault'
import { registerDeferBrowserSessionProxy } from '../../shared/fork-hooks/startup'
import { registerForkRemoteEditorLaunch } from '../../shared/fork-hooks/remote-editor-launch'
import { registerTerminalWorkspaceResolver } from '../../shared/fork-hooks/terminal-lifecycle'
import { aiVaultServiceHeapMiB } from './ai-vault/heap'
import { installAiVaultForkServicePolicy } from './ai-vault/service-policy'
import { cursorRemoteSshLaunchSpec } from '../open-in/cursor-remote-launch'
import { resolveFolderTerminalWorkspace } from '../terminal/folder-workspace-resolver'
import { getGitRepoRoot } from '../../main/git/repo-detection'
import { registerImportedWorktreePath } from '../../shared/fork-hooks/imported-worktree-path'
import { registerForkSkillSource } from '../../cli/skills-source-commit'
import { registerForkBuild } from '../../shared/fork-hooks/update-feed'

/** Desktop and orcad. The renderer must not import this file. */
export function registerForkMainModules(): void {
  // orcad 不走 registerForkModules，这里也登记，免得它去拉上游的 agent 状态规则。
  registerForkBuild()
  registerForkSkillSource()
  installAiVaultForkServicePolicy()
  registerAiVaultServiceHeap(() => aiVaultServiceHeapMiB())
  registerDeferBrowserSessionProxy(true)
  registerTerminalWorkspaceResolver(resolveFolderTerminalWorkspace)
  registerImportedWorktreePath(getGitRepoRoot)
  registerForkRemoteEditorLaunch(cursorRemoteSshLaunchSpec)
}
