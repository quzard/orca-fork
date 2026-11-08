import { defineMethod } from '../../core'
import { resolveRpcWorkspaceCreatorProvenance } from '../../workspace-creator-context'
import { decodeSidebarFieldClears } from '../../../../../shared/fork-hooks/sidebar-field-clear'
import {
  FolderWorkspaceCreate,
  FolderWorkspaceDelete,
  FolderWorkspacePathStatus,
  FolderWorkspaceUpdate
} from '../../../../../shared/rpc-contract/folder-workspace-params'

export const FOLDER_WORKSPACE_METHODS = [
  defineMethod({
    name: 'folderWorkspace.list',
    permission: 'workspace',
    params: null,
    handler: (_params, { runtime }) => ({
      folderWorkspaces: runtime.listVisibleFolderWorkspaces()
    })
  }),
  defineMethod({
    name: 'folderWorkspace.create',
    permission: 'workspace',
    params: FolderWorkspaceCreate,
    handler: async (params, context) => ({
      folderWorkspace: await context.runtime.createFolderWorkspace({
        ...params,
        creatorProvenance: resolveRpcWorkspaceCreatorProvenance(context)
      })
    })
  }),
  defineMethod({
    name: 'folderWorkspace.update',
    permission: 'workspace',
    params: FolderWorkspaceUpdate,
    handler: async (params, { runtime }) => ({
      folderWorkspace: await runtime.updateFolderWorkspace(
        params.folderWorkspaceId,
<<<<<<< HEAD
        decodeSidebarFieldClears(params.updates, params.clearFields)
=======
        params.updates,
        { requireUniqueId: params.requireUniqueId }
>>>>>>> 8781bcb6be31f7c83651d5349fb151e8e29b8e66
      )
    })
  }),
  defineMethod({
    name: 'folderWorkspace.delete',
    permission: 'workspace',
    params: FolderWorkspaceDelete,
    handler: async (params, { runtime }) =>
      runtime.deleteFolderWorkspace(params.folderWorkspaceId, {
        requireUniqueId: params.requireUniqueId
      })
  }),
  defineMethod({
    name: 'folderWorkspace.getPathStatus',
    permission: 'workspace',
    params: FolderWorkspacePathStatus,
    handler: async (params, { runtime }) => ({
      status: await runtime.getFolderWorkspacePathStatus(params)
    })
  })
]
