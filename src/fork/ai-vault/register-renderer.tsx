import { ALL_EXECUTION_HOSTS_SCOPE, parseExecutionHostId } from '../../shared/execution-host'
import {
  registerAiVaultCollapseNewGroups,
  registerAiVaultDefaultHostScope,
  registerAiVaultPanelSlot,
  registerVaultHostMenuDecoration
} from '../../shared/fork-hooks/ai-vault'
import { markSecondaryVaultHosts } from './host-menu'
import { registerAiVaultListPresentation } from './list-presentation'
import { AiVaultIndexStatus } from './index-status'
import { AiVaultCollapseAllButton, AiVaultHostStatus } from './panel-slots'

export function registerForkRendererModules(): void {
  registerAiVaultListPresentation()
  registerAiVaultCollapseNewGroups(true)
  registerAiVaultDefaultHostScope(ALL_EXECUTION_HOSTS_SCOPE)
  registerVaultHostMenuDecoration((options, context) =>
    markSecondaryVaultHosts(options, {
      historyHostIds: new Set(context.historyHostIds),
      activeHostId: parseExecutionHostId(context.activeHostId ?? '')?.id ?? null,
      connectedSshTargetIds: new Set(context.connectedSshTargetIds)
    })
  )
  registerAiVaultPanelSlot('header-actions', () => <AiVaultCollapseAllButton />)
  registerAiVaultPanelSlot('below-header', () => (
    <>
      <AiVaultHostStatus />
      <AiVaultIndexStatus />
    </>
  ))
}
