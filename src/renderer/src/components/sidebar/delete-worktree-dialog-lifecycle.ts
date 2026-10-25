// 从删除对话框拆出来，避免对话框超过行数上限。行为与原来写在对话框里时相同。

import { useCallback, useEffect } from 'react'
import { useAppStore } from '@/store'
import { collectRemovalUnsavedFiles } from '@/components/editor/removal-unsaved-editor-files'
import type { WorktreePurgeTarget } from '@/store/slices/worktree-purge-target'
import { getDeleteStateForWorktreeHost } from './worktree-delete-state-host-match'

export function focusDeleteWorktreeConfirm(
  event: { preventDefault: () => void },
  confirmButton: HTMLButtonElement | null,
  isMainWorktree: boolean,
  unsavedTargets: readonly WorktreePurgeTarget[]
): void {
  // 列出了未保存的编辑时，回车不能直接丢掉它们，焦点留给 Radix 的默认项。
  if (
    isMainWorktree ||
    collectRemovalUnsavedFiles(useAppStore.getState, unsavedTargets).length > 0
  ) {
    return
  }
  event.preventDefault()
  // 这个对话框就是为了确认用户已经从菜单里选中的删除。Radix 否则会落到取消按钮上。
  confirmButton?.focus()
}

export function useCloseDeleteWorktreeDialogWithoutTargets(args: {
  isOpen: boolean
  worktreeIds: readonly string[]
  worktreeCount: number
  isDeleting: boolean
  deleteStateTargets: readonly { id: string; hostId?: WorktreePurgeTarget['hostId'] }[]
  clearWorktreeDeleteState: (worktreeId: string, hostId?: WorktreePurgeTarget['hostId']) => void
  closeModal: () => void
}): void {
  const {
    isOpen,
    worktreeIds,
    worktreeCount,
    isDeleting,
    deleteStateTargets,
    clearWorktreeDeleteState,
    closeModal
  } = args
  useEffect(() => {
    if (isOpen && worktreeIds.length > 0 && worktreeCount === 0 && !isDeleting) {
      for (const target of deleteStateTargets) {
        clearWorktreeDeleteState(target.id, target.hostId)
      }
      closeModal()
    }
  }, [
    clearWorktreeDeleteState,
    closeModal,
    deleteStateTargets,
    isDeleting,
    isOpen,
    worktreeIds,
    worktreeIds.length,
    worktreeCount
  ])
}

export function useDeleteWorktreeDialogOpenChange(args: {
  isSavingForcePreference: boolean
  deleteStateTargets: readonly { id: string; hostId?: WorktreePurgeTarget['hostId'] }[]
  worktreeId: string
  isBatchDelete: boolean
  clearWorktreeDeleteState: (worktreeId: string, hostId?: WorktreePurgeTarget['hostId']) => void
  closeModal: () => void
}): (open: boolean) => void {
  const {
    isSavingForcePreference,
    deleteStateTargets,
    worktreeId,
    isBatchDelete,
    clearWorktreeDeleteState,
    closeModal
  } = args
  return useCallback(
    (open: boolean) => {
      if (open || isSavingForcePreference) {
        return
      }
      const state = useAppStore.getState().deleteStateByWorktreeId
      const currentTarget = deleteStateTargets.find((target) => target.id === worktreeId)
      const currentState = currentTarget
        ? getDeleteStateForWorktreeHost(currentTarget, state)
        : undefined
      if (isBatchDelete) {
        for (const target of deleteStateTargets) {
          if (!getDeleteStateForWorktreeHost(target, state)?.isDeleting) {
            clearWorktreeDeleteState(target.id, target.hostId)
          }
        }
      } else if (worktreeId && !currentState?.isDeleting) {
        clearWorktreeDeleteState(worktreeId, currentTarget?.hostId)
      }
      closeModal()
    },
    [
      clearWorktreeDeleteState,
      closeModal,
      deleteStateTargets,
      isBatchDelete,
      isSavingForcePreference,
      worktreeId
    ]
  )
}
