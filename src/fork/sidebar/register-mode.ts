// Registers host-directory. Row rendering is attached later from the renderer.
import {
  registerClearHostRowLabel,
  registerSidebarGroupMode
} from '../../shared/fork-hooks/sidebar-group-mode'
import type { SidebarGroupKeyContext } from '../../shared/fork-hooks/sidebar-group-mode'
import {
  registerDeleteProjectGroupDialogOption,
  registerKeepFolderWorkspacesOnProjectGroupDelete
} from '../../shared/fork-hooks/project-group-delete'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { omitRepeatedHostLabel } from './host-row-label'
import { sectionKeyForWorkspace } from './membership'
import {
  HOST_DIRECTORY_GROUP_BY,
  UNGROUP_ONLY_OPTION_ID,
  hostDirectoryDefaultHostId
} from './section-keys'

export function registerHostDirectoryMode(): void {
  // 和 retainHostHeaders 一起登记：标题留下时，行上不再重复主机名。
  registerClearHostRowLabel(omitRepeatedHostLabel)
  registerSidebarGroupMode({
    id: HOST_DIRECTORY_GROUP_BY,
    label: 'Host',
    description: 'Group workspaces by execution host, then by directory.',
    isDefault: true,
    retainHostHeaders: true,
    replacesBuiltinGroupBy: 'repo',
    groupKeyForWorktree: (
      worktree: Worktree,
      repo: Repo | undefined,
      context?: SidebarGroupKeyContext
    ) =>
      sectionKeyForWorkspace({
        worktree,
        repo,
        projectGroups: context?.projectGroups ?? [],
        defaultHostId: hostDirectoryDefaultHostId()
      })
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
