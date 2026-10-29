// 删除工作区默认只从 Orca 移除。勾选「同时删除文件夹」才走上游的 git worktree remove。
// 软删除写成归档（isArchived），并在本机记下隐藏记录。下次 git 扫描合并时读到
// 其中之一，侧栏不会把同一行加回活动列表。不取消 git worktree 登记，也不删目录。
import { useId, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { Repo } from '../../shared/repo-types'
import { isFolderRepo } from '../../shared/repo-kind'
import type { Worktree } from '../../shared/worktree/types'
import { toWorktreeRemovalTarget, type WorktreeRemovalTarget } from '../../shared/worktree/removal'
import type { ConfirmedUnsavedDiscards } from '../../renderer/src/store/slices/worktrees/teardown/removed-workspace-unsaved-files'
import { runLineageDeleteAll } from '../../renderer/src/components/sidebar/delete-worktree-lineage-delete-all'
import type { WorktreeDeleteIdentity } from '../../renderer/src/components/sidebar/worktree-delete-request'
import {
  gitWorktreesInDelete,
  registerWorkspaceFolderDelete,
  takeWorkspaceRecordRemoval,
  workspaceFolderDeleteOffered,
  workspaceLineageKeptNotice,
  type WorkspaceLineageKeptNotice,
  type WorkspaceRecordIdentity
} from '../../shared/fork-hooks/workspace-folder-delete'
import { forkTranslate } from '../i18n/fork-translate'
import { useAppStore } from '../../renderer/src/store'
import { runWorktreeDeletesInParallel } from '../../renderer/src/components/sidebar/delete-worktree-flow'
import { removeWorkspaceFromOrca } from './remove-workspace'

function keepFolderSuffix(gitWorktreeCount: number): string {
  return gitWorktreeCount === 1
    ? forkTranslate(
        'fork.workspaceDelete.keepFolderOne',
        'from Orca. The workspace folder on disk will not be deleted.'
      )
    : forkTranslate(
        'fork.workspaceDelete.keepFolderMany',
        'from Orca. Workspace folders on disk will not be deleted.'
      )
}

function lineageKeptNotice(childCount: number): WorkspaceLineageKeptNotice {
  if (childCount === 1) {
    return {
      title: forkTranslate(
        'fork.workspaceDelete.lineageKeptTitle',
        'Child workspaces stay on disk'
      ),
      body: forkTranslate(
        'fork.workspaceDelete.lineageKeptOne',
        'Removing this workspace also removes 1 child workspace from Orca. Folders on disk will not be deleted.'
      )
    }
  }
  return {
    title: forkTranslate('fork.workspaceDelete.lineageKeptTitle', 'Child workspaces stay on disk'),
    body: forkTranslate(
      'fork.workspaceDelete.lineageKeptMany',
      'Removing this workspace also removes {{count}} child workspaces from Orca. Folders on disk will not be deleted.',
      { count: childCount }
    )
  }
}

// 归档 git 工作区，不调用 git worktree remove。文件夹工作区仍走上游删除记录的路径。
async function removeRecordsKeepingFolders(
  identities: readonly WorkspaceRecordIdentity[]
): Promise<readonly WorkspaceRecordIdentity[] | null> {
  const state = useAppStore.getState()
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const git: WorkspaceRecordIdentity[] = []
  const folders: Worktree[] = []
  let missed = false
  for (const identity of identities) {
    const worktree = state.getKnownWorktreeById(identity.id, identity.hostId)
    if (!worktree) {
      // 对不上就整批停下。返回 null 会让跳过确认把没对上的 git 行也硬删掉。
      missed = true
      continue
    }
    const repo = repoById.get(worktree.repoId)
    if (repo && isFolderRepo(repo)) {
      folders.push(worktree)
    } else {
      git.push(identity)
    }
  }
  if (missed) {
    return []
  }
  // 全是文件夹：交给上游。一条都没对上：不要改走会删目录的删除。
  if (git.length === 0) {
    return folders.length === 0 && identities.length > 0 ? [] : null
  }
  const removed: WorkspaceRecordIdentity[] = []
  const quiet = git.length > 1
  let archived = 0
  for (const identity of git) {
    if (await removeWorkspaceFromOrca(identity, quiet ? { quiet: true } : undefined)) {
      removed.push(identity)
      archived += 1
    }
  }
  if (quiet && archived > 0) {
    toast.success(
      forkTranslate('fork.workspaceDelete.removedMany', 'Removed {{count}} workspaces from Orca', {
        count: archived
      })
    )
  }
  if (folders.length > 0) {
    const deleted = await runWorktreeDeletesInParallel(folders)
    for (const target of deleted) {
      removed.push({ id: target.id, hostId: target.executionHostId ?? undefined })
    }
  }
  return removed
}

export function registerForkWorkspaceFolderDelete(): void {
  registerWorkspaceFolderDelete({
    keepFolderSuffix,
    lineageKeptNotice,
    removeRecords: removeRecordsKeepingFolders
  })
}

function WorkspaceFolderDeleteOption({
  checked,
  disabled,
  onCheckedChange
}: {
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}): ReactNode {
  const optionId = useId()
  const label = forkTranslate('fork.workspaceDelete.alsoDeleteFolder', 'Also delete folder')
  const hint = forkTranslate(
    'fork.workspaceDelete.keepFolderHint',
    'Leave this off to keep the folder on disk.'
  )
  return (
    <div className="flex w-full items-start gap-2 rounded-sm px-1 py-1 text-foreground/85">
      <Checkbox
        id={optionId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <Label htmlFor={optionId} className="block cursor-pointer text-xs leading-4 font-medium">
          {label}
        </Label>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </div>
  )
}

type FolderDeleteDialogInput = {
  isOpen: boolean
  isMainWorktree: boolean
  disabled: boolean
  repos: readonly Pick<Repo, 'id' | 'kind'>[]
  deleteTargets: readonly { repoId: string }[]
  // 上游现在给的是整句（带 <target>），不再是拼在名称后面的后缀。
  upstreamDescription: string
  batch: boolean
  childCount: number
  dirtyCount: number
  canForceDelete: boolean
  closeModal: () => void
  onDeleted: ((targets: WorktreeRemovalTarget[]) => void) | null
}

// 不勾选「同时删除文件夹」时，整句改成只从 Orca 移除。勾选或未登记时用上游原文。
function keptFolderDescription(childCount: number, batch: boolean, targetCount: number): string {
  if (childCount === 1) {
    return forkTranslate(
      'fork.workspaceDelete.keepFolderWithChild',
      'Remove <target/> and <descendants>1 child workspace</descendants> from Orca. The workspace folder on disk will not be deleted.'
    )
  }
  if (childCount > 1) {
    return forkTranslate(
      'fork.workspaceDelete.keepFolderWithChildren',
      'Remove <target/> and <descendants>{{count}} child workspaces</descendants> from Orca. Workspace folders on disk will not be deleted.',
      { count: childCount }
    )
  }
  if (batch) {
    return forkTranslate(
      'fork.workspaceDelete.keepFolderBatch',
      'Remove <target>{{count}} workspaces</target> from Orca. Workspace folders on disk will not be deleted.',
      { count: targetCount }
    )
  }
  return forkTranslate(
    'fork.workspaceDelete.keepFolderSingle',
    'Remove <target/> from Orca. The workspace folder on disk will not be deleted.'
  )
}

export function keepWorkspaceFolderOnConfirm(
  keepsFolder: boolean,
  worktrees: readonly Pick<Worktree, 'id' | 'instanceId' | 'hostId'>[],
  closeModal: () => void,
  onDeleted: ((targets: WorktreeRemovalTarget[]) => void) | null
): boolean {
  if (!keepsFolder) {
    return false
  }
  const identities = worktrees.map(({ id, instanceId, hostId }) => ({ id, instanceId, hostId }))
  closeModal()
  void takeWorkspaceRecordRemoval(identities, false)
    .then((removed) => {
      if (!removed || removed.length === 0 || !onDeleted) {
        return
      }
      const deleted = worktrees.filter((worktree) =>
        removed.some(
          (item) =>
            item.id === worktree.id && (item.hostId ?? undefined) === (worktree.hostId ?? undefined)
        )
      )
      if (deleted.length > 0) {
        onDeleted(deleted.map((worktree) => toWorktreeRemovalTarget(worktree)))
      }
    })
    .catch((error: unknown) => {
      console.error('Failed to remove workspace from Orca:', error)
    })
  return true
}

export function useWorkspaceFolderDeleteDialog(input: FolderDeleteDialogInput): {
  description: string
  showChangeLossWarning: boolean
  lineageKeptNotice: WorkspaceLineageKeptNotice | null
  folderOption: ReactNode
  keepsFolder: boolean
} {
  const [deleteFolder, setDeleteFolder] = useState(false)
  if (!input.isOpen && deleteFolder) {
    setDeleteFolder(false)
  }
  const gitDeleteCount = gitWorktreesInDelete(input.repos, input.deleteTargets)
  const offerDeleteFolder =
    !input.isMainWorktree && !input.canForceDelete && workspaceFolderDeleteOffered(gitDeleteCount)
  const keepsFolder = offerDeleteFolder && !deleteFolder
  const folderOption = offerDeleteFolder ? (
    <WorkspaceFolderDeleteOption
      checked={deleteFolder}
      disabled={input.disabled}
      onCheckedChange={setDeleteFolder}
    />
  ) : null
  return {
    description: keepsFolder
      ? keptFolderDescription(input.childCount, input.batch, input.deleteTargets.length)
      : input.upstreamDescription,
    showChangeLossWarning: input.dirtyCount > 0 && (!offerDeleteFolder || deleteFolder),
    lineageKeptNotice: keepsFolder ? workspaceLineageKeptNotice(input.childCount) : null,
    folderOption,
    keepsFolder
  }
}

export function deleteListedWorktreeLineage(args: {
  keepsFolder: boolean
  lineageDeleteIdentities: readonly WorktreeDeleteIdentity[]
  deleteAllTargetCount: number
  resolveConfirmedTargets: (
    identities: readonly WorktreeDeleteIdentity[],
    expectedCount: number
  ) => Worktree[] | null
  forceOnConfirm: boolean
  onForceDeleted: (target: WorktreeRemovalTarget) => void
  closeModal: () => void
  onDeleted: ((targets: WorktreeRemovalTarget[]) => void) | null
  confirmedDiscards: ConfirmedUnsavedDiscards
}): void {
  // 子工作区也只归档。硬删除才需要先删子级，避免 git 拒绝仍登记着的父级。
  if (args.keepsFolder) {
    const currentTargets = args.resolveConfirmedTargets(
      args.lineageDeleteIdentities,
      args.deleteAllTargetCount
    )
    if (currentTargets) {
      keepWorkspaceFolderOnConfirm(true, currentTargets, args.closeModal, args.onDeleted)
    }
    return
  }
  runLineageDeleteAll(args)
}

export {
  focusDeleteWorktreeConfirm,
  useCloseDeleteWorktreeDialogWithoutTargets,
  useDeleteWorktreeDialogOpenChange
} from './workspace-folder-delete-lifecycle'
