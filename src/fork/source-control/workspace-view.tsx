import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import { FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD } from '../git-workspace/constants'
import { forkTranslate } from '../i18n/fork-translate'
import { useWorkspaceRepositoryPoll } from './poll-workspace-repos'
import { WorkspaceRepoSection } from './repo-section'
import { callWorkspaceGit } from './rpc-client'

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
  const poll = useWorkspaceRepositoryPoll({
    enabled: visible,
    target,
    worktreeId,
    refreshToken
  })
  const worktree = toRuntimeWorktreeSelector(worktreeId)
  const commitTarget = (repositoryPath: string, branch: string, ref: string | null): void => {
    // 拒绝的 ref 留在输入框里，不刷新，避免把还没写上的目标显示成已保存。
    void callWorkspaceGit(target, FORK_GIT_WORKSPACE_SET_COMPARE_TARGET_METHOD, {
      worktree,
      repositoryPath,
      branch,
      ref
    }).then(
      () => setRefreshToken((value) => value + 1),
      () => undefined
    )
  }
  const list = poll.list
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end px-2">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => setRefreshToken((value) => value + 1)}
        >
          {forkTranslate('fork.sourceControl.refresh', 'Refresh')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {list?.truncated ? (
          <p className="px-3 text-xs text-muted-foreground">
            {forkTranslate('fork.sourceControl.truncated', 'Some repositories were not listed.')}
          </p>
        ) : null}
        {list?.timedOut ? (
          <p className="px-3 text-xs text-muted-foreground">
            {forkTranslate('fork.sourceControl.timedOut', 'Repository search timed out.')}
          </p>
        ) : null}
        {!list ? (
          <p className="px-3 text-xs text-muted-foreground">
            {forkTranslate('fork.sourceControl.loading', 'Looking for repositories…')}
          </p>
        ) : null}
        {list && list.repositories.length === 0 ? (
          <p className="px-3 text-xs text-muted-foreground">
            {forkTranslate('fork.sourceControl.empty', 'No git repositories in this workspace.')}
          </p>
        ) : null}
        {list?.repositories.map((repository) => (
          <WorkspaceRepoSection
            key={repository.repositoryPath || '.'}
            repository={repository}
            status={poll.statuses[repository.repositoryPath]}
            compare={poll.compares[repository.repositoryPath]}
            worktreeId={worktreeId}
            worktreePath={worktreePath}
            onCommitTarget={commitTarget}
          />
        ))}
      </div>
    </div>
  )
}
