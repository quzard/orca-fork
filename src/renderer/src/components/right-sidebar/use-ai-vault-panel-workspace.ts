import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { useActiveRepo, useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import {
  selectAiVaultPanelWorkspace,
  type AiVaultPanelWorkspace,
  type AiVaultPanelWorkspaceRows
} from './ai-vault-panel-workspace'

const NO_ROWS: AiVaultPanelWorkspaceRows = { worktree: null, repo: null }

/** The panel's workspace: the one it was opened for, else the active one. */
export function useAiVaultPanelWorkspace(
  workspace: AiVaultPanelWorkspace | undefined
): AiVaultPanelWorkspaceRows & { workspaceId: string | null } {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const bound = useAppStore(
    useShallow((state) => (workspace ? selectAiVaultPanelWorkspace(state, workspace) : NO_ROWS))
  )
  return workspace
    ? { workspaceId: workspace.worktreeId, ...bound }
    : { workspaceId: activeWorktreeId, worktree: activeWorktree, repo: activeRepo }
}

/** 恢复会话时要看的工作区快照。放在这里，面板文件才能留在行数上限内。 */
export function useAiVaultResumeTargetState() {
  return useAppStore(
    useShallow((state) => ({
      projects: state.projects,
      settings: state.settings,
      folderWorkspaces: selectFolderWorkspaces(state),
      projectGroups: state.projectGroups,
      repos: state.repos,
      worktreesByRepo: selectWorktreesByRepo(state)
    }))
  )
}
