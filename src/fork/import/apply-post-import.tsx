import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../shared/execution-host'
import type { ForkPostImportDetails } from '../../shared/fork-hooks/post-import'
import { getFolderWorkspaceHostId } from '@/store/folder-workspaces/folder-workspace-catalog'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import {
  PARENT_FOLDER_IMPORT_FAILED,
  PARENT_FOLDER_IMPORT_WARNING,
  SELECTED_WORKTREE_IMPORT_FAILED
} from './post-import-messages'
import { parentFolderImportRequested } from './parent-folder-request'
import { mergeSelectedWorktreeInbox } from './selected-worktree-paths'

async function keepSelectedWorktrees(details: ForkPostImportDetails): Promise<void> {
  const projects = details.importedProjects ?? []
  const hostId = details.executionHostId
  const pathsByProject = new Map<string, string[]>()
  for (const project of projects) {
    if (!project.projectId || project.status === 'failed') {
      continue
    }
    const paths = pathsByProject.get(project.projectId) ?? []
    paths.push(project.path)
    pathsByProject.set(project.projectId, paths)
  }
  const store = useAppStore.getState()
  for (const [projectId, paths] of pathsByProject) {
    const repo = findRepoForHost(store.repos, projectId, { hostId })
    if (!repo) {
      continue
    }
    const merged = mergeSelectedWorktreeInbox(
      repo.importedExternalWorktreePaths,
      repo.externalWorktreeInboxBaselinePaths,
      repo.path,
      paths
    )
    if (!merged) {
      continue
    }
    const updated = await useAppStore.getState().updateRepo(projectId, merged, { hostId })
    if (!updated) {
      throw new Error(SELECTED_WORKTREE_IMPORT_FAILED)
    }
  }
}

async function ensureParentFolder(details: ForkPostImportDetails): Promise<void> {
  if (!parentFolderImportRequested(details)) {
    return
  }
  const parentPath = details.path
  if (!parentPath) {
    return
  }
  const hostId: ExecutionHostId = details.executionHostId ?? LOCAL_EXECUTION_HOST_ID
  const store = useAppStore.getState()
  const parentKey = normalizeRuntimePathForComparison(parentPath)
  const group = store.projectGroups.find(
    (entry) =>
      getProjectGroupHostId(entry) === hostId &&
      entry.parentPath !== null &&
      normalizeRuntimePathForComparison(entry.parentPath) === parentKey
  )
  const existing = store.folderWorkspaces.find(
    (workspace) =>
      getFolderWorkspaceHostId(workspace, store.projectGroups) === hostId &&
      normalizeRuntimePathForComparison(workspace.folderPath) === parentKey
  )
  if (existing) {
    if (!existing.isArchived) {
      return
    }
    const updated = await useAppStore
      .getState()
      .updateFolderWorkspace(existing.id, { isArchived: false }, { executionHostId: hostId })
    if (!updated) {
      throw new Error(PARENT_FOLDER_IMPORT_FAILED)
    }
    return
  }
  if (!group) {
    throw new Error(PARENT_FOLDER_IMPORT_FAILED)
  }
  await useAppStore.getState().createFolderWorkspace(
    {
      projectGroupId: group.id,
      folderPath: parentPath,
      ...(details.connectionId ? { connectionId: details.connectionId } : {})
    },
    { runtimeEnvironmentId: details.runtimeEnvironmentId ?? null }
  )
}

export async function applyForkPostImport(details: ForkPostImportDetails): Promise<void> {
  if (details.phase !== 'handoff') {
    return
  }
  await keepSelectedWorktrees(details)
  if (!details.includeParentFolder) {
    return
  }
  try {
    await ensureParentFolder(details)
  } catch (error) {
    toast.warning(translate('workspaceImport.parentFolderFailed', PARENT_FOLDER_IMPORT_WARNING), {
      description: error instanceof Error ? error.message : String(error)
    })
  }
}
