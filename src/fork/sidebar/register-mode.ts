// Registers host-directory. Row rendering is attached later from the renderer.
import { registerSidebarGroupMode } from '../../shared/fork-hooks/sidebar-group-mode'
import {
  registerDeleteProjectGroupDialogOption,
  registerKeepFolderWorkspacesOnProjectGroupDelete
} from '../../shared/fork-hooks/project-group-delete'
import { HOST_DIRECTORY_GROUP_BY, UNGROUP_ONLY_OPTION_ID } from './section-keys'

export function registerHostDirectoryMode(): void {
  registerSidebarGroupMode({
    id: HOST_DIRECTORY_GROUP_BY,
    label: 'Host',
    description: 'Group workspaces by execution host, then by directory.',
    isDefault: true,
    retainHostHeaders: true,
    replacesBuiltinGroupBy: 'repo'
  })
  registerDeleteProjectGroupDialogOption({
    id: UNGROUP_ONLY_OPTION_ID,
    label: 'Ungroup only',
    description: 'Remove the group and leave its workspaces in place.',
    defaultChecked: true,
    adjustRemoveContainedProjects: (removeContainedProjects, checked) =>
      checked ? false : removeContainedProjects
  })
  registerKeepFolderWorkspacesOnProjectGroupDelete()
}
