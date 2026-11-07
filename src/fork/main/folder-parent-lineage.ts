// 同一台机器上，文件夹工作区可以当父级。跨机器仍然拒绝。
import {
  parseWorkspaceKey,
  folderWorkspaceKey,
  worktreeWorkspaceKey
} from '../../shared/workspace-scope'
import { getFolderWorkspaceWorktreeHostId } from '../../shared/folder-workspaces/folder-workspace-worktree'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import { RuntimeLineageError } from '../../main/runtime/workspaces/lineage/runtime-worktree-lineage-resolution'

export const FOLDER_PARENT_INSTANCE_MESSAGE = 'Worktree instance identity was unavailable.'
export const FOLDER_PARENT_MISSING_MESSAGE = 'Parent selector was not found.'
export const FOLDER_PARENT_CROSS_HOST_MESSAGE =
  "a folder workspace can't parent a workspace on another machine yet."
export const FOLDER_PARENT_HOST_MISSING_MESSAGE =
  'This workspace has no host, so it cannot use a folder parent.'

type FolderRow = Pick<FolderWorkspace, 'id' | 'executionHostId' | 'connectionId'>

type LineageStore = {
  getFolderWorkspaces?: () => readonly FolderRow[]
  removeWorktreeLineage?: (target: unknown) => void
  setWorkspaceLineage?: (lineage: {
    childWorkspaceKey: string
    childInstanceId: string
    parentWorkspaceKey: string
    parentInstanceId: string | null
    origin: 'manual'
    capture: { source: 'manual-action'; confidence: 'explicit' }
    createdAt: number
  }) => void
}

function isLineageStore(value: unknown): value is LineageStore {
  return typeof value === 'object' && value !== null && 'getFolderWorkspaces' in value
}

function folderIdOf(selector: string): string | null {
  const raw = selector.startsWith('id:') ? selector.slice(3) : selector
  const parsed = parseWorkspaceKey(raw)
  return parsed?.type === 'folder' ? parsed.folderWorkspaceId : null
}

/** 不是文件夹选择器时返回 false，调用方继续走原来的 git 父级。 */
export function applyFolderParentLineage(args: {
  selector: string
  store: unknown
  child: { id: string; instanceId?: string | null; hostId?: string | null }
  target: unknown
}): boolean {
  const folderId = folderIdOf(args.selector)
  if (!folderId) {
    return false
  }
  if (!isLineageStore(args.store)) {
    return false
  }
  const store = args.store
  const folder = store.getFolderWorkspaces?.().find((entry) => entry.id === folderId)
  if (!folder) {
    throw new RuntimeLineageError('LINEAGE_PARENT_NOT_FOUND', FOLDER_PARENT_MISSING_MESSAGE)
  }
  const parentHost = getFolderWorkspaceWorktreeHostId(folder)
  if (!args.child.hostId) {
    throw new RuntimeLineageError(
      'LINEAGE_PARENT_CONTEXT_CONFLICT',
      FOLDER_PARENT_HOST_MISSING_MESSAGE
    )
  }
  if (args.child.hostId !== parentHost) {
    throw new RuntimeLineageError(
      'LINEAGE_PARENT_CONTEXT_CONFLICT',
      FOLDER_PARENT_CROSS_HOST_MESSAGE
    )
  }
  if (!args.child.instanceId || !store.setWorkspaceLineage) {
    throw new RuntimeLineageError('LINEAGE_PARENT_CONTEXT_MISSING', FOLDER_PARENT_INSTANCE_MESSAGE)
  }
  const createdAt = Date.now()
  const parentId = folderWorkspaceKey(folder.id)
  // 文件夹没有 instance id。写 workspace 血缘，并清掉 git 父级，避免刷新时被投影成 worktree:folder:…
  store.removeWorktreeLineage?.(args.target)
  store.setWorkspaceLineage({
    childWorkspaceKey: worktreeWorkspaceKey(args.child.id),
    childInstanceId: args.child.instanceId,
    parentWorkspaceKey: parentId,
    parentInstanceId: null,
    origin: 'manual',
    capture: { source: 'manual-action', confidence: 'explicit' },
    createdAt
  })
  return true
}
