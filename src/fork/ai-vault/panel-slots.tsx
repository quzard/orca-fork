import { useSyncExternalStore } from 'react'
import { ChevronsDownUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { requestAiVaultCollapseAll } from '../../shared/fork-hooks/ai-vault'
import { readAiVaultPanelStatus, subscribeAiVaultPanelStatus } from './panel-status'

const COLLAPSE_ALL_GROUPS_LABEL = 'Collapse all groups'
const SCANNING_HISTORY_LABEL = 'Scanning history…'
const HOST_COUNT_LABEL = '{{count}} hosts'

export function AiVaultCollapseAllButton(): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="size-6"
      aria-label={translate('fork.aiVault.collapseAll', COLLAPSE_ALL_GROUPS_LABEL)}
      onClick={() => requestAiVaultCollapseAll()}
    >
      <ChevronsDownUp className="size-3" />
    </Button>
  )
}

export function AiVaultHostStatus(): React.JSX.Element | null {
  const status = useSyncExternalStore(subscribeAiVaultPanelStatus, readAiVaultPanelStatus)
  if (status.loading) {
    return (
      <p className="border-b border-sidebar-border px-3 py-1 text-xs text-muted-foreground">
        {translate('fork.aiVault.scanning', SCANNING_HISTORY_LABEL)}
      </p>
    )
  }
  if (status.hostCount < 2) {
    return null
  }
  return (
    <p className="border-b border-sidebar-border px-3 py-1 text-xs text-muted-foreground">
      {translate('fork.aiVault.hostCount', HOST_COUNT_LABEL, { count: status.hostCount })}
    </p>
  )
}
