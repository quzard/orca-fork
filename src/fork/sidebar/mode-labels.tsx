// Translations for fork labels registered from node-safe code (register-mode.ts) and for the
// English upstream hardcodes in the "Remove SSH Target" dialog. register-mode.ts keeps the English:
// it runs where no translator exists. Here, in the renderer, the same registrations get getters,
// so the label follows the current language each time it is rendered.
import { i18n } from '../../renderer/src/i18n/i18n'
import { forkTranslate } from '../i18n/fork-translate'
import {
  lookupSidebarGroupMode,
  notifySidebarGroupModeLabelsChanged,
  registerSidebarGroupMode
} from '../../shared/fork-hooks/sidebar-group-mode'
import {
  getDeleteProjectGroupDialogOption,
  registerDeleteProjectGroupDialogOption
} from '../../shared/fork-hooks/project-group-delete'
import { registerSshTargetRemoveLabels } from '../../shared/fork-hooks/ssh-target-remove-labels'
import { HOST_DIRECTORY_GROUP_BY, UNGROUP_ONLY_OPTION_ID } from './section-keys'

export function sshTargetRemoveLabelsForLocale(): { actionLabel: string; busyLabel: string } {
  return {
    actionLabel: forkTranslate('fork.settings.sshTargetRemove', 'Remove'),
    busyLabel: forkTranslate('fork.settings.sshTargetRemoving', 'Removing')
  }
}

// The group-by menu reads the getter only when it renders; this makes a language switch render it.
function onLanguageChanged(): void {
  notifySidebarGroupModeLabelsChanged()
}

export function registerForkModeLabels(): void {
  // Same function every time, so registering again never adds a second listener.
  i18n.off('languageChanged', onLanguageChanged)
  i18n.on('languageChanged', onLanguageChanged)
  const mode = lookupSidebarGroupMode(HOST_DIRECTORY_GROUP_BY)
  if (mode) {
    registerSidebarGroupMode({
      ...mode,
      get label() {
        return forkTranslate('fork.sidebar.hostMode', 'Host')
      },
      get description() {
        return forkTranslate(
          'fork.sidebar.hostModeDescription',
          'Group workspaces by execution host, then by directory.'
        )
      }
    })
  }
  const option = getDeleteProjectGroupDialogOption()
  if (option?.id === UNGROUP_ONLY_OPTION_ID) {
    registerDeleteProjectGroupDialogOption({
      ...option,
      get label() {
        return forkTranslate('fork.sidebar.ungroupOnly', 'Ungroup only')
      },
      get description() {
        return forkTranslate(
          'fork.sidebar.ungroupOnlyDescription',
          'Remove the group and leave its workspaces in place.'
        )
      }
    })
  }
  registerSshTargetRemoveLabels(sshTargetRemoveLabelsForLocale)
}
