// Registers host-directory. Row rendering is attached later from the renderer.
import {
  registerForkHostSectionRows,
  registerSidebarGroupMode
} from '../../shared/fork-hooks/sidebar-group-mode'
import type { SidebarGroupKeyContext } from '../../shared/fork-hooks/sidebar-group-mode'
import {
  registerDeleteProjectGroupDialogOption,
  registerKeepFolderWorkspacesOnProjectGroupDelete
} from '../../shared/fork-hooks/project-group-delete'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { retainSingleHostSectionRows } from './host-section-retain'
import { sectionKeyForWorkspace } from './membership'
import {
  HOST_DIRECTORY_GROUP_BY,
  UNGROUP_ONLY_OPTION_ID,
  hostDirectoryDefaultHostId
} from './section-keys'

export function registerHostDirectoryMode(): void {
  // 单主机标题和目录标题的 hostId 与模式登记放在一起，避免只登记了模式却丢掉主机标题。
  registerForkHostSectionRows(retainSingleHostSectionRows)
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
