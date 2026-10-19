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
import { isListedRemoteServer } from '../../shared/runtime-environments'
import { indexStatusNeedsAttention, indexStatusPhase } from './index-status-lines'
import { readAiVaultPanelStatus, subscribeAiVaultPanelStatus } from './panel-status'

const INDEX_STATUS_LABEL = 'Index status'

/** `reportedOnly`: drawn only while the host is connected and reports search turned on. */
type IndexHost = { id: ExecutionHostId; label: string; reportedOnly: boolean }

/**
 * The hosts the session search settings page lists: this computer and every paired Orca server
 * it lists (`isListedRemoteServer`). SSH targets are candidates only: a configured target that
 * was never connected, or whose search is off, has no index to report on, so its row stays
 * hidden until the host itself says search is on. The store is read through two stable
 * references and the list is built here: a selector that returns a new array on every call makes
 * zustand's useSyncExternalStore loop ("Maximum update depth exceeded", React #185).
 */
function useIndexHosts(): IndexHost[] {
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const hosts: IndexHost[] = [
    {
      id: LOCAL_EXECUTION_HOST_ID,
      label: getExecutionHostLabel(LOCAL_EXECUTION_HOST_ID),
      reportedOnly: false
    }
  ]
  for (const [targetId, name] of sshTargetLabels) {
    const id = toSshExecutionHostId(targetId)
    hosts.push({ id, label: name.trim() || getExecutionHostLabel(id), reportedOnly: true })
  }
  for (const environment of runtimeEnvironments) {
    if (!isListedRemoteServer(environment)) {
      continue
    }
    const id = toRuntimeExecutionHostId(environment.id)
    hosts.push({ id, label: environment.name || getExecutionHostLabel(id), reportedOnly: false })
  }
  return hosts
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
  reportedOnly,
  onAttention
}: {
  id: ExecutionHostId
  label: string
  reportedOnly: boolean
  onAttention: (id: string, attention: boolean) => void
}): React.JSX.Element | null {
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
    readAiVaultPanelStatus,
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
  // Once a connected host has said search is on, a later failed read stays visible as an error.
  // A disconnect forgets it, so a host that went away leaves the list again.
  const [reported, setReported] = useState(false)
  const reportsOn = connected && (reported || status?.enabled === true)
  if (reported !== reportsOn) {
    setReported(reportsOn)
  }
  const hidden = reportedOnly && !reportsOn
  const details = connected && !localOff ? sessionSearchStatusDetails(status) : []
  const attention = !hidden && indexStatusNeedsAttention(phase, details.length)
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
  if (hidden) {
    return null
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
    <IndexHostRow
      key={host.id}
      id={host.id}
      label={host.label}
      reportedOnly={host.reportedOnly}
      onAttention={onAttention}
    />
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
