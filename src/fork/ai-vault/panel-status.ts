export type AiVaultPanelStatus = {
  loading: boolean
  sessionCount: number
  hostCount: number
}

const listeners = new Set<() => void>()
let current: AiVaultPanelStatus = { loading: false, sessionCount: 0, hostCount: 0 }

export function publishAiVaultPanelStatus(next: AiVaultPanelStatus): void {
  if (
    current.loading === next.loading &&
    current.sessionCount === next.sessionCount &&
    current.hostCount === next.hostCount
  ) {
    return
  }
  current = next
  for (const listener of listeners) {
    listener()
  }
}

export function readAiVaultPanelStatus(): AiVaultPanelStatus {
  return current
}

export function subscribeAiVaultPanelStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetAiVaultPanelStatusForTests(): void {
  current = { loading: false, sessionCount: 0, hostCount: 0 }
  listeners.clear()
}
