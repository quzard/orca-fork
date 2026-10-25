// 删除工作区默认只从 Orca 移除。勾选「同时删除文件夹」才走上游的 git worktree remove。
// 软删除写成归档（isArchived），下次 git 扫描会读到这个标记，侧栏不会把同一行立刻加回来。
// 没有所属仓库的孤立行只能从当前列表丢掉，扫到仍在的 git worktree 时可能再出现；仍然不删目录。
import { useId, useState, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { Repo } from '../../shared/repo-types'
import { isFolderRepo } from '../../shared/repo-kind'
import type { Worktree } from '../../shared/worktree/types'
import { toWorktreeRemovalTarget, type WorktreeRemovalTarget } from '../../shared/worktree/removal'
import {
  gitWorktreesInDelete,
  registerWorkspaceFolderDelete,
  takeWorkspaceRecordRemoval,
  workspaceFolderDeleteOffered,
  workspaceFolderDeleteSuffix,
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
  for (const identity of identities) {
    const worktree = state.getKnownWorktreeById(identity.id, identity.hostId)
    if (!worktree) {
      continue
    }
    const repo = repoById.get(worktree.repoId)
    if (repo && isFolderRepo(repo)) {
      folders.push(worktree)
    } else {
      git.push(identity)
    }
  }
  // 全是文件夹：交给上游。一条都没对上：不要改走会删目录的删除。
  if (git.length === 0) {
    return folders.length === 0 && identities.length > 0 ? [] : null
  }
  const removed: WorkspaceRecordIdentity[] = []
  for (const identity of git) {
    if (await removeWorkspaceFromOrca(identity)) {
      removed.push(identity)
    }
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
  upstreamSuffix: string
  childCount: number
  dirtyCount: number
  closeModal: () => void
  onDeleted: ((targets: WorktreeRemovalTarget[]) => void) | null
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
  descriptionSuffix: string
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
  const offerDeleteFolder = !input.isMainWorktree && workspaceFolderDeleteOffered(gitDeleteCount)
  const keepsFolder = offerDeleteFolder && !deleteFolder
  const folderOption = offerDeleteFolder ? (
    <WorkspaceFolderDeleteOption
      checked={deleteFolder}
      disabled={input.disabled}
      onCheckedChange={setDeleteFolder}
    />
  ) : null
  return {
    descriptionSuffix: workspaceFolderDeleteSuffix(
      input.upstreamSuffix,
      gitDeleteCount,
      deleteFolder
    ),
    showChangeLossWarning: input.dirtyCount > 0 && (!offerDeleteFolder || deleteFolder),
    lineageKeptNotice: keepsFolder ? workspaceLineageKeptNotice(input.childCount) : null,
    folderOption,
    keepsFolder
  }
}
