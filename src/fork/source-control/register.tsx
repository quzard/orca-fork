import { registerSourceControlScope } from '../../shared/fork-hooks/source-control-scope'
import { registerWorkspaceRepositoryDiff } from '../../shared/fork-hooks/workspace-repository-diff'
import { readNestedRepositoryDiff } from './diff-read'
import { ForkSourceControlScope } from './scope-panel'

export function registerWorkspaceRepositorySourceControl(): void {
  registerSourceControlScope((upstream) => <ForkSourceControlScope upstream={upstream} />)
  registerWorkspaceRepositoryDiff(readNestedRepositoryDiff)
}
