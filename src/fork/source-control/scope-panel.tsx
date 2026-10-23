import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import type { SourceControlScopeModel } from '../../shared/fork-hooks/source-control-scope'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
  SOURCE_CONTROL_PANEL_TAB,
  SOURCE_CONTROL_SCOPE_CURRENT,
  SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID,
  SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID,
  SOURCE_CONTROL_SCOPE_WORKSPACE,
  SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID
} from '../git-workspace/constants'
import { forkTranslate } from '../i18n/fork-translate'
import {
  readSourceControlScope,
  writeSourceControlScope,
  type SourceControlScope
} from './scope-memory'
import { desktopGitRouteServesWorkspaceRepos } from './desktop-git-route'
import { WorkspaceRepositoriesView } from './workspace-view'

function useWorkspaceRepositoriesCapability(target: RuntimeClientTarget | null): boolean | null {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const [supported, setSupported] = useState<boolean | null>(environmentId ? null : Boolean(target))
  useEffect(() => {
    if (!target || target.kind === 'local') {
      setSupported(Boolean(target))
      return
    }
    let cancelled = false
    setSupported(null)
    void runtimeEnvironmentSupportsCapability(
      target.environmentId,
      FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
    ).then(
      (value) => {
        if (!cancelled) {
          setSupported(value)
        }
      },
      () => {
        if (!cancelled) {
          setSupported(false)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [environmentId, target])
  return supported
}

export function ForkSourceControlScope({
  upstream,
  model
}: {
  upstream: ReactNode
  model: SourceControlScopeModel
}): React.JSX.Element {
  const worktreeId = model.activeWorktree?.id ?? ''
  const target = model.activeRepoTarget ?? null
  const probed = useWorkspaceRepositoriesCapability(target)
  // 托管 SSH 的目标是 environment，请求发到那台主机的 orcad。桌面上的 ssh: 行扫不了磁盘。
  const routeBlocked =
    target?.kind !== 'environment' &&
    !desktopGitRouteServesWorkspaceRepos({
      executionHostId: model.activeRepoExecutionHostId,
      connectionId: model.activeConnectionId
    })
  const supported = routeBlocked ? false : probed
  const [scope, setScope] = useState<SourceControlScope>(() =>
    worktreeId ? readSourceControlScope(worktreeId) : SOURCE_CONTROL_SCOPE_CURRENT
  )
  useEffect(() => {
    setScope(worktreeId ? readSourceControlScope(worktreeId) : SOURCE_CONTROL_SCOPE_CURRENT)
  }, [worktreeId])
  const shown = supported === true ? scope : SOURCE_CONTROL_SCOPE_CURRENT
  const visible =
    model.rightSidebarTab === undefined || model.rightSidebarTab === SOURCE_CONTROL_PANEL_TAB
  const choose = (next: SourceControlScope): void => {
    if (supported !== true || !worktreeId) {
      return
    }
    writeSourceControlScope(worktreeId, next)
    setScope(next)
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <Button
          type="button"
          size="xs"
          variant={shown === SOURCE_CONTROL_SCOPE_CURRENT ? 'secondary' : 'ghost'}
          aria-pressed={shown === SOURCE_CONTROL_SCOPE_CURRENT}
          disabled={supported !== true}
          data-testid={SOURCE_CONTROL_SCOPE_CURRENT_TEST_ID}
          onClick={() => choose(SOURCE_CONTROL_SCOPE_CURRENT)}
        >
          {forkTranslate('fork.sourceControl.scope.current', 'Current repo')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={shown === SOURCE_CONTROL_SCOPE_WORKSPACE ? 'secondary' : 'ghost'}
          aria-pressed={shown === SOURCE_CONTROL_SCOPE_WORKSPACE}
          disabled={supported !== true}
          data-testid={SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}
          onClick={() => choose(SOURCE_CONTROL_SCOPE_WORKSPACE)}
        >
          {forkTranslate('fork.sourceControl.scope.workspace', 'Workspace repos')}
        </Button>
        {supported === false ? (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            data-testid={SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID}
          >
            {routeBlocked
              ? forkTranslate(
                  'fork.sourceControl.scope.remoteHost',
                  "This computer can't read nested repositories on an SSH host. Use that host's Orca."
                )
              : forkTranslate(
                  'fork.sourceControl.scope.updateHost',
                  'Update the host to compare nested repositories'
                )}
          </span>
        ) : null}
      </div>
      {shown === SOURCE_CONTROL_SCOPE_WORKSPACE && target && model.worktreePath ? (
        <WorkspaceRepositoriesView
          key={worktreeId}
          target={target}
          worktreeId={worktreeId}
          worktreePath={model.worktreePath}
          visible={visible}
        />
      ) : (
        upstream
      )}
    </div>
  )
}
