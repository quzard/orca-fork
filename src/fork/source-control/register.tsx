import { registerSourceControlScope } from '../../shared/fork-hooks/source-control-scope'
import { registerWorkspaceRepositoryDiff } from '../../shared/fork-hooks/workspace-repository-diff'
import { readNestedRepositoryDiff } from './diff-read'
import { ForkSourceControlScope } from './scope-panel'

export function registerWorkspaceRepositorySourceControl(): void {
  registerSourceControlScope((upstream, model) => (
    <ForkSourceControlScope upstream={upstream} model={model} />
  ))
  registerWorkspaceRepositoryDiff(readNestedRepositoryDiff)
}
