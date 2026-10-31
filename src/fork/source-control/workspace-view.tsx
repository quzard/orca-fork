import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { GitBranchCompareResult } from '../../shared/git-diff-compare-types'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD,
  SOURCE_CONTROL_ONLY_CHANGED_TEST_ID,
  SOURCE_CONTROL_REPO_OTHER_TEST_ID
} from '../git-workspace/constants'
import type { WorkspaceRepositoryList, WorkspaceRepositoryStatus } from '../git-workspace/types'
import { forkTranslate } from '../i18n/fork-translate'
import { useWorkspaceRepositoryPoll } from './poll-workspace-repos'
import { orderWorkspaceRepositories, repositoryKnownUnchanged } from './repo-order'
import { WorkspaceRepoSection } from './repo-section'
import { callWorkspaceGit } from './rpc-client'
import { readOnlyShowChanged, writeOnlyShowChanged } from './scope-memory'

function UninitializedOtherGroup({ paths }: { paths: readonly string[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <section data-testid={SOURCE_CONTROL_REPO_OTHER_TEST_ID}>
      <div className="px-1 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto min-h-6 w-full justify-start gap-1 py-0.5 text-left font-semibold text-foreground/70"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className={cn('size-3.5 shrink-0', !open && '-rotate-90')} />
          <span className="min-w-0 flex-1 truncate">
            {forkTranslate('fork.sourceControl.repo.other', 'Other')}
          </span>
          <span className="shrink-0 font-normal text-muted-foreground">
            {forkTranslate('fork.sourceControl.repo.otherCount', '{{count}} uninitialized', {
              count: paths.length
            })}
          </span>
        </Button>
      </div>
      {open ? (
        <div className="pb-1">
          {paths.map((path) => (
            <p
              key={path}
              className="truncate px-3 py-0.5 text-xs text-muted-foreground"
              title={path}
            >
              {path}
              {' · '}
              {forkTranslate('fork.sourceControl.repo.uninitialized', 'Uninitialized submodule')}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function Note({ children }: { children: string }): React.JSX.Element {
  return <p className="px-3 text-xs text-muted-foreground">{children}</p>
}

export function WorkspaceRepositoryGroups({
  list,
  listError,
  statuses,
  compares,
  worktreeId,
  worktreePath,
  onCommitTarget,
  onRefresh
}: {
  list: WorkspaceRepositoryList | null
  listError: string | null
  statuses: Readonly<Record<string, WorkspaceRepositoryStatus>>
  compares: Readonly<Record<string, GitBranchCompareResult>>
  worktreeId: string
  worktreePath: string
  onCommitTarget: (repositoryPath: string, branch: string, ref: string | null) => Promise<void>
  onRefresh: () => void
}): React.JSX.Element {
  const [onlyChanged, setOnlyChanged] = useState(() => readOnlyShowChanged())
  const repositories = list?.repositories ?? []
  const ordered = orderWorkspaceRepositories(repositories, statuses, compares)
  const visible = onlyChanged
    ? ordered.filter(
        (repository) =>
          !repositoryKnownUnchanged(
            statuses[repository.repositoryPath],
            compares[repository.repositoryPath]
          )
      )
    : ordered
  const uninitialized = repositories
    .filter((repository) => repository.uninitialized)
    .map((repository) => repository.repositoryPath)
    .sort((left, right) => left.localeCompare(right))
  const showOther = !onlyChanged && uninitialized.length > 0
  const noVisibleChanges =
    list !== null && list.repositories.length > 0 && onlyChanged && visible.length === 0
  const toggleOnlyChanged = (): void => {
    const next = !onlyChanged
    writeOnlyShowChanged(next)
    setOnlyChanged(next)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-1 px-2">
        <Button
          type="button"
          size="xs"
          variant={onlyChanged ? 'secondary' : 'ghost'}
          aria-pressed={onlyChanged}
          data-testid={SOURCE_CONTROL_ONLY_CHANGED_TEST_ID}
          onClick={toggleOnlyChanged}
        >
          {forkTranslate('fork.sourceControl.onlyChanged', 'Only show changed')}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onRefresh}>
          {forkTranslate('fork.sourceControl.refresh', 'Refresh')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {listError ? (
          <Note>
            {forkTranslate(
              'fork.sourceControl.listError',
              "Couldn't list repositories: {{error}}",
              {
                error: listError
              }
            )}
          </Note>
        ) : null}
        {list?.truncated ? (
          <Note>
            {forkTranslate('fork.sourceControl.truncated', 'Some repositories were not listed.')}
          </Note>
        ) : null}
        {list?.timedOut ? (
          <Note>
            {forkTranslate('fork.sourceControl.timedOut', 'Repository search timed out.')}
          </Note>
        ) : null}
        {!list && !listError ? (
          <Note>{forkTranslate('fork.sourceControl.loading', 'Looking for repositories…')}</Note>
        ) : null}
        {list && list.repositories.length === 0 ? (
          <Note>
            {forkTranslate('fork.sourceControl.empty', 'No git repositories in this workspace.')}
          </Note>
        ) : null}
        {noVisibleChanges ? (
          <Note>
            {forkTranslate('fork.sourceControl.noChanges', 'No repositories with changes.')}
          </Note>
        ) : null}
        {visible.map((repository) => (
          <WorkspaceRepoSection
            key={repository.repositoryPath || '.'}
            repository={repository}
            status={statuses[repository.repositoryPath]}
            compare={compares[repository.repositoryPath]}
            worktreeId={worktreeId}
            worktreePath={worktreePath}
            onCommitTarget={onCommitTarget}
          />
        ))}
        {showOther ? <UninitializedOtherGroup paths={uninitialized} /> : null}
      </div>
    </div>
  )
}

export function WorkspaceRepositoriesView({
  target,
  worktreeId,
  worktreePath,
  visible
}: {
  target: RuntimeClientTarget
  worktreeId: string
  worktreePath: string
  visible: boolean
}): React.JSX.Element {
  const [refreshToken, setRefreshToken] = useState(0)
  const [nudgeToken, setNudgeToken] = useState(0)
  const poll = useWorkspaceRepositoryPoll({
    enabled: visible,
    target,
    worktreeId,
    refreshToken,
    nudgeToken
  })
  const worktree = toRuntimeWorktreeSelector(worktreeId)
  // 失败交给比较目标输入框显示，草稿留着。成功后马上跑一轮：目标变了，这个仓库会重比。
  const commitTarget = async (
    repositoryPath: string,
    branch: string,
    ref: string | null
  ): Promise<void> => {
    await callWorkspaceGit(target, FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD, {
      worktree,
      repositoryPath,
      branch,
      ref
    })
    setNudgeToken((value) => value + 1)
  }
  return (
    <WorkspaceRepositoryGroups
      list={poll.list}
      listError={poll.listError}
      statuses={poll.statuses}
      compares={poll.compares}
      worktreeId={worktreeId}
      worktreePath={worktreePath}
      onCommitTarget={commitTarget}
      onRefresh={() => setRefreshToken((value) => value + 1)}
    />
  )
}
