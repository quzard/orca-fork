// fork: main-process registrations. Imported from the desktop and from orcad, before scans.

import { registerAiVaultServiceHeap } from '../shared/fork-hooks/ai-vault'
import { registerDeferBrowserSessionProxy } from '../shared/fork-hooks/startup'
import {
  registerPosixBrowseCommandTail,
  registerRemoteDirectoryListingHook
} from '../shared/fork-hooks/remote-directory'
import { registerForkRemoteEditorLaunch } from '../shared/fork-hooks/remote-editor-launch'
import { registerTerminalWorkspaceResolver } from '../shared/fork-hooks/terminal-lifecycle'
import { aiVaultServiceHeapMiB } from './ai-vault/heap'
import { installAiVaultForkServicePolicy } from './ai-vault/service-policy'
import { followDirectorySymlinks } from './directory/follow-directory-symlink'
import { POSIX_SYMLINK_DIRECTORY_LIST_TAIL } from './directory/posix-symlink-list'
import { cursorRemoteSshLaunchSpec } from './open-in/cursor-remote-launch'
import { resolveFolderTerminalWorkspace } from './terminal/folder-workspace-resolver'
import { getGitRepoRoot } from '../main/git/repo-detection'
import { registerImportedWorktreePath } from '../shared/fork-hooks/imported-worktree-path'
import { registerForkSkillSource } from './skills-source-commit'

/** Desktop and orcad. The renderer must not import this file. */
export function registerForkMainModules(): void {
  registerForkSkillSource()
  installAiVaultForkServicePolicy()
  registerAiVaultServiceHeap(() => aiVaultServiceHeapMiB())
  registerDeferBrowserSessionProxy(true)
  registerPosixBrowseCommandTail(POSIX_SYMLINK_DIRECTORY_LIST_TAIL)
  registerRemoteDirectoryListingHook(followDirectorySymlinks)
  registerTerminalWorkspaceResolver(resolveFolderTerminalWorkspace)
  registerImportedWorktreePath(getGitRepoRoot)
  registerForkRemoteEditorLaunch(cursorRemoteSshLaunchSpec)
}
