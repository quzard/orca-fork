// 同一台机器上，文件夹工作区可以当父级。跨机器仍然拒绝。
import {
  parseWorkspaceKey,
  folderWorkspaceKey,
  worktreeWorkspaceKey
} from '../../shared/workspace-scope'
import { getFolderWorkspaceWorktreeHostId } from '../../shared/folder-workspaces/folder-workspace-worktree'
import type { FolderWorkspace } from '../../shared/folder-workspaces/folder-workspace-types'
import type { WorktreeLineage } from '../../shared/worktree/lineage-types'
import { RuntimeLineageError } from '../../main/runtime/workspaces/lineage/runtime-worktree-lineage-resolution'

export const FOLDER_PARENT_INSTANCE_MESSAGE = 'Worktree instance identity was unavailable.'
export const FOLDER_PARENT_MISSING_MESSAGE = 'Parent selector was not found.'
export const FOLDER_PARENT_CROSS_HOST_MESSAGE =
  "a folder workspace can't parent a workspace on another machine yet."

type FolderRow = Pick<FolderWorkspace, 'id' | 'executionHostId' | 'connectionId'>

type LineageStore = {
  getFolderWorkspaces?: () => readonly FolderRow[]
  setWorktreeLineage?: (target: unknown, lineage: WorktreeLineage) => boolean
  setWorkspaceLineage?: (lineage: {
    childWorkspaceKey: string
    childInstanceId: string
    parentWorkspaceKey: string
    parentInstanceId: string
    origin: 'manual'
    capture: { source: 'manual-action'; confidence: 'explicit' }
    createdAt: number
  }) => void
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
  const store = args.store as LineageStore
  const folder = store.getFolderWorkspaces?.().find((entry) => entry.id === folderId)
  if (!folder) {
    throw new RuntimeLineageError('LINEAGE_PARENT_NOT_FOUND', FOLDER_PARENT_MISSING_MESSAGE)
  }
  const parentHost = getFolderWorkspaceWorktreeHostId(folder)
  if (args.child.hostId && args.child.hostId !== parentHost) {
    throw new RuntimeLineageError(
      'LINEAGE_PARENT_CONTEXT_CONFLICT',
      FOLDER_PARENT_CROSS_HOST_MESSAGE
    )
  }
  if (!args.child.instanceId || !store.setWorktreeLineage) {
    throw new RuntimeLineageError('LINEAGE_PARENT_CONTEXT_MISSING', FOLDER_PARENT_INSTANCE_MESSAGE)
  }
  const createdAt = Date.now()
  const parentId = folderWorkspaceKey(folder.id)
  const recorded = store.setWorktreeLineage(args.target, {
    worktreeId: args.child.id,
    worktreeInstanceId: args.child.instanceId,
    parentWorktreeId: parentId,
    // 文件夹没有单独的 instance id，用稳定的文件夹 id，重启后仍能对上。
    parentWorktreeInstanceId: folder.id,
    origin: 'manual',
    capture: { source: 'manual-action', confidence: 'explicit' },
    createdAt
  })
  if (!recorded) {
    throw new RuntimeLineageError(
      'LINEAGE_PARENT_CONTEXT_CONFLICT',
      'A same-id workspace on another host owns this lineage.'
    )
  }
  store.setWorkspaceLineage?.({
    childWorkspaceKey: worktreeWorkspaceKey(args.child.id),
    childInstanceId: args.child.instanceId,
    parentWorkspaceKey: parentId,
    parentInstanceId: folder.id,
    origin: 'manual',
    capture: { source: 'manual-action', confidence: 'explicit' },
    createdAt
  })
  return true
}
