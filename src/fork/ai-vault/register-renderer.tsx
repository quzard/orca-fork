import { ALL_EXECUTION_HOSTS_SCOPE } from '../../shared/execution-host'
import { registerAiVaultDefaultHostScope } from '../../shared/fork-hooks/ai-vault'
import { registerAiVaultListPresentation } from './list-presentation'

export function registerForkRendererModules(): void {
  registerAiVaultListPresentation()
  registerAiVaultDefaultHostScope(ALL_EXECUTION_HOSTS_SCOPE)
}
