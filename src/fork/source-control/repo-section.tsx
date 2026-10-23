import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openUncommittedEntry } from '@/components/right-sidebar/source-control/listing/open-uncommitted-entry'
import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'
import type {
  GitBranchChangeEntry,
  GitBranchCompareResult
} from '../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../shared/git-status-types'
import {
  SOURCE_CONTROL_REPO_AHEAD_TEST_ID,
  SOURCE_CONTROL_REPO_CHANGE_COUNT_TEST_ID,
  SOURCE_CONTROL_REPO_TEST_ID
} from '../git-workspace/constants'
import type { WorkspaceRepositoryRecord, WorkspaceRepositoryStatus } from '../git-workspace/types'
import { forkTranslate } from '../i18n/fork-translate'
import { CompareTargetPicker } from './compare-picker'
import { repositoryHasChanges } from './repo-order'

function rootRelative(repositoryPath: string, filePath: string): string {
  return repositoryPath ? `${repositoryPath}/${filePath}` : filePath
}

function groupLabel(area: GitStatusEntry['area']): string {
  if (area === 'staged') {
    return forkTranslate('fork.sourceControl.group.staged', 'Staged')
  }
  if (area === 'unstaged') {
    return forkTranslate('fork.sourceControl.group.unstaged', 'Unstaged')
  }
  return forkTranslate('fork.sourceControl.group.untracked', 'Untracked')
}

export function WorkspaceRepoSection({
  repository,
  status,
  compare,
  worktreeId,
  worktreePath,
  onCommitTarget
}: {
  repository: WorkspaceRepositoryRecord
  status: WorkspaceRepositoryStatus | undefined
  compare: GitBranchCompareResult | undefined
  worktreeId: string
  worktreePath: string
  onCommitTarget: (repositoryPath: string, branch: string, ref: string | null) => void
}): React.JSX.Element {
  // null 表示还没手动点过：有改动就展开，没改动就收起。点过之后不再跟着改动集合自动收起或展开。
  const [choice, setChoice] = useState<'open' | 'closed' | null>(null)
  const hasChanges = repositoryHasChanges(status, compare)
  const open = choice === null ? hasChanges : choice === 'open'
  const label = repository.repositoryPath
    ? repository.repositoryPath
    : forkTranslate('fork.sourceControl.repo.root', 'This workspace')
  const branch = status?.branch
  // 上游把分支存成 refs/heads/…。栏目标题只显示短名，比较目标仍用完整 ref 当键。
  const branchLabel = branch?.startsWith('refs/heads/')
    ? branch.slice('refs/heads/'.length)
    : branch
  const summary = compare?.summary
  const ahead =
    summary?.status === 'ready' &&
    summary.commitsAhead !== undefined &&
    summary.commitsBehind !== undefined
      ? forkTranslate('fork.sourceControl.repo.aheadBehind', '{{ahead}} ahead, {{behind}} behind', {
          ahead: summary.commitsAhead,
          behind: summary.commitsBehind
        })
      : null
  const changeCount =
    status && !status.uninitialized
      ? forkTranslate('fork.sourceControl.repo.changeCount', '{{count}} changed', {
          count: status.entries.length
        })
      : null
  const areas = (['staged', 'unstaged', 'untracked'] as const).map((area) => ({
    area,
    entries: (status?.entries ?? []).filter((entry) => entry.area === area)
  }))
  const branchEntries = summary?.status === 'ready' ? (compare?.entries ?? []) : []
  // 上游删了 workspace-file-open。未提交走现在的打开入口，分支 diff 走 store；路径仍加上仓库相对前缀。
  const openUncommitted = (entry: GitStatusEntry): void => {
    openUncommittedEntry(useAppStore.getState(), worktreeId, worktreePath, {
      ...entry,
      path: rootRelative(repository.repositoryPath, entry.path)
    })
  }
  const openBranch = (entry: GitBranchChangeEntry): void => {
    if (
      !summary ||
      summary.status !== 'ready' ||
      !summary.baseOid ||
      !summary.headOid ||
      !summary.mergeBase
    ) {
      return
    }
    const path = rootRelative(repository.repositoryPath, entry.path)
    useAppStore.getState().openBranchDiff(
      worktreeId,
      worktreePath,
      {
        ...entry,
        path,
        ...(entry.oldPath
          ? { oldPath: rootRelative(repository.repositoryPath, entry.oldPath) }
          : {})
      },
      summary,
      detectLanguage(path)
    )
  }
  return (
    <section
      data-testid={SOURCE_CONTROL_REPO_TEST_ID}
      data-repository-path={repository.repositoryPath || '.'}
    >
      <div className="px-1 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto min-h-6 w-full justify-start gap-1 py-0.5 text-left font-semibold text-foreground/70"
          aria-expanded={open}
          onClick={() => setChoice(open ? 'closed' : 'open')}
        >
          <ChevronDown className={cn('size-3.5 shrink-0', !open && '-rotate-90')} />
          <span className="min-w-0 flex-1 truncate" title={label}>
            {label}
            {branchLabel ? ` · ${branchLabel}` : ''}
          </span>
          {changeCount ? (
            <span
              className="shrink-0 font-normal text-muted-foreground"
              data-testid={SOURCE_CONTROL_REPO_CHANGE_COUNT_TEST_ID}
            >
              {changeCount}
            </span>
          ) : null}
          {ahead ? (
            <span
              className="shrink-0 font-normal text-muted-foreground"
              data-testid={SOURCE_CONTROL_REPO_AHEAD_TEST_ID}
            >
              {ahead}
            </span>
          ) : null}
        </Button>
      </div>
      {open ? (
        <div className="pb-1">
          {status?.uninitialized ? (
            <p className="px-3 text-xs text-muted-foreground">
              {forkTranslate('fork.sourceControl.repo.uninitialized', 'Uninitialized submodule')}
            </p>
          ) : null}
          {!status?.uninitialized && status && !status.compareTarget.ref ? (
            <p className="px-3 text-xs text-muted-foreground">
              {forkTranslate('fork.sourceControl.repo.noCompareTarget', 'No compare target')}
            </p>
          ) : null}
          {areas.map((group) =>
            group.entries.length === 0 ? null : (
              <div key={group.area}>
                <p className="px-3 pt-1 text-xs font-medium text-foreground/70">
                  {groupLabel(group.area)}
                </p>
                {group.entries.map((entry) => (
                  <Button
                    key={`${group.area}:${entry.path}`}
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-auto w-full justify-start truncate px-3 py-0.5 text-left font-normal"
                    onClick={() => openUncommitted(entry)}
                  >
                    {entry.path}
                  </Button>
                ))}
              </div>
            )
          )}
          {branchEntries.length > 0 ? (
            <div>
              <p className="px-3 pt-1 text-xs font-medium text-foreground/70">
                {forkTranslate('fork.sourceControl.group.branch', 'Branch changes')}
              </p>
              {branchEntries.map((entry) => (
                <Button
                  key={`branch:${entry.path}`}
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-auto w-full justify-start truncate px-3 py-0.5 text-left font-normal"
                  onClick={() => openBranch(entry)}
                >
                  {entry.path}
                </Button>
              ))}
            </div>
          ) : null}
          {branch && !status?.uninitialized ? (
            <CompareTargetPicker
              current={status?.compareTarget.ref ?? null}
              onCommit={(ref) => onCommitTarget(repository.repositoryPath, branch, ref)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
