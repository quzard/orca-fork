import { describe, expect, it } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID, toSshExecutionHostId } from '../../shared/execution-host'
import { markSecondaryVaultHosts } from './host-menu'
import { indexStatusNeedsAttention, indexStatusPhase } from './index-status-lines'

describe('markSecondaryVaultHosts', () => {
  it('folds idle disconnected hosts and keeps the active, local, and connected ones', () => {
    const devbox = toSshExecutionHostId('devbox')
    const mini = toSshExecutionHostId('mini')
    const marked = markSecondaryVaultHosts(
      [
        { id: 'all', label: 'All' },
        { id: LOCAL_EXECUTION_HOST_ID, label: 'This computer' },
        { id: devbox, label: 'devbox' },
        { id: mini, label: 'mini' }
      ],
      {
        historyHostIds: new Set([devbox]),
        activeHostId: null,
        connectedSshTargetIds: new Set<string>()
      }
    )
    expect(marked.map((option) => [option.label, option.secondary ?? false])).toEqual([
      ['All', false],
      ['This computer', false],
      ['devbox', false],
      ['mini', true]
    ])
  })
})

describe('indexStatusPhase', () => {
  const base = {
    connected: true,
    indexingEnabled: true,
    local: true,
    failed: false,
    hostTooOld: false,
    statusEnabled: true as boolean | undefined,
    sweeping: false,
    ready: true,
    hasStatus: true
  }

  it('opens on an offline host, a failed read, and an index that is not ready', () => {
    expect(indexStatusPhase({ ...base, connected: false })).toBe('attention')
    expect(indexStatusPhase({ ...base, failed: true })).toBe('attention')
    expect(indexStatusPhase({ ...base, ready: false })).toBe('unknown')
    expect(indexStatusNeedsAttention('unknown', 0)).toBe(true)
    expect(indexStatusNeedsAttention('ready', 1)).toBe(true)
    expect(indexStatusNeedsAttention('ready', 0)).toBe(false)
  })

  it('keeps a sweeping index collapsed unless a detail line needs attention', () => {
    expect(indexStatusPhase({ ...base, sweeping: true, ready: false })).toBe('updating')
    expect(indexStatusNeedsAttention('updating', 0)).toBe(false)
  })
})
