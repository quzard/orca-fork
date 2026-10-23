import { getRepoExecutionHostId, parseExecutionHostId } from '../../shared/execution-host'

// 只看 executionHostId 会把「只有 connectionId」的旧 SSH 行当成本机。
export function desktopGitRouteServesWorkspaceRepos(repo: {
  connectionId?: string | null
  executionHostId?: string | null
}): boolean {
  return parseExecutionHostId(getRepoExecutionHostId(repo))?.kind === 'local'
}
