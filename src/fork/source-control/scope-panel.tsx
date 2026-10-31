import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useSourceControlWorktreeContext } from '@/components/right-sidebar/source-control/listing/use-worktree-context'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY } from '../../shared/fork-hooks/git-workspace-capability'
import type { RuntimeClientTarget } from '../../shared/runtime-client-target'
import {
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

type HostSupport = 'checking' | 'supported' | 'unsupported' | 'unreachable'

// 主机连不上或还没更新时，面板开着就隔一会儿再探，重连或升级之后不用切换工作区。
const SUPPORT_RETRY_MS = 15_000

async function probeSupport(environmentId: string): Promise<HostSupport> {
  try {
    const supported = await runtimeEnvironmentSupportsCapability(
      environmentId,
      FORK_GIT_WORKSPACE_REPOSITORIES_CAPABILITY
    )
    return supported ? 'supported' : 'unsupported'
  } catch {
    return 'unreachable'
  }
}

// 本机桌面就是 fork 构建，视为支持。配对或托管主机按能力探测，旧主机不会收到新方法。
function useWorkspaceRepositoriesSupport(
  target: RuntimeClientTarget | null,
  visible: boolean
): HostSupport {
  const environmentId = target?.kind === 'environment' ? target.environmentId : null
  const [probe, setProbe] = useState<{ environmentId: string; support: HostSupport } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!environmentId || !visible) {
      return
    }
    let cancelled = false
    void probeSupport(environmentId).then((support) => {
      if (!cancelled) {
        setProbe({ environmentId, support })
      }
    })
    return () => {
      cancelled = true
    }
  }, [attempt, environmentId, visible])
  // 每次探测结果都是新对象，没成功就重新排一次下一轮。
  useEffect(() => {
    if (!visible || !probe || probe.support === 'supported') {
      return
    }
    const retry = setTimeout(() => setAttempt((value) => value + 1), SUPPORT_RETRY_MS)
    return () => clearTimeout(retry)
  }, [probe, visible])
  if (!target) {
    return 'unsupported'
  }
  if (target.kind === 'local') {
    return 'supported'
  }
  return probe?.environmentId === environmentId ? probe.support : 'checking'
}

function supportHint(routeBlocked: boolean, support: HostSupport): string | null {
  if (routeBlocked) {
    return forkTranslate(
      'fork.sourceControl.scope.remoteHost',
      "This SSH host isn't served by Orca's server yet. Reconnect it to see workspace repos."
    )
  }
  if (support === 'unsupported') {
    return forkTranslate(
      'fork.sourceControl.scope.updateHost',
      'Update the host to compare nested repositories'
    )
  }
  if (support === 'unreachable') {
    return forkTranslate(
      'fork.sourceControl.scope.unreachable',
      "Can't reach the host to check workspace repos."
    )
  }
  return null
}

export function ForkSourceControlScope({ upstream }: { upstream: ReactNode }): React.JSX.Element {
  // 和上游面板同一个来源：同一个工作区、同一条路由。
  const context = useSourceControlWorktreeContext()
  const worktreeId = context.activeWorktreeId ?? ''
  const target = context.activeRepoTarget
  // 托管 SSH 的目标是 environment，请求发到那台主机的 orcad。桌面上的 ssh: 行没有能跑 git 的主机。
  const routeBlocked =
    target !== null &&
    target.kind !== 'environment' &&
    !desktopGitRouteServesWorkspaceRepos({
      executionHostId: context.activeRepoExecutionHostId,
      connectionId: context.activeConnectionId
    })
  const support = useWorkspaceRepositoriesSupport(
    routeBlocked ? null : target,
    context.isBranchVisible
  )
  const supported = !routeBlocked && support === 'supported'
  const stored = useMemo(
    () => (worktreeId ? readSourceControlScope(worktreeId) : SOURCE_CONTROL_SCOPE_CURRENT),
    [worktreeId]
  )
  // 选择跟着工作区 id 走：换工作区的第一帧就用新工作区记住的范围，不会先按旧范围发请求。
  const [chosen, setChosen] = useState<{ worktreeId: string; scope: SourceControlScope } | null>(
    null
  )
  const scope = chosen?.worktreeId === worktreeId ? chosen.scope : stored
  const shown = supported ? scope : SOURCE_CONTROL_SCOPE_CURRENT
  const hint = target ? supportHint(routeBlocked, support) : null
  const choose = (next: SourceControlScope): void => {
    if (!supported || !worktreeId) {
      return
    }
    writeSourceControlScope(worktreeId, next)
    setChosen({ worktreeId, scope: next })
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <Button
          type="button"
          size="xs"
          variant={shown === SOURCE_CONTROL_SCOPE_CURRENT ? 'secondary' : 'ghost'}
          aria-pressed={shown === SOURCE_CONTROL_SCOPE_CURRENT}
          disabled={!supported}
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
          disabled={!supported}
          data-testid={SOURCE_CONTROL_SCOPE_WORKSPACE_TEST_ID}
          onClick={() => choose(SOURCE_CONTROL_SCOPE_WORKSPACE)}
        >
          {forkTranslate('fork.sourceControl.scope.workspace', 'Workspace repos')}
        </Button>
        {hint ? (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={hint}
            data-testid={SOURCE_CONTROL_SCOPE_UPDATE_HOST_TEST_ID}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {shown === SOURCE_CONTROL_SCOPE_WORKSPACE && target && context.worktreePath ? (
        <WorkspaceRepositoriesView
          key={worktreeId}
          target={target}
          worktreeId={worktreeId}
          worktreePath={context.worktreePath}
          visible={context.isBranchVisible}
        />
      ) : (
        upstream
      )}
    </div>
  )
}
