import { i18n } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  registerOpenInLauncher,
  registerOpenInRouteAdjuster
} from '../shared/fork-hooks/open-in-launcher'
import { registerPostImportHook } from '../shared/fork-hooks/post-import'
import { registerHiddenWorktreeSearch } from '../shared/fork-hooks/sidebar-chrome'
import {
  registerTerminalPaneShownHook,
  registerTerminalReconnectFitHook
} from '../shared/fork-hooks/terminal-lifecycle'
import { getOrcadSshDeployment } from '../shared/runtime-environments'
import { registerForkRendererModules as registerAiVaultRendererModules } from './ai-vault/register-renderer'
import {
  CURSOR_LAUNCHER_NAME,
  CURSOR_OPEN_IN_LABEL,
  CURSOR_REMOTE_SSH_LAUNCHER_ID,
  isCursorLauncherCommand
} from './open-in/cursor-remote-url'
import { adjustRemoteOpenRoute } from './open-in/remote-open-route'
import { enableWorkspacePortForward } from './ports/workspace-port-forward-flag'
import { registerArchivedWorkspaceSlot } from './sidebar/archived-workspaces'
import { installHostDirectoryRowPlan } from './sidebar/install-row-plan'
import { registerHostDirectorySortReader } from './sidebar/section-keys'
import { registerSettingsProjectBulkSlot } from './sidebar/settings-project-bulk'
import { registerSidebarMenuSlots } from './sidebar/sidebar-menu-slots'
import { registerWorkspaceChoice } from './sidebar/workspace-choice'
import { registerWorkspaceGroupDropHandler } from './sidebar/workspace-group-drop'
import { registerWorkspaceMenuGroups } from './sidebar/menu-groups'
import { registerForkModeLabels } from './sidebar/mode-labels'
import {
  consumeDeferredSshReconnectTui,
  pulseSshReconnectTui
} from './terminal/reconnect-tui-pulse'
import { registerComposerSeed } from './sidebar/register-composer-seed'
import { installForkLocaleOverlays } from './i18n/locale-overlay'
import { registerForkWorktreeContextMenuLabels } from './sidebar/context-menu-labels'

/** Renderer hooks. Kept out of the node program so it can read the app store. */
export function registerForkRendererModules(): void {
  installForkLocaleOverlays(i18n)
  installHostDirectoryRowPlan()
  registerHostDirectorySortReader(() => useAppStore.getState().sortBy)
  registerSidebarMenuSlots()
  registerArchivedWorkspaceSlot()
  registerWorkspaceChoice()
  registerSettingsProjectBulkSlot()
  registerWorkspaceGroupDropHandler()
  registerWorkspaceMenuGroups()
  registerForkModeLabels()
  registerHiddenWorktreeSearch({
    minimum: 1,
    matches: (worktree, query) => (worktree.branch ?? '').toLocaleLowerCase().includes(query)
  })
  const resizePty = (ptyId: string, cols: number, rows: number): void => {
    window.api.pty.resize(ptyId, cols, rows)
  }
  registerTerminalReconnectFitHook((info) => {
    pulseSshReconnectTui(info, resizePty)
  })
  registerTerminalPaneShownHook((info) => {
    consumeDeferredSshReconnectTui(info, resizePty)
  })
  registerComposerSeed()
  registerForkWorktreeContextMenuLabels()
  registerOpenInLauncher({
    id: CURSOR_REMOTE_SSH_LAUNCHER_ID,
    label: CURSOR_OPEN_IN_LABEL,
    command: CURSOR_LAUNCHER_NAME,
    target: 'external-editor',
    hiddenBesideCommands: (commands) => commands.some((command) => isCursorLauncherCommand(command))
  })
  registerOpenInRouteAdjuster((context) => {
    const state = useAppStore.getState()
    const environment = state.runtimeEnvironments.find(
      (entry) => entry.id === context.runtimeEnvironmentId
    )
    return adjustRemoteOpenRoute(context, {
      ownerUnresolved: context.ownerUnresolved,
      orcadDeploymentSshTargetId: environment
        ? getOrcadSshDeployment(environment)?.sshTargetId
        : null,
      sshTargetLabels: state.sshTargetLabels,
      sshTargetsHydrated: state.sshTargetsHydrated
    })
  })
  registerPostImportHook((details) =>
    import('./import/apply-post-import').then((module) => module.applyForkPostImport(details))
  )
  enableWorkspacePortForward()
  registerAiVaultRendererModules()
}
