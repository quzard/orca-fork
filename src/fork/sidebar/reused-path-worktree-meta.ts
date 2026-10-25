import type { ExecutionHostId } from '../../shared/execution-host'

// 导入不会换 instanceId，但同一路径的旧 isArchived 仍会把新行留在已移除里。
export async function reactivateArchivedWorktreeMeta(target: {
  worktreeId: string
  executionHostId?: ExecutionHostId
}): Promise<void> {
  if (!target.worktreeId) {
    return
  }
  await window.api.worktrees.updateMeta({
    worktreeId: target.worktreeId,
    ...(target.executionHostId ? { executionHostId: target.executionHostId } : {}),
    updates: { isArchived: false }
  })
}
