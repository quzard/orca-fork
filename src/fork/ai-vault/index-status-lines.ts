export type IndexStatusPhase = 'ready' | 'updating' | 'off' | 'attention' | 'checking' | 'unknown'

export function indexStatusPhase(args: {
  connected: boolean
  indexingEnabled: boolean
  local: boolean
  failed: boolean
  hostTooOld: boolean
  statusEnabled: boolean | undefined
  sweeping: boolean
  ready: boolean
  hasStatus: boolean
}): IndexStatusPhase {
  if (!args.connected || args.failed || args.hostTooOld) {
    return 'attention'
  }
  if ((args.local && !args.indexingEnabled) || args.statusEnabled === false) {
    return 'off'
  }
  if (!args.hasStatus) {
    return 'checking'
  }
  if (args.sweeping) {
    return 'updating'
  }
  if (!args.ready) {
    return 'unknown'
  }
  return 'ready'
}

export function indexStatusNeedsAttention(phase: IndexStatusPhase, detailCount: number): boolean {
  return phase === 'attention' || phase === 'unknown' || detailCount > 0
}
