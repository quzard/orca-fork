import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { forkTranslate } from '../i18n/fork-translate'
import { useSessionSearchStatus } from '@/components/settings/use-session-search-status'
import {
  isSessionSearchIndexReady,
  isSweepingSessionSearch,
  sessionSearchCheckingMessage,
  sessionSearchReadErrorMessage,
  sessionSearchStatusDetails,
  sessionSearchStatusMessage
} from '@/components/settings/session-history-status-copy'
import {
  getExecutionHostLabel,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import { resolveAiVaultSearchSettings } from '../../shared/ai-vault-search-settings'
import { indexStatusNeedsAttention, indexStatusPhase } from './index-status-lines'
import { readAiVaultPanelStatus, subscribeAiVaultPanelStatus } from './panel-status'

const INDEX_STATUS_LABEL = 'Index status'

type IndexHost = { id: ExecutionHostId; label: string }

function useIndexHosts(): IndexHost[] {
  return useAppStore((state) => {
    const hosts: IndexHost[] = [
      {
        id: LOCAL_EXECUTION_HOST_ID,
        label: getExecutionHostLabel(LOCAL_EXECUTION_HOST_ID)
      }
    ]
    for (const [targetId, name] of state.sshTargetLabels) {
      const id = toSshExecutionHostId(targetId)
      hosts.push({ id, label: name.trim() || getExecutionHostLabel(id) })
    }
    for (const environment of state.runtimeEnvironments) {
      const id = toRuntimeExecutionHostId(environment.id)
      hosts.push({ id, label: environment.name || getExecutionHostLabel(id) })
    }
    return hosts
  })
}

function useHostConnected(id: ExecutionHostId): boolean {
  return useAppStore((state) => {
    const host = parseExecutionHostId(id)
    if (!host) {
      return false
    }
    if (host.kind === 'local') {
      return true
    }
    if (host.kind === 'ssh') {
      return state.sshConnectionStates.get(host.targetId)?.status === 'connected'
    }
    return (
      state.runtimeStatusByEnvironmentId.get(host.environmentId)?.snapshot?.transport === 'ready'
    )
  })
}

function IndexHostRow({
  id,
  label,
  onAttention
}: {
  id: ExecutionHostId
  label: string
  onAttention: (id: string, attention: boolean) => void
}): React.JSX.Element {
  const connected = useHostConnected(id)
  const indexingEnabled = useAppStore(
    (state) => resolveAiVaultSearchSettings(state.settings).enabled
  )
  const local = id === LOCAL_EXECUTION_HOST_ID
  const localOff = local && !indexingEnabled
  const { status, failed, hostTooOld } = useSessionSearchStatus({
    executionHostId: id,
    active: connected && !localOff
  })
  const listLoading = useSyncExternalStore(
    subscribeAiVaultPanelStatus,
    readAiVaultPanelStatus
  ).loading
  const phase = indexStatusPhase({
    connected,
    indexingEnabled,
    local,
    failed,
    hostTooOld,
    statusEnabled: status?.enabled,
    sweeping: isSweepingSessionSearch(status),
    ready: isSessionSearchIndexReady(status),
    hasStatus: status != null
  })
  const details = connected && !localOff ? sessionSearchStatusDetails(status) : []
  const attention = indexStatusNeedsAttention(phase, details.length)
  useEffect(() => {
    onAttention(id, attention)
    return () => onAttention(id, false)
  }, [attention, id, onAttention])
  let message = sessionSearchCheckingMessage()
  if (phase === 'attention' && !connected) {
    message = forkTranslate('fork.aiVault.indexOffline', 'Offline · index status unknown')
  } else if (phase === 'attention') {
    message = failed
      ? sessionSearchReadErrorMessage()
      : forkTranslate('fork.aiVault.indexUnavailable', 'Index status is unavailable on this host')
  } else if (phase === 'off') {
    message = forkTranslate('fork.aiVault.indexOff', 'Full-text indexing is off')
  } else if (phase === 'unknown') {
    message = forkTranslate(
      'fork.aiVault.indexNotReady',
      'Index is not ready · results may be incomplete'
    )
  } else if (status && (phase === 'updating' || phase === 'ready')) {
    message = sessionSearchStatusMessage(status)
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {listLoading ? (
        <p>{forkTranslate('fork.aiVault.listUpdating', 'History list is updating')}</p>
      ) : null}
      <p>{message}</p>
      {details.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

/** Per-host index lines. Collapsed until the user opens them or a host needs attention. */
export function AiVaultIndexStatus(): React.JSX.Element {
  const hosts = useIndexHosts()
  const [open, setOpen] = useState(false)
  const [attention, setAttention] = useState(false)
  const phases = useRef(new Map<string, boolean>())
  const onAttention = useCallback((id: string, next: boolean) => {
    if (phases.current.get(id) === next) {
      return
    }
    phases.current.set(id, next)
    const any = [...phases.current.values()].some(Boolean)
    setAttention((current) => (current === any ? current : any))
  }, [])
  const shown = open || attention
  const rows = hosts.map((host) => (
    <IndexHostRow key={host.id} id={host.id} label={host.label} onAttention={onAttention} />
  ))
  return (
    <div className="border-b border-sidebar-border px-3 py-1 text-xs text-muted-foreground">
      <button
        type="button"
        className="text-left text-foreground"
        aria-expanded={shown}
        onClick={() => setOpen((current) => !current)}
      >
        {forkTranslate('fork.aiVault.indexStatus', INDEX_STATUS_LABEL)}
      </button>
      <div hidden={!shown} className="space-y-1 pt-1">
        {rows}
      </div>
    </div>
  )
}
